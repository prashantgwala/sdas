import type { ClientSession } from 'mongoose';
import { Notification } from '../models/notification';
import type { NotificationType } from '../config/constants';
import { User } from '../models/user';
import { sendEmail } from './mail.service';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';

interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  channels?: Array<'IN_APP' | 'EMAIL' | 'SMS'>;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

export async function notifyUsers(
  userIds: string[],
  payload: NotificationPayload,
  session?: ClientSession,
): Promise<void> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  for (const recipient of uniqueIds) {
    const dedupeKey = payload.dedupeKey ? `${payload.dedupeKey}:${recipient}` : undefined;
    try {
      const values = {
        recipient,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        entityType: payload.entityType,
        entityId: payload.entityId ?? null,
        link: payload.link,
        channels: payload.channels ?? ['IN_APP'],
        dedupeKey,
        metadata: payload.metadata,
      };

      let notification;
      if (dedupeKey) {
        notification = await Notification.findOneAndUpdate(
          { dedupeKey },
          { $setOnInsert: values },
          { upsert: true, new: true, session },
        ).lean();
      } else {
        const [created] = await Notification.create([values], { session });
        notification = created.toObject();
      }

      if (notification && (payload.channels ?? []).includes('EMAIL')) {
        const user = await User.findById(recipient).select('email').lean();
        if (user?.email) {
          const sent = await sendEmail(user.email, payload.title, `<p>${payload.body}</p>`);
          await Notification.updateOne(
            { _id: notification._id },
            { $set: { emailStatus: sent ? 'SENT' : 'FAILED' } },
            { session },
          );
        }
      }
    } catch (error) {
      logger.error({ err: error, recipient, type: payload.type }, 'Notification dispatch failed');
    }
  }
}

export async function notifyDepartment(
  departmentId: string,
  roles: string[],
  payload: NotificationPayload,
  session?: ClientSession,
): Promise<void> {
  if (!departmentId) return;
  const users = await User.find({
    department: departmentId,
    role: { $in: roles },
    status: 'ACTIVE',
  } as never)
    .select('_id')
    .lean();
  await notifyUsers(users.map((user) => String((user as { _id: unknown })._id)), payload, session);
}

export async function notifyRole(
  role: string,
  payload: NotificationPayload,
  session?: ClientSession,
): Promise<void> {
  const users = await User.find({ role, status: 'ACTIVE' } as never)
    .select('_id')
    .lean();
  await notifyUsers(users.map((user) => String((user as { _id: unknown })._id)), payload, session);
}

export async function listNotifications(
  userId: string,
  query: { page: number; limit: number; unread?: string; type?: NotificationType },
): Promise<{ items: unknown[]; total: number; unread: number }> {
  const filter: Record<string, unknown> = { recipient: userId };
  if (query.unread === 'true') filter.readAt = null;
  if (query.type) filter.type = query.type;

  const skip = (query.page - 1) * query.limit;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter as never)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Notification.countDocuments(filter as never),
    Notification.countDocuments({ recipient: userId, readAt: null } as never),
  ]);
  return { items, total, unread };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ recipient: userId, readAt: null } as never);
}

export async function markNotificationsRead(
  userId: string,
  ids: string[],
): Promise<number> {
  const result = await Notification.updateMany(
    { _id: { $in: ids }, recipient: userId, readAt: null } as never,
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount ?? 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { recipient: userId, readAt: null } as never,
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount ?? 0;
}

export async function deleteNotification(userId: string, id: string): Promise<void> {
  const result = await Notification.deleteOne({ _id: id, recipient: userId } as never);
  if (!result.deletedCount) {
    throw new AppError(404, 'Notification not found', 'NOT_FOUND');
  }
}
