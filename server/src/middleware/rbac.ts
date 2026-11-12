import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../config/constants';
import { AppError } from './error';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'You do not have access to this resource', 'FORBIDDEN_ROLE'));
      return;
    }
    next();
  };
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
      return;
    }
    const missing = permissions.filter((permission) => !req.user!.permissions.includes(permission));
    if (missing.length > 0) {
      next(
        new AppError(
          403,
          'You do not have permission to perform this action',
          'FORBIDDEN_PERMISSION',
          { required: permissions },
        ),
      );
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
      return;
    }
    const allowed = permissions.some((permission) => req.user!.permissions.includes(permission));
    if (!allowed) {
      next(
        new AppError(
          403,
          'You do not have permission to perform this action',
          'FORBIDDEN_PERMISSION',
          { requiredAny: permissions },
        ),
      );
      return;
    }
    next();
  };
}

export function hasPermission(req: Request, permission: string): boolean {
  return req.user?.permissions.includes(permission) ?? false;
}
