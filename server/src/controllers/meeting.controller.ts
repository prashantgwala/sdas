import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import {
  approveMinutes,
  createMeeting,
  createTask,
  draftMinutes,
  getMeeting,
  listMeetings,
  listTasks,
  summarizeMinutes,
  updateMeeting,
  updateTask,
} from '../services/meeting.service';

function params(req: Request): Record<string, string> {
  return (req.validatedParams ?? {}) as Record<string, string>;
}

export async function listMeetingsController(req: Request, res: Response): Promise<void> {
  const result = await listMeetings(req);
  ok(res, result.items, result.meta);
}

export async function detailController(req: Request, res: Response): Promise<void> {
  ok(res, await getMeeting(params(req).id, req));
}

export async function createMeetingController(req: Request, res: Response): Promise<void> {
  created(res, await createMeeting(req.body, req));
}

export async function updateMeetingController(req: Request, res: Response): Promise<void> {
  ok(res, await updateMeeting(params(req).id, req.body, req));
}

export async function draftMinutesController(req: Request, res: Response): Promise<void> {
  ok(res, await draftMinutes(params(req).id, req.body, req));
}

export async function summarizeController(req: Request, res: Response): Promise<void> {
  ok(res, await summarizeMinutes(params(req).id, req.body.content, req));
}

export async function approveMinutesController(req: Request, res: Response): Promise<void> {
  ok(res, await approveMinutes(params(req).id, req));
}

export async function listTasksController(req: Request, res: Response): Promise<void> {
  const result = await listTasks(req);
  ok(res, result.items, result.meta);
}

export async function createTaskController(req: Request, res: Response): Promise<void> {
  created(res, await createTask(req.body, req));
}

export async function updateTaskController(req: Request, res: Response): Promise<void> {
  ok(res, await updateTask(params(req).id, req.body, req));
}
