import fs from 'node:fs';
import { Types } from 'mongoose';
import type { Request } from 'express';
import { Document as DocumentModel, DigitalFile } from '../models/file';
import { Grievance } from '../models/grievance';
import { Application } from '../models/application';
import { Meeting } from '../models/meeting';
import { Incident } from '../models/disaster';
import { RoadDamageReport } from '../models/infrastructure';
import { AppError } from '../middleware/error';
import {
  assertApplicationAccess,
  assertDocumentAccess,
  assertFileAccess,
  assertGrievanceAccess,
} from './access.service';
import { checksumFileSync, removeStoredFile, resolveStoragePath, toRelativeStoragePath } from './storage.service';
import { addTimeline } from './timeline.service';
import { recordAudit } from './audit.service';
import { getOcrResult, processDocumentOcr, verifyOcr } from './ocr.service';
import { buildPageMeta, parsePagination } from '../utils/pagination';
import type { DocumentEntityType } from '../types/domain';

const ENTITY_TYPES: DocumentEntityType[] = [
  'GRIEVANCE',
  'FILE',
  'APPLICATION',
  'MEETING',
  'INCIDENT',
  'ROAD_REPORT',
  'USER',
  'OTHER',
];

const MAGIC_PREFIXES: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
];

function hasMagicBytes(path: string, mime: string): boolean {
  const descriptor = fs.openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(12);
    fs.readSync(descriptor, buffer, 0, 12, 0);
    if (mime === 'image/webp') {
      return buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP';
    }
    const expected = MAGIC_PREFIXES.find((item) => item.mime === mime);
    if (!expected) return false;
    return expected.bytes.every((byte, index) => buffer[index] === byte);
  } finally {
    fs.closeSync(descriptor);
  }
}

async function assertEntityUploadAccess(req: Request, entityType: DocumentEntityType, entityId: string) {
  const user = req.user!;
  switch (entityType) {
    case 'GRIEVANCE': {
      const grievance = await Grievance.findById(entityId).select('citizen department status').lean();
      if (!grievance) throw new AppError(404, 'Grievance not found', 'NOT_FOUND');
      assertGrievanceAccess(req, grievance);
      if (user.role === 'CITIZEN' && ['RESOLVED', 'CLOSED', 'REJECTED'].includes(grievance.status)) {
        throw new AppError(409, 'Closed grievances cannot accept new documents', 'INVALID_STATUS');
      }
      return;
    }
    case 'FILE': {
      const file = await DigitalFile.findById(entityId).select('department confidentiality').lean();
      if (!file) throw new AppError(404, 'File not found', 'NOT_FOUND');
      assertFileAccess(req, file);
      if (!user.permissions.includes('file.upload') && user.role !== 'CITIZEN') {
        throw new AppError(403, 'You cannot upload file documents', 'FORBIDDEN_PERMISSION');
      }
      return;
    }
    case 'APPLICATION': {
      const application = await Application.findById(entityId).select('citizen department status').lean();
      if (!application) throw new AppError(404, 'Application not found', 'NOT_FOUND');
      assertApplicationAccess(req, application);
      return;
    }
    case 'MEETING': {
      if (!user.permissions.includes('meeting.minutes.draft') && !user.permissions.includes('meeting.create')) {
        throw new AppError(403, 'You cannot upload meeting documents', 'FORBIDDEN_PERMISSION');
      }
      const meeting = await Meeting.findById(entityId).select('organizer department').lean();
      if (!meeting) throw new AppError(404, 'Meeting not found', 'NOT_FOUND');
      return;
    }
    case 'INCIDENT': {
      if (!user.permissions.includes('incident.update') && !user.permissions.includes('incident.create')) {
        throw new AppError(403, 'You cannot upload incident documents', 'FORBIDDEN_PERMISSION');
      }
      return;
    }
    case 'ROAD_REPORT': {
      const report = await RoadDamageReport.findById(entityId).select('createdBy assignedDepartment').lean();
      if (!report) throw new AppError(404, 'Road report not found', 'NOT_FOUND');
      return;
    }
    case 'USER': {
      if (entityId !== user.id && !user.permissions.includes('user.update')) {
        throw new AppError(403, 'You cannot upload documents for this user', 'FORBIDDEN_SCOPE');
      }
      return;
    }
    default:
      if (!user.permissions.includes('file.upload')) {
        throw new AppError(403, 'You cannot upload documents', 'FORBIDDEN_PERMISSION');
      }
  }
}

async function linkDocumentToEntity(
  entityType: DocumentEntityType,
  entityId: string,
  documentId: Types.ObjectId,
) {
  switch (entityType) {
    case 'GRIEVANCE':
      await Grievance.updateOne({ _id: entityId }, { $push: { attachments: documentId } });
      break;
    case 'FILE':
      await DigitalFile.updateOne({ _id: entityId }, { $push: { attachments: documentId } });
      break;
    case 'APPLICATION':
      await Application.updateOne({ _id: entityId }, { $push: { documents: documentId } });
      break;
    case 'MEETING':
      await Meeting.updateOne({ _id: entityId }, { $set: { recordingDocument: documentId } });
      break;
    case 'INCIDENT':
      await Incident.updateOne({ _id: entityId }, { $push: { documents: documentId } });
      break;
    case 'ROAD_REPORT':
      await RoadDamageReport.updateOne({ _id: entityId }, { $push: { documents: documentId } });
      break;
    default:
      break;
  }
}

export async function uploadEntityDocuments(
  req: Request,
  input: { entityType: DocumentEntityType; entityId: string; category?: string },
  files: Express.Multer.File[],
) {
  if (!ENTITY_TYPES.includes(input.entityType)) {
    throw new AppError(422, 'Invalid document entity type', 'VALIDATION_ERROR');
  }
  if (!/^[a-f\d]{24}$/i.test(input.entityId)) {
    throw new AppError(422, 'Invalid document entity identifier', 'VALIDATION_ERROR');
  }
  if (files.length === 0) throw new AppError(422, 'Select at least one file to upload', 'VALIDATION_ERROR');

  const cleanup = () => {
    for (const file of files) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // file already removed
      }
    }
  };

  try {
    await assertEntityUploadAccess(req, input.entityType, input.entityId);

    let confidentiality = 'INTERNAL';
    let department: string | null = req.user!.department ?? null;
    if (input.entityType === 'FILE') {
      const file = await DigitalFile.findById(input.entityId).select('confidentiality department').lean();
      confidentiality = file?.confidentiality ?? 'INTERNAL';
      department = file?.department ? String(file.department) : department;
    }
    if (confidentiality === 'RESTRICTED' && !req.user!.permissions.includes('file.read.confidential')) {
      throw new AppError(403, 'You cannot attach documents to a restricted file', 'FORBIDDEN_CONFIDENTIAL');
    }

    const created: Array<{ id: string; originalName: string; size: number; mimeType: string }> = [];
    for (const file of files) {
      if (!hasMagicBytes(file.path, file.mimetype)) {
        throw new AppError(415, `The content of ${file.originalname} does not match its file type`, 'UNSUPPORTED_FILE_TYPE');
      }
      const document = await DocumentModel.create({
        originalName: file.originalname.slice(0, 300),
        storedName: file.filename,
        storagePath: toRelativeStoragePath(file.path),
        mimeType: file.mimetype,
        size: file.size,
        checksum: checksumFileSync(file.path),
        category: input.category,
        confidentiality: confidentiality as never,
        entityType: input.entityType,
        entityId: new Types.ObjectId(input.entityId),
        uploadedBy: new Types.ObjectId(req.user!.id),
        department: department ? new Types.ObjectId(department) : null,
        ocrStatus: 'PENDING',
      });
      await linkDocumentToEntity(input.entityType, input.entityId, document._id as Types.ObjectId);
      created.push({
        id: String(document._id),
        originalName: document.originalName,
        size: document.size,
        mimeType: document.mimeType,
      });

      await recordAudit(req, {
        action: 'DOCUMENT_UPLOADED',
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: document.originalName,
        after: {
          documentId: String(document._id),
          size: document.size,
          mimeType: document.mimeType,
        },
      });
    }

    await addTimeline({
      entityType: input.entityType === 'ROAD_REPORT' ? 'ROAD_REPORT' : (input.entityType as never),
      entityId: input.entityId,
      action: 'DOCUMENT_UPLOADED',
      actor: req.user!.id,
      visibility: req.user!.role === 'CITIZEN' ? 'PUBLIC' : 'INTERNAL',
      message: `${created.length} document(s) uploaded`,
    });

    return created;
  } catch (error) {
    cleanup();
    throw error;
  }
}

export async function listMyDocuments(req: Request) {
  const query = req.validatedQuery as {
    page: number;
    limit: number;
    q?: string;
    entityType?: string;
  };
  const pagination = parsePagination(query as Record<string, unknown>);
  const userId = req.user!.id;

  const [grievances, applications] = await Promise.all([
    Grievance.find({ citizen: userId }).select('_id').lean(),
    Application.find({ citizen: userId }).select('_id').lean(),
  ]);

  const accessClauses: Record<string, unknown>[] = [{ uploadedBy: userId }];
  if (grievances.length > 0) {
    accessClauses.push({
      entityType: 'GRIEVANCE',
      entityId: { $in: grievances.map((item) => item._id) },
    });
  }
  if (applications.length > 0) {
    accessClauses.push({
      entityType: 'APPLICATION',
      entityId: { $in: applications.map((item) => item._id) },
    });
  }

  const filter: Record<string, unknown> = { deletedAt: null, $or: accessClauses };
  if (query.entityType) filter.entityType = query.entityType;
  if (query.q) {
    const pattern = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [{ $or: [{ originalName: pattern }, { category: pattern }] }];
  }

  const [items, total] = await Promise.all([
    DocumentModel.find(filter as never)
      .populate('uploadedBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    DocumentModel.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function listEntityDocuments(req: Request, entityType: string, entityId: string) {  if (!ENTITY_TYPES.includes(entityType as DocumentEntityType)) {
    throw new AppError(422, 'Invalid document entity type', 'VALIDATION_ERROR');
  }
  const pagination = parsePagination(req.validatedQuery as Record<string, unknown>);
  const documents = await DocumentModel.find({
    entityType,
    entityId,
    deletedAt: null,
  } as never)
    .populate('uploadedBy', 'name role')
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  for (const document of documents) {
    await assertDocumentAccess(req, document as never);
  }

  const total = await DocumentModel.countDocuments({ entityType, entityId, deletedAt: null } as never);
  return { items: documents, meta: buildPageMeta(total, pagination) };
}

export async function getDocumentForDownload(req: Request, documentId: string) {
  const document = await DocumentModel.findOne({ _id: documentId, deletedAt: null }).lean();
  if (!document) throw new AppError(404, 'Document not found', 'NOT_FOUND');
  await assertDocumentAccess(req, document as never);
  return { document, absolutePath: resolveStoragePath(document.storagePath) };
}

export async function deleteDocument(req: Request, documentId: string) {
  const document = await DocumentModel.findById(documentId);
  if (!document || document.deletedAt) throw new AppError(404, 'Document not found', 'NOT_FOUND');
  const isOwner = String(document.uploadedBy) === req.user!.id;
  if (!isOwner && !req.user!.permissions.includes('user.update') && req.user!.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'You cannot delete this document', 'FORBIDDEN_PERMISSION');
  }

  document.deletedAt = new Date();
  await document.save();
  await removeStoredFile(document.storagePath).catch(() => undefined);

  await recordAudit(req, {
    action: 'DOCUMENT_DELETED',
    entityType: document.entityType,
    entityId: String(document.entityId),
    entityLabel: document.originalName,
    before: { documentId: String(document._id) },
  });

  return { deleted: true };
}

export async function runOcr(req: Request, documentId: string) {
  const document = await DocumentModel.findOne({ _id: documentId, deletedAt: null }).lean();
  if (!document) throw new AppError(404, 'Document not found', 'NOT_FOUND');
  await assertDocumentAccess(req, document as never);
  const result = await processDocumentOcr(documentId);
  await recordAudit(req, {
    action: 'OCR_PROCESSED',
    entityType: document.entityType,
    entityId: String(document.entityId),
    entityLabel: document.originalName,
    after: { ocrStatus: (result as { status?: string }).status },
  });
  return result;
}

export async function fetchOcr(req: Request, documentId: string) {
  const document = await DocumentModel.findOne({ _id: documentId, deletedAt: null }).lean();
  if (!document) throw new AppError(404, 'Document not found', 'NOT_FOUND');
  await assertDocumentAccess(req, document as never);
  const result = await getOcrResult(documentId);
  if (!result) throw new AppError(404, 'OCR result not available', 'NOT_FOUND');
  return result;
}

export async function verifyDocumentOcr(
  req: Request,
  documentId: string,
  input: {
    extractedText?: string;
    fields?: { name?: string; referenceNumber?: string; date?: string; address?: string };
  },
) {
  const document = await DocumentModel.findOne({ _id: documentId, deletedAt: null }).lean();
  if (!document) throw new AppError(404, 'Document not found', 'NOT_FOUND');
  await assertDocumentAccess(req, document as never);
  const result = await verifyOcr(documentId, { ...input, verifiedBy: req.user!.id });
  await recordAudit(req, {
    action: 'OCR_VERIFIED',
    entityType: document.entityType,
    entityId: String(document.entityId),
    entityLabel: document.originalName,
  });
  return result;
}
