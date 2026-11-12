export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  const pageRaw = Number(query.page ?? 1);
  const limitRaw = Number(query.limit ?? 20);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 20;
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPageMeta(total: number, pagination: Pagination): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrev: pagination.page > 1,
  };
}

const SORT_DIRECTIONS = new Set(['asc', 'desc', '1', '-1']);

export function buildSort(
  sortRaw: unknown,
  allowlist: string[],
  fallback = '-createdAt',
): Record<string, 1 | -1> {
  const raw = typeof sortRaw === 'string' && sortRaw.trim() ? sortRaw.trim() : fallback;
  const descendant = raw.startsWith('-');
  const field = descendant ? raw.slice(1) : raw;
  if (!allowlist.includes(field) && field !== 'createdAt' && field !== 'updatedAt') {
    return { createdAt: -1 };
  }
  return { [field]: descendant ? -1 : 1 };
}

export function isSortDirection(value: unknown): boolean {
  return typeof value === 'string' && SORT_DIRECTIONS.has(value);
}
