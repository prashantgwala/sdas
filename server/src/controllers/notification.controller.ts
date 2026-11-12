import type { Request, Response } from 'express';
import type { NotificationType } from '../config/constants';
import { noContent, ok } from '../utils/response';
import {
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markNotificationsRead,
} from '../services/notification.service';

interface ListQuery {
  page: number;
  limit: number;
  unread?: string;
  type?: NotificationType;
}

export async function listController(req: Request, res: Response): Promise<void> {
  const query = req.validatedQuery as ListQuery;
  const result = await listNotifications(req.user!.id, query);
  ok(res, result.items, {
    page: query.page,
    limit: query.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / query.limit)),
    unread: result.unread,
  });
}

export async function unreadCountController(req: Request, res: Response): Promise<void> {
  const unread = await getUnreadCount(req.user!.id);
  ok(res, { unread });
}

export async function markReadController(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as { ids: string[] };
  const updated = await markNotificationsRead(req.user!.id, ids);
  ok(res, { updated });
}

export async function markAllReadController(req: Request, res: Response): Promise<void> {
  const updated = await markAllRead(req.user!.id);
  ok(res, { updated });
}

export async function deleteController(req: Request, res: Response): Promise<void> {
  const { id } = req.validatedParams as { id: string };
  await deleteNotification(req.user!.id, id);
  noContent(res);
}
