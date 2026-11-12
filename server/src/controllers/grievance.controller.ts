import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import {
  acknowledgeGrievance,
  addGrievanceAction,
  assignGrievance,
  closeGrievance,
  createGrievance,
  decideGrievance,
  escalateGrievance,
  getGrievanceActions,
  getGrievanceDetail,
  getGrievanceTimeline,
  getReopenQueue,
  listGrievances,
  requestReopen,
  reviewClassification,
  reviewReopen,
  routeGrievance,
  submitResolution,
  verifyGrievance,
} from '../services/grievance.service';

function id(req: Request): string {
  return (req.validatedParams as { id: string }).id;
}

export async function createController(req: Request, res: Response): Promise<void> {
  const grievance = await createGrievance(req.body, req);
  created(res, grievance);
}

export async function listController(req: Request, res: Response): Promise<void> {
  const result = await listGrievances(req);
  ok(res, result.items, result.meta);
}

export async function detailController(req: Request, res: Response): Promise<void> {
  const grievance = await getGrievanceDetail(id(req), req);
  ok(res, grievance);
}

export async function timelineController(req: Request, res: Response): Promise<void> {
  const events = await getGrievanceTimeline(id(req), req);
  ok(res, events);
}

export async function actionsController(req: Request, res: Response): Promise<void> {
  const actions = await getGrievanceActions(id(req), req);
  ok(res, actions);
}

export async function verifyController(req: Request, res: Response): Promise<void> {
  const grievance = await verifyGrievance(id(req), req.body, req);
  ok(res, grievance);
}

export async function classifyController(req: Request, res: Response): Promise<void> {
  const grievance = await reviewClassification(id(req), req.body, req);
  ok(res, grievance);
}

export async function routeController(req: Request, res: Response): Promise<void> {
  const grievance = await routeGrievance(id(req), req.body, req);
  ok(res, grievance);
}

export async function assignController(req: Request, res: Response): Promise<void> {
  const grievance = await assignGrievance(id(req), req.body, req);
  ok(res, grievance);
}

export async function acknowledgeController(req: Request, res: Response): Promise<void> {
  const grievance = await acknowledgeGrievance(id(req), req);
  ok(res, grievance);
}

export async function actionController(req: Request, res: Response): Promise<void> {
  const action = await addGrievanceAction(id(req), req.body, req);
  created(res, action);
}

export async function resolutionController(req: Request, res: Response): Promise<void> {
  const grievance = await submitResolution(id(req), req.body, req);
  ok(res, grievance);
}

export async function decisionController(req: Request, res: Response): Promise<void> {
  const grievance = await decideGrievance(id(req), req.body, req);
  ok(res, grievance);
}

export async function closeController(req: Request, res: Response): Promise<void> {
  const grievance = await closeGrievance(id(req), req.body, req);
  ok(res, grievance);
}

export async function reopenRequestController(req: Request, res: Response): Promise<void> {
  const grievance = await requestReopen(id(req), req.body, req);
  ok(res, grievance);
}

export async function reopenReviewController(req: Request, res: Response): Promise<void> {
  const grievance = await reviewReopen(id(req), req.body, req);
  ok(res, grievance);
}

export async function escalateController(req: Request, res: Response): Promise<void> {
  const grievance = await escalateGrievance(id(req), req.body, req);
  ok(res, grievance);
}

export async function reopenQueueController(req: Request, res: Response): Promise<void> {
  const items = await getReopenQueue(req);
  ok(res, items);
}
