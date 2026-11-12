import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam } from '../validators/common';
import {
  notificationBulkReadSchema,
  notificationListQuery,
} from '../validators/notification';
import {
  deleteController,
  listController,
  markAllReadController,
  markReadController,
  unreadCountController,
} from '../controllers/notification.controller';

export const notificationRouter = Router();

notificationRouter.use(authenticate, requirePermission('notification.read'));

notificationRouter.get('/', validate({ query: notificationListQuery }), asyncHandler(listController));
notificationRouter.get('/unread-count', asyncHandler(unreadCountController));
notificationRouter.post(
  '/read',
  validate({ body: notificationBulkReadSchema }),
  asyncHandler(markReadController),
);
notificationRouter.post('/read-all', asyncHandler(markAllReadController));
notificationRouter.delete('/:id', validate({ params: idParam }), asyncHandler(deleteController));
