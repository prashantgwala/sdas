import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import {
  addRepairUpdate,
  closeRoadReport,
  createRoadReport,
  getRoadReport,
  inspectRoadReport,
  listRoadReports,
  reviewRoadAiSuggestion,
  verifyRoadReport,
} from '../services/road.service';

function id(req: Request): string {
  return (req.validatedParams as { id: string }).id;
}

export async function listController(req: Request, res: Response): Promise<void> {
  const result = await listRoadReports(req);
  ok(res, result.items, result.meta);
}

export async function detailController(req: Request, res: Response): Promise<void> {
  ok(res, await getRoadReport(req, id(req)));
}

export async function createController(req: Request, res: Response): Promise<void> {
  created(res, await createRoadReport(req.body, req));
}

export async function inspectController(req: Request, res: Response): Promise<void> {
  ok(res, await inspectRoadReport(id(req), req.body, req));
}

export async function verifyController(req: Request, res: Response): Promise<void> {
  ok(res, await verifyRoadReport(id(req), req.body, req));
}

export async function repairUpdateController(req: Request, res: Response): Promise<void> {
  ok(res, await addRepairUpdate(id(req), req.body, req));
}

export async function aiReviewController(req: Request, res: Response): Promise<void> {
  ok(res, await reviewRoadAiSuggestion(id(req), req.body, req));
}

export async function closeController(req: Request, res: Response): Promise<void> {
  ok(res, await closeRoadReport(id(req), req.body, req));
}
