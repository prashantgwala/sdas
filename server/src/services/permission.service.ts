import { ROLE_DEFAULT_PERMISSIONS, type Role } from '../config/constants';
import { Role as RoleModel } from '../models/rbac';

const cache = new Map<Role, { permissions: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getPermissionsForRole(role: Role): Promise<string[]> {
  const cached = cache.get(role);
  if (cached && cached.expiresAt > Date.now()) return cached.permissions;

  const record = await RoleModel.findOne({ key: role }).lean();
  const permissions = record?.permissions?.length
    ? record.permissions
    : ROLE_DEFAULT_PERMISSIONS[role];

  cache.set(role, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
  return permissions;
}

export function invalidatePermissionCache(role?: Role): void {
  if (role) cache.delete(role);
  else cache.clear();
}
