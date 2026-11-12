import type { Role } from '../config/constants';

export type DataScopeType = 'SELF' | 'ASSIGNED' | 'DEPARTMENT' | 'DISTRICT' | 'PLATFORM';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  role: Role;
  department?: string | null;
  departmentName?: string | null;
  office?: string | null;
  designation?: string | null;
  status: string;
  permissions: string[];
}

export interface DataScope {
  type: DataScopeType;
  userId: string;
  departmentId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthUser;
      sessionId?: string;
      scope?: DataScope;
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

export {};
