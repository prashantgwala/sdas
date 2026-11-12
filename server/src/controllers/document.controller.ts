import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import { AppError } from '../middleware/error';
import {
  deleteDocument,
  fetchOcr,
  getDocumentForDownload,
  listEntityDocuments,
  listMyDocuments,
  runOcr,
  uploadEntityDocuments,
  verifyDocumentOcr,
} from '../services/document.service';
import type { DocumentEntityType } from '../types/domain';

function single(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function uploadController(req: Request, res: Response): Promise<void> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const entityType = single(req.body?.entityType) as DocumentEntityType | undefined;
  const entityId = single(req.body?.entityId);
  if (!entityType || !entityId) {
    throw new AppError(422, 'entityType and entityId are required', 'VALIDATION_ERROR');
  }
  const documents = await uploadEntityDocuments(
    req,
    { entityType, entityId, category: single(req.body?.category) },
    files,
  );
  created(res, documents);
}

export async function listController(req: Request, res: Response): Promise<void> {
  const query = req.validatedQuery as { entityType: string; entityId: string };
  const result = await listEntityDocuments(req, query.entityType, query.entityId);
  ok(res, result.items, result.meta);
}

export async function mineController(req: Request, res: Response): Promise<void> {
  const result = await listMyDocuments(req);
  ok(res, result.items, result.meta);
}

export async function downloadController(req: Request, res: Response): Promise<void> {
  const documentId = (req.validatedParams as { id: string }).id;
  const { document, absolutePath } = await getDocumentForDownload(req, documentId);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(absolutePath, document.originalName);
}

export async function deleteController(req: Request, res: Response): Promise<void> {
  const documentId = (req.validatedParams as { id: string }).id;
  const result = await deleteDocument(req, documentId);
  ok(res, result);
}

export async function ocrController(req: Request, res: Response): Promise<void> {
  const documentId = (req.validatedParams as { id: string }).id;
  const result = await runOcr(req, documentId);
  ok(res, result);
}

export async function fetchOcrController(req: Request, res: Response): Promise<void> {
  const documentId = (req.validatedParams as { id: string }).id;
  const result = await fetchOcr(req, documentId);
  ok(res, result);
}

export async function verifyOcrController(req: Request, res: Response): Promise<void> {
  const documentId = (req.validatedParams as { id: string }).id;
  const result = await verifyDocumentOcr(req, documentId, req.body);
  ok(res, result);
}
