import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import {
  assignApplication,
  completenessReview,
  createApplication,
  decideApplication,
  getApplicationDetail,
  listApplicationTypes,
  listApplications,
  reviewApplication,
  verifyApplication,
} from '../services/application.service';

function id(req: Request): string {
  return (req.validatedParams as { id: string }).id;
}

export async function typesController(req: Request, res: Response): Promise<void> {
  ok(res, await listApplicationTypes(req));
}

export async function createController(req: Request, res: Response): Promise<void> {
  created(res, await createApplication(req.body, req));
}

export async function listController(req: Request, res: Response): Promise<void> {
  const result = await listApplications(req);
  ok(res, result.items, result.meta);
}

export async function detailController(req: Request, res: Response): Promise<void> {
  ok(res, await getApplicationDetail(id(req), req));
}

export async function verifyController(req: Request, res: Response): Promise<void> {
  ok(res, await verifyApplication(id(req), req.body, req));
}

export async function assignController(req: Request, res: Response): Promise<void> {
  ok(res, await assignApplication(id(req), req.body, req));
}

export async function reviewController(req: Request, res: Response): Promise<void> {
  ok(res, await reviewApplication(id(req), req.body, req));
}

export async function decisionController(req: Request, res: Response): Promise<void> {
  ok(res, await decideApplication(id(req), req.body, req));
}

export async function completenessController(req: Request, res: Response): Promise<void> {
  ok(res, await completenessReview(id(req), req));
}
