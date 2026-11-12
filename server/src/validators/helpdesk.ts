import { z } from 'zod';
import { PRIORITIES } from '../config/constants';
import { optionalObjectId, paginationQuery } from './common';

export const chatCreateSchema = z.object({
  language: z.enum(['en', 'hi', 'hinglish']).optional(),
});

export const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  language: z.enum(['en', 'hi', 'hinglish']).optional(),
});

export const chatEscalateSchema = z.object({
  subject: z.string().trim().min(5).max(250).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
});

export const createTicketSchema = z.object({
  subject: z.string().trim().min(5).max(250),
  category: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(5000),
  priority: z.enum(PRIORITIES).optional(),
});

export const ticketListQuery = paginationQuery.extend({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: optionalObjectId,
  department: optionalObjectId,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const ticketReplySchema = z.object({
  content: z.string().trim().min(1).max(5000),
  internal: z.boolean().optional(),
});

export const ticketAssignSchema = z.object({
  assignedTo: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier'),
  department: optionalObjectId,
});

export const ticketStatusSchema = z.object({
  status: z.enum(['RESOLVED', 'CLOSED']),
  resolution: z.string().trim().max(3000).optional(),
});
