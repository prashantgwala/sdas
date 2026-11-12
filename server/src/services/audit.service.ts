import type { ClientSession } from 'mongoose';
import type { Request } from 'express';
import { AuditLog } from '../models/platform';
import type { Role } from '../config/constants';
import { logger } from '../config/logger';

interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: unknown;
  after?: unknown;
  status?: 'SUCCESS' | 'FAILURE';
  actorId?: string | null;
  actorRole?: Role | null;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'refreshTokenHash',
  'token',
  'tokenHash',
  'otp',
  'otpHash',
  'encryptedConfig',
  'accessToken',
]);

function snapshot(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null || depth > 4) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => snapshot(item, depth + 1));
  if (typeof value === 'object') {
    if (typeof (value as { toObject?: unknown }).toObject === 'function') {
      return snapshot((value as { toObject: () => unknown }).toObject(), depth + 1);
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) continue;
      if (key === '__v') continue;
      result[key] = snapshot(item, depth + 1);
    }
    return result;
  }
  if (typeof value === 'string' && value.length > 5000) return `${value.slice(0, 5000)}…`;
  return value;
}

export async function recordAudit(
  req: Request,
  input: AuditInput,
  session?: ClientSession,
): Promise<void> {
  try {
    await AuditLog.create(
      [
        {
          actor: input.actorId ?? req.user?.id ?? null,
          actorRole: input.actorRole ?? (req.user?.role as Role | undefined),
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          entityLabel: input.entityLabel,
          before: input.before === undefined ? undefined : snapshot(input.before),
          after: input.after === undefined ? undefined : snapshot(input.after),
          ip: req.ip,
          userAgent: req.header('user-agent')?.slice(0, 500),
          requestId: req.requestId,
          status: input.status ?? 'SUCCESS',
        },
      ],
      { session },
    );
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'Failed to write audit log');
    if (session) throw error;
  }
}
