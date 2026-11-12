import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import type { Role } from '../config/constants';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '../config/constants';
import { env, isProduction } from '../config/env';
import { parseDuration } from './dates';
import { AppError } from '../middleware/error';

export interface AccessPayload {
  sub: string;
  sid: string;
  role: Role;
  type: 'access';
}

export interface RefreshPayload {
  sub: string;
  sid: string;
  jti: string;
  type: 'refresh';
}

export function signAccessToken(
  userId: string,
  sessionId: string,
  role: Role,
  ttlMinutes?: number,
): string {
  const expiresIn =
    ttlMinutes && ttlMinutes > 0 ? Math.floor(ttlMinutes * 60) : (env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn']);
  return jwt.sign({ sub: userId, sid: sessionId, role, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn,
  });
}

export function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { sub: userId, sid: sessionId, jti: crypto.randomUUID(), type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'] },
  );
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    if (payload.type !== 'access') throw new Error('Invalid token type');
    return payload;
  } catch {
    throw new AppError(401, 'Session expired or invalid', 'UNAUTHORIZED');
  }
}

export function verifyRefreshToken(token: string): RefreshPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
    if (payload.type !== 'refresh') throw new Error('Invalid token type');
    return payload;
  } catch {
    throw new AppError(401, 'Refresh session expired or invalid', 'UNAUTHORIZED');
  }
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
  accessMinutes?: number,
): void {
  const secure = env.COOKIE_SECURE || isProduction;
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: (accessMinutes && accessMinutes > 0 ? accessMinutes : parseDuration(env.ACCESS_TOKEN_TTL) / 60_000) * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  const secure = env.COOKIE_SECURE || isProduction;
  const options = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}
