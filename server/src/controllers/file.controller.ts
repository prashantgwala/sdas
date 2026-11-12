import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import {
  addFileNote,
  archiveFile,
  decideFile,
  dispatchFile,
  finalizeFile,
  generateQr,
  getFileDetail,
  getFileMovements,
  getQrForFile,
  getQrImage,
  listFiles,
  receiveFile,
  registerFile,
  updateFile,
  verifyQrScan,
} from '../services/file.service';

function id(req: Request): string {
  return (req.validatedParams as { id: string }).id;
}

export async function registerController(req: Request, res: Response): Promise<void> {
  created(res, await registerFile(req.body, req));
}

export async function listController(req: Request, res: Response): Promise<void> {
  const result = await listFiles(req);
  ok(res, result.items, result.meta);
}

export async function detailController(req: Request, res: Response): Promise<void> {
  ok(res, await getFileDetail(id(req), req));
}

export async function updateController(req: Request, res: Response): Promise<void> {
  ok(res, await updateFile(id(req), req.body, req));
}

export async function qrGenerateController(req: Request, res: Response): Promise<void> {
  ok(res, await generateQr(id(req), req));
}

export async function qrFetchController(req: Request, res: Response): Promise<void> {
  ok(res, await getQrForFile(id(req), req));
}

export async function qrImageController(req: Request, res: Response): Promise<void> {
  const buffer = await getQrImage(id(req), req);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}

export async function qrVerifyController(req: Request, res: Response): Promise<void> {
  const { token } = req.validatedQuery as { token: string };
  ok(res, await verifyQrScan(token, req));
}

export async function dispatchController(req: Request, res: Response): Promise<void> {
  const result = await dispatchFile(id(req), req.body, req);
  ok(res, result);
}

export async function receiveController(req: Request, res: Response): Promise<void> {
  const result = await receiveFile(id(req), req.body, req);
  ok(res, result);
}

export async function noteController(req: Request, res: Response): Promise<void> {
  created(res, await addFileNote(id(req), req.body, req));
}

export async function decisionController(req: Request, res: Response): Promise<void> {
  ok(res, await decideFile(id(req), req.body, req));
}

export async function finalizeController(req: Request, res: Response): Promise<void> {
  ok(res, await finalizeFile(id(req), req.body, req));
}

export async function archiveController(req: Request, res: Response): Promise<void> {
  ok(res, await archiveFile(id(req), req.body, req));
}

export async function movementsController(req: Request, res: Response): Promise<void> {
  ok(res, await getFileMovements(id(req), req));
}
