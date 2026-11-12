import { z } from 'zod';
import { PRIORITIES } from '../config/constants';
import { objectId, optionalObjectId, paginationQuery } from './common';

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10 digit mobile number'),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
});

export const createGrievanceSchema = z.object({
  subject: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20).max(5000),
  category: optionalObjectId,
  subcategory: optionalObjectId,
  location: z.string().trim().max(500).optional(),
  tehsil: optionalObjectId,
  priority: z.enum(PRIORITIES).optional(),
  contact: contactSchema.optional(),
  source: z.enum(['CITIZEN', 'ASSISTED']).optional(),
});

export const verifyGrievanceSchema = z.object({
  category: optionalObjectId,
  subcategory: optionalObjectId,
  department: optionalObjectId,
  priority: z.enum(PRIORITIES).optional(),
  subject: z.string().trim().min(5).max(200).optional(),
  description: z.string().trim().min(20).max(5000).optional(),
  location: z.string().trim().max(500).optional(),
  tehsil: optionalObjectId,
  contact: contactSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const classifyGrievanceSchema = z.object({
  category: objectId,
  subcategory: optionalObjectId,
  department: optionalObjectId,
  priority: z.enum(PRIORITIES).optional(),
  decision: z.enum(['ACCEPTED', 'EDITED', 'REJECTED']).default('EDITED'),
  notes: z.string().trim().max(1000).optional(),
});

export const routeGrievanceSchema = z.object({
  department: objectId,
  office: optionalObjectId,
  priority: z.enum(PRIORITIES).optional(),
  remarks: z.string().trim().max(2000).optional(),
});

export const assignGrievanceSchema = z.object({
  officerId: objectId,
  priority: z.enum(PRIORITIES).optional(),
  dueAt: z.coerce.date().optional(),
  remarks: z.string().trim().max(2000).optional(),
});

export const grievanceActionSchema = z.object({
  type: z.enum(['INTERNAL_NOTE', 'EVIDENCE', 'ATR']),
  text: z.string().trim().min(3).max(5000),
  documentIds: z.array(objectId).max(20).optional(),
  visibility: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL']).optional(),
});

export const resolutionSchema = z.object({
  text: z.string().trim().min(10).max(5000),
  documentIds: z.array(objectId).max(20).optional(),
});

export const decisionSchema = z.object({
  outcome: z.enum(['RESOLVED', 'REJECTED', 'RETURNED', 'CLOSED']),
  reason: z.string().trim().min(5).max(2000),
});

export const reopenRequestSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

export const reopenReviewSchema = z.object({
  approve: z.boolean(),
  decisionNotes: z.string().trim().max(2000).optional(),
});

export const escalateGrievanceSchema = z.object({
  reason: z.string().trim().min(5).max(2000),
  level: z.coerce.number().int().min(1).max(3).optional(),
});

export const closeGrievanceSchema = z.object({
  reason: z.string().trim().min(5).max(2000),
});

export const grievanceListQuery = paginationQuery.extend({
  status: z.string().trim().max(60).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: optionalObjectId,
  department: optionalObjectId,
  assignedOfficer: optionalObjectId,
  mine: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
  overdue: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
  due: z.enum(['TODAY', 'SOON']).optional(),
  escalated: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const timelineQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
