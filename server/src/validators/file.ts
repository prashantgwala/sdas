import { z } from 'zod';
import { CONFIDENTIALITY_LEVELS, FILE_STATUSES, PRIORITIES } from '../config/constants';
import { objectId, optionalObjectId, paginationQuery } from './common';

export const createFileSchema = z.object({
  subject: z.string().trim().min(3).max(250),
  description: z.string().trim().max(5000).optional(),
  department: optionalObjectId,
  category: optionalObjectId,
  originatingOffice: optionalObjectId,
  priority: z.enum(PRIORITIES).default('NORMAL'),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS).default('INTERNAL'),
  retentionDays: z.coerce.number().int().min(1).max(36500).optional(),
});

export const updateFileSchema = z.object({
  subject: z.string().trim().min(3).max(250).optional(),
  description: z.string().trim().max(5000).optional(),
  category: optionalObjectId,
  priority: z.enum(PRIORITIES).optional(),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  currentLocation: z.string().trim().max(200).optional(),
  retentionDays: z.coerce.number().int().min(1).max(36500).optional(),
});

export const dispatchFileSchema = z.object({
  toUser: objectId,
  actionRequired: z.enum(['REVIEW', 'APPROVAL', 'INFORMATION', 'ACTION']).default('REVIEW'),
  remarks: z.string().trim().max(2000).optional(),
});

export const receiveFileSchema = z.object({
  via: z.enum(['QR', 'MANUAL']).default('MANUAL'),
  token: z.string().trim().max(500).optional(),
});

export const fileNoteSchema = z.object({
  text: z.string().trim().min(2).max(5000),
  visibility: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL']).default('INTERNAL'),
  decision: z
    .enum(['NONE', 'RECOMMEND_APPROVAL', 'RECOMMEND_RETURN', 'APPROVED', 'RETURNED'])
    .default('NONE'),
  documentIds: z.array(objectId).max(20).optional(),
});

export const fileDecisionSchema = z.object({
  outcome: z.enum(['APPROVED', 'RETURNED']),
  remarks: z.string().trim().min(5).max(2000),
});

export const finalizeFileSchema = z.object({
  finalAction: z.string().trim().min(5).max(2000),
});

export const archiveFileSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});

export const fileListQuery = paginationQuery.extend({
  status: z.string().trim().max(120).optional(),
  priority: z.enum(PRIORITIES).optional(),
  department: optionalObjectId,
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  custodian: optionalObjectId,
  mine: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
  overdue: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const qrVerifyQuery = z.object({
  token: z.string().trim().min(10).max(500),
});

export const movementListQuery = paginationQuery;
