import type { Request } from 'express';
import type { AuthUser, DataScope } from '../types/express';

export function resolveScope(user: AuthUser): DataScope {
  switch (user.role) {
    case 'CITIZEN':
      return { type: 'SELF', userId: user.id, departmentId: null };
    case 'CLERK':
    case 'OFFICER':
    case 'DEPARTMENT_HEAD':
      return { type: 'DEPARTMENT', userId: user.id, departmentId: user.department ?? null };
    case 'DISTRICT_ADMIN':
      return { type: 'DISTRICT', userId: user.id, departmentId: null };
    case 'SUPER_ADMIN':
      return { type: 'PLATFORM', userId: user.id, departmentId: null };
    default:
      return { type: 'SELF', userId: user.id, departmentId: null };
  }
}

export function getScope(req: Request): DataScope {
  if (!req.user) {
    return { type: 'SELF', userId: '', departmentId: null };
  }
  return req.scope ?? resolveScope(req.user);
}

export function departmentFilter(req: Request): Record<string, unknown> {
  const scope = getScope(req);
  if (scope.type === 'DEPARTMENT' && scope.departmentId) {
    return { department: scope.departmentId };
  }
  return {};
}
