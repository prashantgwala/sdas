import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE } from '../config/constants';
import { AppError } from './error';
import { Session, User } from '../models/user';
import { getPermissionsForRole } from '../services/permission.service';
import { getSetting } from '../services/setting.service';
import { verifyAccessToken } from '../utils/tokens';
import { resolveScope } from './scope';
import type { AuthUser } from '../types/express';

function extractToken(req: Request): string | null {
  const authorization = req.header('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[ACCESS_COOKIE] ?? null;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');

    const payload = verifyAccessToken(token);
    const session = await Session.findOne({
      _id: payload.sid,
      user: payload.sub,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!session) throw new AppError(401, 'Session expired or revoked', 'SESSION_EXPIRED');

    const user = await User.findById(payload.sub)
      .populate('department', 'name code')
      .populate('office', 'name code')
      .lean();
    if (!user) throw new AppError(401, 'User account no longer exists', 'UNAUTHORIZED');
    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'This account is not active', 'ACCOUNT_INACTIVE');
    }

    const permissions = await getPermissionsForRole(user.role);
    const department = user.department as unknown as { _id?: string; name?: string } | null;
    const office = user.office as unknown as { _id?: string; name?: string } | null;

    const authUser: AuthUser = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      department: department?._id ? String(department._id) : null,
      departmentName: department?.name ?? null,
      office: office?._id ? String(office._id) : null,
      designation: user.designation ?? null,
      status: user.status,
      permissions,
    };

    req.user = authUser;
    req.sessionId = payload.sid;
    req.scope = resolveScope(authUser);

    if (user.role === 'CITIZEN' && !isMaintenanceExempt(req)) {
      const maintenance = await getSetting<boolean>('maintenance.mode', false);
      if (maintenance) {
        throw new AppError(
          503,
          'Citizen services are paused for scheduled maintenance. Please try again shortly.',
          'MAINTENANCE_MODE',
        );
      }
    }

    if (Date.now() - new Date(session.lastUsedAt).getTime() > 5 * 60 * 1000) {
      void Session.updateOne({ _id: payload.sid }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    }

    next();
  } catch (error) {
    next(error);
  }
}

const MAINTENANCE_EXEMPT = ['/api/v1/auth', '/api/v1/health'];

function isMaintenanceExempt(req: Request): boolean {
  const path = req.originalUrl.split('?')[0];
  return MAINTENANCE_EXEMPT.some((prefix) => path.startsWith(prefix));
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {  if (!extractToken(req)) {
    next();
    return;
  }
  void authenticate(req, res, next);
}
