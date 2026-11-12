import type { Response } from 'express';

export function ok<T>(res: Response, data: T, meta?: unknown): void {
  res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ success: true, data });
}

export function noContent(res: Response): void {
  res.status(204).send();
}

export function sanitizeObject<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => sanitizeObject(item)) as T;
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const source = value as Record<string, unknown>;
  if (typeof source.toObject === 'function') {
    return sanitizeObject((source.toObject as () => unknown)()) as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (['passwordHash', 'refreshTokenHash', 'tokenHash', 'otpHash', '__v'].includes(key)) continue;
    result[key] = sanitizeObject(item);
  }
  return result as T;
}

export function pickDefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}
