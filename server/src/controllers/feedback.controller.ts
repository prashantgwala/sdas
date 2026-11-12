import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import {
  createFeedback,
  feedbackAnalytics,
  listFeedback,
  reviewFeedback,
} from '../services/feedback.service';
import { Feedback } from '../models/feedback';
import { buildPageMeta, parsePagination } from '../utils/pagination';

function id(req: Request): string {
  return (req.validatedParams as { id: string }).id;
}

export async function createController(req: Request, res: Response): Promise<void> {
  created(res, await createFeedback(req.body, req));
}

export async function listController(req: Request, res: Response): Promise<void> {
  const result = await listFeedback(req);
  ok(res, result.items, result.meta);
}

export async function mineController(req: Request, res: Response): Promise<void> {
  const query = (req.validatedQuery ?? {}) as Record<string, unknown>;
  const pagination = parsePagination(query);
  const filter = { citizen: req.user!.id };
  const [items, total] = await Promise.all([
    Feedback.find(filter as never)
      .populate('grievance', 'grievanceId subject')
      .populate('department', 'name code')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Feedback.countDocuments(filter as never),
  ]);
  ok(res, items, buildPageMeta(total, pagination));
}

export async function reviewController(req: Request, res: Response): Promise<void> {
  ok(res, await reviewFeedback(id(req), req.body, req));
}

export async function analyticsController(req: Request, res: Response): Promise<void> {
  ok(res, await feedbackAnalytics(req));
}
