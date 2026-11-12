import { z } from 'zod';
import { ROAD_REPAIR_STATUSES } from '../config/constants';
import { objectId, optionalObjectId, paginationQuery } from './common';

const locationSchema = z.object({
  address: z.string().trim().max(500).optional(),
  tehsil: optionalObjectId,
  coordinates: z.array(z.coerce.number()).length(2).optional(),
});

export const createRoadReportSchema = z.object({
  roadName: z.string().trim().min(2).max(250),
  damageCategory: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(5000),
  location: locationSchema.optional(),
  documentIds: z.array(objectId).max(20).optional(),
});

export const roadListQuery = paginationQuery.extend({
  repairStatus: z.enum(ROAD_REPAIR_STATUSES).optional(),
  department: optionalObjectId,
  damageCategory: z.string().trim().max(120).optional(),
  mine: z.enum(['true', 'false']).optional(),
});

export const inspectRoadSchema = z.object({
  officer: optionalObjectId,
  status: z.enum(['PENDING', 'SCHEDULED', 'COMPLETED']).default('COMPLETED'),
  findings: z.string().trim().min(5).max(3000),
  verified: z.boolean().optional(),
  inspectedAt: z.coerce.date().optional(),
  documentIds: z.array(objectId).max(20).optional(),
});

export const verifyRoadSchema = z.object({
  verified: z.boolean(),
  assignedDepartment: optionalObjectId,
  findings: z.string().trim().max(3000).optional(),
});

export const repairUpdateSchema = z.object({
  text: z.string().trim().min(5).max(3000),
  status: z.enum(ROAD_REPAIR_STATUSES),
  evidenceDocumentIds: z.array(objectId).max(20).optional(),
});

export const roadAiReviewSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  category: z.string().trim().max(120).optional(),
});

export const closeRoadSchema = z.object({
  summary: z.string().trim().min(10).max(3000),
  evidenceDocumentIds: z.array(objectId).max(20).optional(),
});
