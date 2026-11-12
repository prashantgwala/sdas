import QRCode from 'qrcode';
import { Types } from 'mongoose';
import type { Request } from 'express';
import { FILE_STATUSES, type FileStatus, type Priority } from '../config/constants';
import { DigitalFile, FileCategory, FileMovement, FileNote } from '../models/file';
import { Department } from '../models/org';
import { User } from '../models/user';
import { AppError } from '../middleware/error';
import { assertFileAccess, fileListFilter } from './access.service';
import { getPermissionsForRole } from './permission.service';
import { addTimeline } from './timeline.service';
import { recordAudit } from './audit.service';
import { notifyUsers } from './notification.service';
import { calculateDueDate, slaStatusFor } from './sla.service';
import { hashToken, signQrPayload, verifyQrPayload } from '../utils/crypto';
import { nextSequence } from '../utils/ids';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type { z } from 'zod';
import type {
  archiveFileSchema,
  createFileSchema,
  dispatchFileSchema,
  fileDecisionSchema,
  fileListQuery,
  fileNoteSchema,
  finalizeFileSchema,
  receiveFileSchema,
  updateFileSchema,
} from '../validators/file';

type Input<T> = z.infer<T>;

const TERMINAL_FILE_STATUSES: FileStatus[] = ['COMPLETED', 'ARCHIVED'];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadFile(id: string) {
  const file = await DigitalFile.findById(id);
  if (!file) throw new AppError(404, 'File not found', 'NOT_FOUND');
  return file;
}

function canSupervise(req: Request): boolean {
  return req.user!.role === 'DEPARTMENT_HEAD' || req.user!.role === 'DISTRICT_ADMIN';
}

async function assertCustodianOrSupervisor(req: Request, file: { currentCustodian?: unknown; createdBy?: unknown }) {
  const userId = req.user!.id;
  if (String(file.currentCustodian ?? '') === userId) return;
  if (String(file.createdBy ?? '') === userId) return;
  if (canSupervise(req)) return;
  throw new AppError(403, 'Only the current custodian can perform this action', 'FORBIDDEN_SCOPE');
}

export async function registerFile(input: Input<typeof createFileSchema>, req: Request) {
  const user = req.user!;
  const departmentId = input.department ?? user.department ?? null;
  if (!departmentId) {
    throw new AppError(422, 'Select the owning department', 'DEPARTMENT_REQUIRED');
  }
  const department = await Department.findOne({ _id: departmentId, active: true }).lean();
  if (!department) throw new AppError(404, 'Department not found', 'NOT_FOUND');

  const category = input.category
    ? await FileCategory.findOne({ _id: input.category, active: true }).lean()
    : null;
  const confidentiality = input.confidentiality ?? category?.defaultConfidentiality ?? 'INTERNAL';
  if (confidentiality === 'CONFIDENTIAL' && !user.permissions.includes('file.read.confidential')) {
    throw new AppError(403, 'You cannot register confidential files', 'FORBIDDEN_CONFIDENTIAL');
  }
  if (confidentiality === 'RESTRICTED' && !user.permissions.includes('security.manage')) {
    throw new AppError(403, 'Restricted file registration requires security administration permission', 'FORBIDDEN_RESTRICTED');
  }

  const [fileId, fileNumber] = await Promise.all([nextSequence('FID'), nextSequence('FILE')]);
  const { dueAt } = await calculateDueDate('FILE', null, input.priority as Priority, new Date());

  const file = await DigitalFile.create({
    fileId,
    fileNumber,
    subject: input.subject,
    description: input.description,
    department: department._id,
    originatingOffice: input.originatingOffice ?? null,
    createdBy: user.id,
    category: category?._id ?? null,
    priority: input.priority,
    confidentiality,
    status: 'REGISTERED',
    currentCustodian: user.id,
    currentLocation: department.name,
    sla: {
      dueAt,
      status: slaStatusFor(dueAt),
      assignedAt: new Date(),
    },
    retentionDays: input.retentionDays ?? null,
  });

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: 'REGISTERED',
    toStatus: 'REGISTERED',
    actor: user.id,
    visibility: 'INTERNAL',
    message: `File ${fileNumber} registered`,
  });
  await recordAudit(req, {
    action: 'FILE_REGISTERED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: fileNumber,
    after: { subject: input.subject, department: String(department._id), confidentiality },
  });

  return file.toObject();
}

export async function updateFile(id: string, input: Input<typeof updateFileSchema>, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  await assertCustodianOrSupervisor(req, file);

  if (
    input.confidentiality &&
    ['CONFIDENTIAL', 'RESTRICTED'].includes(input.confidentiality) &&
    !req.user!.permissions.includes('file.read.confidential')
  ) {
    throw new AppError(403, 'You cannot raise the confidentiality of this file', 'FORBIDDEN_CONFIDENTIAL');
  }
  if (input.confidentiality === 'RESTRICTED' && !req.user!.permissions.includes('security.manage')) {
    throw new AppError(403, 'Restricted classification requires security administration permission', 'FORBIDDEN_RESTRICTED');
  }

  const before = {
    subject: file.subject,
    priority: file.priority,
    confidentiality: file.confidentiality,
    category: String(file.category ?? ''),
  };

  if (input.subject !== undefined) file.subject = input.subject;
  if (input.description !== undefined) file.description = input.description;
  if (input.category !== undefined) {
    file.category = input.category ? new Types.ObjectId(input.category) : null;
  }
  if (input.priority) {
    file.priority = input.priority;
    const { dueAt } = await calculateDueDate('FILE', null, input.priority as Priority, new Date());
    file.sla.dueAt = dueAt;
    file.sla.status = slaStatusFor(dueAt) as never;
  }
  if (input.confidentiality) file.confidentiality = input.confidentiality;
  if (input.currentLocation !== undefined) file.currentLocation = input.currentLocation;
  if (input.retentionDays !== undefined) file.retentionDays = input.retentionDays;
  await file.save();

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: 'UPDATED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: 'File details updated',
  });
  await recordAudit(req, {
    action: 'FILE_UPDATED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: file.fileNumber,
    before,
    after: {
      subject: file.subject,
      priority: file.priority,
      confidentiality: file.confidentiality,
      category: String(file.category ?? ''),
    },
  });

  return file.toObject();
}

export async function generateQr(id: string, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  if (TERMINAL_FILE_STATUSES.includes(file.status as FileStatus)) {
    throw new AppError(409, 'QR codes cannot be regenerated for closed files', 'INVALID_STATUS');
  }

  const version = (file.qrVersion ?? 0) + 1;
  const token = signQrPayload(String(file._id), version);
  file.qrTokenHash = hashToken(token);
  file.qrVersion = version;
  file.qrGeneratedAt = new Date();
  if (file.status === 'REGISTERED' || file.status === 'DOCUMENTS_UPLOADED') {
    file.status = 'QR_GENERATED';
  }
  await file.save();

  const dataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 360,
    color: { dark: '#101E35', light: '#FFFFFF' },
  });

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: 'QR_GENERATED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `QR code generated (version ${version})`,
  });
  await recordAudit(req, {
    action: 'FILE_QR_GENERATED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: file.fileNumber,
    after: { version },
  });

  return { token, dataUrl, version, generatedAt: file.qrGeneratedAt };
}

export async function getQrImage(id: string, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  if (!file.qrVersion) throw new AppError(404, 'QR code has not been generated for this file', 'NOT_FOUND');
  const token = signQrPayload(String(file._id), file.qrVersion);
  return QRCode.toBuffer(token, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 360,
    color: { dark: '#101E35', light: '#FFFFFF' },
  });
}

export async function verifyQrScan(token: string, req: Request) {
  const payload = verifyQrPayload(token);
  if (!payload) throw new AppError(400, 'Invalid or tampered QR code', 'INVALID_QR');
  const file = await DigitalFile.findOne({
    _id: payload.fileId,
    qrVersion: payload.version,
    qrTokenHash: hashToken(token),
  });
  if (!file) throw new AppError(404, 'QR code does not match any active file', 'INVALID_QR');
  assertFileAccess(req, file);
  return file.toObject();
}

export async function dispatchFile(id: string, input: Input<typeof dispatchFileSchema>, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  if (TERMINAL_FILE_STATUSES.includes(file.status as FileStatus)) {
    throw new AppError(409, 'Closed files cannot be dispatched', 'INVALID_STATUS');
  }
  if (String(file.currentCustodian ?? '') !== req.user!.id && !canSupervise(req)) {
    throw new AppError(403, 'Only the current custodian can dispatch this file', 'FORBIDDEN_SCOPE');
  }

  const target = await User.findOne({ _id: input.toUser, status: 'ACTIVE' })
    .select('name role department email')
    .lean();
  if (!target || target.role === 'CITIZEN') {
    throw new AppError(422, 'Select an active government user as recipient', 'INVALID_RECIPIENT');
  }
  if (String(target._id) === req.user!.id) {
    throw new AppError(422, 'A file cannot be dispatched to its current custodian', 'INVALID_RECIPIENT');
  }
  if (file.confidentiality === 'CONFIDENTIAL') {
    const targetPermissions = await getPermissionsForRole(target.role);
    if (!targetPermissions.includes('file.read.confidential')) {
      throw new AppError(422, 'The recipient is not authorised for confidential files', 'FORBIDDEN_CONFIDENTIAL');
    }
  }
  if (file.confidentiality === 'RESTRICTED') {
    throw new AppError(403, 'Restricted files cannot be dispatched through the standard workflow', 'FORBIDDEN_RESTRICTED');
  }

  const movementNumber = await nextSequence('MOV');
  const now = new Date();
  const movement = await FileMovement.create({
    file: file._id,
    movementNumber,
    fromUser: req.user!.id,
    toUser: target._id,
    fromDepartment: file.department,
    toDepartment: target.department ?? file.department,
    dispatchedAt: now,
    actionRequired: input.actionRequired,
    remarks: input.remarks,
    status: 'DISPATCHED',
  });

  file.currentCustodian = target._id as Types.ObjectId;
  file.status = 'DISPATCHED';
  await file.save();

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: 'DISPATCHED',
    fromStatus: 'UNDER_REVIEW',
    toStatus: 'DISPATCHED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `Dispatched to ${target.name} for ${input.actionRequired.toLowerCase()}`,
    metadata: { movementId: String(movement._id), movementNumber },
  });

  await notifyUsers([String(target._id)], {
    type: 'FILE_RECEIVED',
    title: `File ${file.fileNumber} dispatched to you`,
    body: `${file.subject} — ${input.actionRequired.toLowerCase()} required${input.remarks ? `: ${input.remarks}` : ''}`,
    entityType: 'File',
    entityId: String(file._id),
    link: `/officer/files/${file._id}`,
    channels: ['IN_APP', 'EMAIL'],
  });

  await recordAudit(req, {
    action: 'FILE_DISPATCHED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: file.fileNumber,
    after: {
      toUser: String(target._id),
      movementNumber,
      actionRequired: input.actionRequired,
    },
  });

  return { file: file.toObject(), movement: movement.toObject() };
}

export async function receiveFile(id: string, input: Input<typeof receiveFileSchema>, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);

  const movement = await FileMovement.findOne({
    file: file._id,
    toUser: req.user!.id,
    status: 'DISPATCHED',
  }).sort({ dispatchedAt: -1 });
  if (!movement) throw new AppError(409, 'No dispatched movement is pending for this user', 'INVALID_STATUS');

  if (input.via === 'QR') {
    if (!input.token) throw new AppError(422, 'QR token is required for QR receipt', 'VALIDATION_ERROR');
    const payload = verifyQrPayload(input.token);
    if (!payload || payload.fileId !== String(file._id)) {
      throw new AppError(400, 'Invalid QR code for this file', 'INVALID_QR');
    }
    if (payload.version !== file.qrVersion || hashToken(input.token) !== file.qrTokenHash) {
      throw new AppError(400, 'QR code is outdated for this file', 'INVALID_QR');
    }
  }

  const now = new Date();
  movement.receivedAt = now;
  movement.status = 'RECEIVED';
  movement.receivedVia = input.via;
  if (input.via === 'QR') movement.qrScanAt = now;
  await movement.save();

  file.currentCustodian = new Types.ObjectId(req.user!.id);
  file.status = 'RECEIVED';
  await file.save();

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: 'RECEIVED',
    fromStatus: 'DISPATCHED',
    toStatus: 'RECEIVED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `File received via ${input.via}`,
    metadata: { movementNumber: movement.movementNumber },
  });

  if (movement.fromUser) {
    await notifyUsers([String(movement.fromUser)], {
      type: 'FILE_RECEIVED',
      title: `File ${file.fileNumber} received`,
      body: `${req.user!.name} marked the file as received.`,
      entityType: 'File',
      entityId: String(file._id),
      link: `/clerk/files/${file._id}`,
    });
  }

  await recordAudit(req, {
    action: 'FILE_RECEIVED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: file.fileNumber,
    after: { movementNumber: movement.movementNumber, via: input.via },
  });

  return { file: file.toObject(), movement: movement.toObject() };
}

export async function addFileNote(id: string, input: Input<typeof fileNoteSchema>, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  await assertCustodianOrSupervisor(req, file);
  if (TERMINAL_FILE_STATUSES.includes(file.status as FileStatus)) {
    throw new AppError(409, 'Closed files cannot receive new notes', 'INVALID_STATUS');
  }

  const note = await FileNote.create({
    file: file._id,
    author: req.user!.id,
    text: input.text,
    visibility: input.visibility,
    decision: input.decision,
    documents: input.documentIds ?? [],
  });

  if (file.status === 'RECEIVED' || file.status === 'REGISTERED' || file.status === 'UNDER_REVIEW') {
    file.status = 'NOTING_ADDED';
    await file.save();
  }

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: 'NOTING_ADDED',
    actor: req.user!.id,
    visibility: input.visibility,
    message: `Note added${input.decision !== 'NONE' ? ` — ${input.decision.replaceAll('_', ' ').toLowerCase()}` : ''}`,
  });

  if (input.decision === 'RECOMMEND_APPROVAL' && file.department) {
    const heads = await User.find({ department: file.department, role: 'DEPARTMENT_HEAD', status: 'ACTIVE' })
      .select('_id')
      .lean();
    await notifyUsers(
      heads.map((head) => String(head._id)),
      {
        type: 'FILE_APPROVAL_PENDING',
        title: `File ${file.fileNumber} recommended for approval`,
        body: file.subject,
        entityType: 'File',
        entityId: String(file._id),
        link: `/dept-head/files/${file._id}`,
      },
    );
  }

  await recordAudit(req, {
    action: 'FILE_NOTE_ADDED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: file.fileNumber,
    after: { noteId: String(note._id), decision: input.decision },
  });

  return note.toObject();
}

export async function decideFile(id: string, input: Input<typeof fileDecisionSchema>, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  if (!['NOTING_ADDED', 'UNDER_REVIEW', 'RECEIVED', 'APPROVAL_PENDING', 'DISPATCHED'].includes(file.status)) {
    throw new AppError(409, 'This file is not awaiting a decision', 'INVALID_STATUS');
  }

  const previousCustodian = file.currentCustodian ? String(file.currentCustodian) : null;
  const lastMovement = await FileMovement.findOne({ file: file._id }).sort({ dispatchedAt: -1 }).lean();

  await FileNote.create({
    file: file._id,
    author: req.user!.id,
    text: input.remarks,
    visibility: 'INTERNAL',
    decision: input.outcome,
  });

  if (input.outcome === 'APPROVED') {
    file.status = 'APPROVED';
    file.currentCustodian = new Types.ObjectId(req.user!.id);
    file.currentLocation = req.user!.departmentName ?? file.currentLocation;
  } else {
    file.status = 'RETURNED';
    const returnTo = lastMovement?.fromUser ?? file.createdBy;
    file.currentCustodian = returnTo as Types.ObjectId;
  }
  await file.save();

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: input.outcome === 'APPROVED' ? 'APPROVED' : 'RETURNED',
    toStatus: file.status,
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `${input.outcome === 'APPROVED' ? 'Approved' : 'Returned'}: ${input.remarks}`,
  });

  if (input.outcome === 'RETURNED' && file.currentCustodian) {
    await notifyUsers([String(file.currentCustodian)], {
      type: 'FILE_RETURNED',
      title: `File ${file.fileNumber} returned`,
      body: input.remarks,
      entityType: 'File',
      entityId: String(file._id),
      link: `/officer/files/${file._id}`,
      channels: ['IN_APP', 'EMAIL'],
    });
  }
  if (input.outcome === 'APPROVED' && lastMovement?.fromUser) {
    await notifyUsers([String(lastMovement.fromUser)], {
      type: 'FILE_APPROVED',
      title: `File ${file.fileNumber} approved`,
      body: input.remarks,
      entityType: 'File',
      entityId: String(file._id),
      link: `/clerk/files/${file._id}`,
    });
  }

  await recordAudit(req, {
    action: input.outcome === 'APPROVED' ? 'FILE_APPROVED' : 'FILE_RETURNED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: file.fileNumber,
    before: { status: 'UNDER_REVIEW', custodian: previousCustodian },
    after: { status: file.status, remarks: input.remarks },
  });

  return file.toObject();
}

export async function finalizeFile(id: string, input: Input<typeof finalizeFileSchema>, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  if (!['APPROVED', 'NOTING_ADDED', 'RECEIVED'].includes(file.status)) {
    throw new AppError(409, 'Only approved or processed files can be finalised', 'INVALID_STATUS');
  }
  if (!canSupervise(req) && String(file.currentCustodian ?? '') !== req.user!.id) {
    throw new AppError(403, 'Only the custodian or supervising officer can finalise this file', 'FORBIDDEN_SCOPE');
  }

  const now = new Date();
  file.status = 'COMPLETED';
  file.finalAction = input.finalAction;
  file.completedAt = now;
  file.sla.completedAt = now;
  file.sla.status = 'COMPLETED';
  await file.save();

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: 'COMPLETED',
    toStatus: 'COMPLETED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `File finalised: ${input.finalAction}`,
  });
  await notifyUsers([String(file.createdBy)], {
    type: 'FILE_APPROVED',
    title: `File ${file.fileNumber} completed`,
    body: input.finalAction,
    entityType: 'File',
    entityId: String(file._id),
    link: `/clerk/files/${file._id}`,
  });
  await recordAudit(req, {
    action: 'FILE_FINALIZED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: file.fileNumber,
    after: { finalAction: input.finalAction },
  });

  return file.toObject();
}

export async function archiveFile(id: string, input: Input<typeof archiveFileSchema>, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  if (file.status === 'ARCHIVED') throw new AppError(409, 'File is already archived', 'INVALID_STATUS');
  if (!canSupervise(req) && !req.user!.permissions.includes('file.archive')) {
    throw new AppError(403, 'You cannot archive files', 'FORBIDDEN_PERMISSION');
  }

  file.status = 'ARCHIVED';
  file.archivedAt = new Date();
  await file.save();

  await addTimeline({
    entityType: 'FILE',
    entityId: String(file._id),
    action: 'ARCHIVED',
    toStatus: 'ARCHIVED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: input.notes || 'File archived',
  });
  await recordAudit(req, {
    action: 'FILE_ARCHIVED',
    entityType: 'File',
    entityId: String(file._id),
    entityLabel: file.fileNumber,
  });

  return file.toObject();
}

export async function listFiles(req: Request) {
  const query = req.validatedQuery as Input<typeof fileListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { ...fileListFilter(req) };

  if (query.status) {
    const statuses = query.status
      .split(',')
      .map((status) => status.trim().toUpperCase())
      .filter((status) => (FILE_STATUSES as readonly string[]).includes(status));
    if (statuses.length) filter.status = { $in: statuses };
  }
  if (query.priority) filter.priority = query.priority;
  if (query.department && req.user!.role === 'DISTRICT_ADMIN') filter.department = query.department;
  if (query.confidentiality) filter.confidentiality = query.confidentiality;
  if (query.custodian) filter.currentCustodian = query.custodian;
  if (query.mine) filter.currentCustodian = req.user!.id;
  if (query.overdue) {
    filter['sla.dueAt'] = { $lt: new Date() };
    filter.status = { $nin: TERMINAL_FILE_STATUSES };
  }
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ subject: regex }, { fileNumber: regex }, { fileId: regex }];
  }

  const sort = buildSort(query.sort, ['createdAt', 'updatedAt', 'priority', 'status', 'sla.dueAt'], '-createdAt');
  const [items, total] = await Promise.all([
    DigitalFile.find(filter as never)
      .populate('department', 'name code')
      .populate('currentCustodian', 'name designation role')
      .populate('createdBy', 'name designation role')
      .populate('category', 'name code')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    DigitalFile.countDocuments(filter as never),
  ]);

  return { items, meta: buildPageMeta(total, pagination) };
}

export async function getFileDetail(id: string, req: Request) {
  const file = await DigitalFile.findById(id)
    .populate('department', 'name code')
    .populate('originatingOffice', 'name code')
    .populate('category', 'name code')
    .populate('currentCustodian', 'name designation role email mobile')
    .populate('createdBy', 'name designation role')
    .populate('attachments')
    .lean();
  if (!file) throw new AppError(404, 'File not found', 'NOT_FOUND');
  assertFileAccess(req, file);

  const [movements, notes] = await Promise.all([
    FileMovement.find({ file: id })
      .populate('fromUser', 'name designation')
      .populate('toUser', 'name designation')
      .populate('fromDepartment', 'name code')
      .populate('toDepartment', 'name code')
      .sort({ dispatchedAt: -1 })
      .lean(),
    FileNote.find({ file: id })
      .populate('author', 'name designation')
      .populate('documents')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return { ...file, movements, notes };
}

export async function getFileMovements(id: string, req: Request) {
  const file = await DigitalFile.findById(id).select('department confidentiality').lean();
  if (!file) throw new AppError(404, 'File not found', 'NOT_FOUND');
  assertFileAccess(req, file);
  return FileMovement.find({ file: id })
    .populate('fromUser', 'name designation')
    .populate('toUser', 'name designation')
    .populate('fromDepartment', 'name code')
    .populate('toDepartment', 'name code')
    .sort({ dispatchedAt: -1 })
    .lean();
}

export async function getQrForFile(id: string, req: Request) {
  const file = await loadFile(id);
  assertFileAccess(req, file);
  if (!file.qrVersion) throw new AppError(404, 'QR code has not been generated', 'NOT_FOUND');
  const token = signQrPayload(String(file._id), file.qrVersion);
  return {
    token,
    dataUrl: await QRCode.toDataURL(token, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 360,
      color: { dark: '#101E35', light: '#FFFFFF' },
    }),
    version: file.qrVersion,
    generatedAt: file.qrGeneratedAt,
  };
}
