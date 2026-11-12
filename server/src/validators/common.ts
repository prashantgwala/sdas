import { z } from 'zod';

export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

export const optionalObjectId = z
  .union([objectId, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : undefined));

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(60).optional(),
});

export const dateRangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const idParam = z.object({ id: objectId });
export const keyParam = z.object({ key: z.string().min(1).max(60) });

export const statusPatch = z.object({
  status: z.string().min(1).max(40),
  reason: z.string().trim().max(1000).optional(),
});

export function paginationFrom(query: unknown): { page: number; limit: number; skip: number } {
  const parsed = paginationQuery.parse(query ?? {});
  return {
    page: parsed.page,
    limit: parsed.limit,
    skip: (parsed.page - 1) * parsed.limit,
  };
}
