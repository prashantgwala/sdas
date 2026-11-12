import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE, CSRF_COOKIE } from '../config/constants';
import { corsOrigins } from '../config/env';
import { AppError } from './error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.header('origin');
  if (origin && corsOrigins.length > 0 && !corsOrigins.includes(origin)) {
    next(new AppError(403, 'Request origin is not allowed', 'CSRF_ORIGIN_REJECTED'));
    return;
  }

  const cookies = req.cookies as Record<string, string> | undefined;
  const hasSession = Boolean(cookies?.[ACCESS_COOKIE]);
  if (!hasSession) {
    next();
    return;
  }

  const cookieToken = cookies?.[CSRF_COOKIE];
  const headerToken = req.header('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(new AppError(403, 'Invalid or missing CSRF token', 'CSRF_TOKEN_INVALID'));
    return;
  }

  next();
}
