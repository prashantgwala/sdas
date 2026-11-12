import { z } from 'zod';
import { optionalObjectId } from './common';

export const reportRangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  department: optionalObjectId,
});

export const reportExportQuery = reportRangeQuery.extend({
  type: z.enum(['grievances', 'applications', 'files', 'feedback', 'helpdesk']),
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
  status: z.string().trim().max(60).optional(),
});
