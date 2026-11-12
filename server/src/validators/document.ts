import { z } from 'zod';
import { objectId } from './common';

export const documentListQuery = z.object({
  entityType: z.enum(['GRIEVANCE', 'FILE', 'APPLICATION', 'MEETING', 'INCIDENT', 'ROAD_REPORT', 'USER', 'OTHER']),
  entityId: objectId,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const myDocumentListQuery = z.object({
  entityType: z
    .enum(['GRIEVANCE', 'FILE', 'APPLICATION', 'MEETING', 'INCIDENT', 'ROAD_REPORT', 'USER', 'OTHER'])
    .optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ocrVerifySchema = z.object({
  extractedText: z.string().max(100_000).optional(),
  fields: z
    .object({
      name: z.string().trim().max(200).optional(),
      referenceNumber: z.string().trim().max(120).optional(),
      date: z.string().trim().max(40).optional(),
      address: z.string().trim().max(500).optional(),
    })
    .optional(),
});
