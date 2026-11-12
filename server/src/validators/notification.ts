import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../config/constants';
import { paginationQuery } from './common';

export const notificationListQuery = paginationQuery.extend({
  unread: z.enum(['true', 'false']).optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

export const notificationBulkReadSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier')).min(1).max(200),
});
