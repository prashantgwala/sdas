import { z } from 'zod';
import { APPLICATION_STATUSES, PRIORITIES } from '../config/constants';
import { objectId, optionalObjectId, paginationQuery } from './common';

export const createApplicationSchema = z.object({
  type: objectId,
  formData: z.record(z.string(), z.unknown()).default({}),
  priority: z.enum(PRIORITIES).optional(),
});

export const applicationTypeSchema = z.object({
  name: z.string().trim().min(3).max(180),
  code: z.string().trim().min(2).max(60).transform((value) => value.toUpperCase()),
  department: objectId,
  description: z.string().trim().max(2000).optional(),
  requiredDocuments: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(80),
        label: z.string().trim().min(1).max(200),
        required: z.boolean().default(true),
      }),
    )
    .default([]),
  formFieldSchema: z.record(z.string(), z.unknown()).default({}),
  slaRule: optionalObjectId,
  active: z.boolean().default(true),
});

export const updateApplicationTypeSchema = applicationTypeSchema.partial();

export const checklistItemSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  required: z.boolean().default(true),
  provided: z.boolean().default(false),
  document: optionalObjectId,
  verified: z.boolean().default(false),
  remarks: z.string().trim().max(500).optional(),
});

export const verifyApplicationSchema = z.object({
  checklist: z.array(checklistItemSchema).max(50).optional(),
  assignOfficer: optionalObjectId,
  notes: z.string().trim().max(2000).optional(),
});

export const assignApplicationSchema = z.object({
  officerId: objectId,
  priority: z.enum(PRIORITIES).optional(),
  dueAt: z.coerce.date().optional(),
  remarks: z.string().trim().max(2000).optional(),
});

export const reviewApplicationSchema = z.object({
  reviewNotes: z.string().trim().min(5).max(5000),
  documentIds: z.array(objectId).max(20).optional(),
});

export const applicationDecisionSchema = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED', 'CLOSED']),
  reason: z.string().trim().min(5).max(2000),
});

export const applicationListQuery = paginationQuery.extend({
  status: z.string().trim().max(120).optional(),
  type: optionalObjectId,
  department: optionalObjectId,
  mine: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const applicationStatuses = APPLICATION_STATUSES;
