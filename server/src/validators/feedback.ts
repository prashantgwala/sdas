import { z } from 'zod';
import { optionalObjectId, paginationQuery } from './common';

export const createFeedbackSchema = z.object({
  grievance: optionalObjectId,
  department: optionalObjectId,
  category: z.string().trim().min(2).max(120),
  text: z.string().trim().min(5).max(3000),
  rating: z.coerce.number().int().min(1).max(5),
});

export const feedbackListQuery = paginationQuery.extend({
  status: z.enum(['PENDING_REVIEW', 'REVIEWED']).optional(),
  department: optionalObjectId,
  rating: z.coerce.number().int().min(1).max(5).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const reviewFeedbackSchema = z.object({
  reviewNotes: z.string().trim().max(2000).optional(),
});
