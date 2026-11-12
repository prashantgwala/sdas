import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../middleware/error';
import { Grievance } from '../models/grievance';
import { DigitalFile } from '../models/file';
import { Application } from '../models/application';
import { Meeting, MeetingTask } from '../models/meeting';
import { Incident } from '../models/disaster';
import { RoadDamageReport } from '../models/infrastructure';
import type { AuthUser } from '../types/express';

interface ScopeLike {
  type: 'SELF' | 'ASSIGNED' | 'DEPARTMENT' | 'DISTRICT' | 'PLATFORM';
  userId: string;
  departmentId?: string | null;
}

function currentScope(req: Request): ScopeLike {
  return (
    req.scope ?? {
      type: req.user?.role === 'DISTRICT_ADMIN' ? 'DISTRICT' : 'SELF',
      userId: req.user?.id ?? '',
      departmentId: req.user?.department ?? null,
    }
  );
}

// Populated documents arrive as objects; normalise refs before comparing.
function refId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'object' && '_id' in (value as Record<string, unknown>)) {
    return String((value as { _id: unknown })._id ?? '');
  }
  return String(value);
}

function isCitizen(user: AuthUser | undefined): boolean {
  return user?.role === 'CITIZEN';
}

function isDepartmentScoped(user: AuthUser | undefined): boolean {
  return user?.role === 'CLERK' || user?.role === 'OFFICER' || user?.role === 'DEPARTMENT_HEAD';
}

function isDistrict(user: AuthUser | undefined): boolean {
  return user?.role === 'DISTRICT_ADMIN';
}

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

export function grievanceListFilter(req: Request): Record<string, unknown> {
  const user = req.user!;
  if (isCitizen(user)) return { citizen: objectId(user.id) };
  if (isDistrict(user)) return {};
  if (isDepartmentScoped(user)) {
    if (user.role === 'OFFICER') {
      return {
        $or: [
          { assignedOfficer: objectId(user.id) },
          { department: objectId(String(user.department)), status: { $in: ['RECEIVED', 'ASSIGNED', 'UNDER_INVESTIGATION'] } },
        ],
      };
    }
    return { department: objectId(String(user.department)) };
  }
  return {};
}

export function fileListFilter(req: Request): Record<string, unknown> {
  const user = req.user!;
  const base: Record<string, unknown> = {};
  if (isDepartmentScoped(user)) base.department = objectId(String(user.department));
  if (!user.permissions.includes('file.read.confidential')) {
    base.confidentiality = { $in: ['PUBLIC', 'INTERNAL'] };
  }
  return base;
}

export function applicationListFilter(req: Request): Record<string, unknown> {
  const user = req.user!;
  if (isCitizen(user)) return { citizen: objectId(user.id) };
  if (isDistrict(user)) return {};
  if (isDepartmentScoped(user)) {
    if (user.role === 'OFFICER') {
      return { $or: [{ assignedOfficer: objectId(user.id) }, { department: objectId(String(user.department)) }] };
    }
    return { department: objectId(String(user.department)) };
  }
  return {};
}

export function assertGrievanceAccess(req: Request, grievance: { citizen?: unknown; department?: unknown; assignedOfficer?: unknown }): void {
  const user = req.user!;
  const scope = currentScope(req);
  if (scope.type === 'PLATFORM' || scope.type === 'DISTRICT') return;
  if (isCitizen(user)) {
    if (refId(grievance.citizen) !== user.id) {
      throw new AppError(403, 'You can only access your own grievances', 'FORBIDDEN_SCOPE');
    }
    return;
  }
  if (isDepartmentScoped(user)) {
    if (refId(grievance.department) !== String(user.department ?? '')) {
      throw new AppError(403, 'This grievance belongs to another department', 'FORBIDDEN_SCOPE');
    }
  }
}

export function assertFileAccess(req: Request, file: { department?: unknown; confidentiality?: string }): void {
  const user = req.user!;
  const scope = currentScope(req);
  if (scope.type === 'PLATFORM' || scope.type === 'DISTRICT') {
    if (
      file.confidentiality === 'CONFIDENTIAL' &&
      !user.permissions.includes('file.read.confidential')
    ) {
      throw new AppError(403, 'Confidential file access is restricted', 'FORBIDDEN_CONFIDENTIAL');
    }
    return;
  }
  if (isDepartmentScoped(user)) {
    if (refId(file.department) !== String(user.department ?? '')) {
      throw new AppError(403, 'This file belongs to another department', 'FORBIDDEN_SCOPE');
    }
    if (
      (file.confidentiality === 'CONFIDENTIAL' || file.confidentiality === 'RESTRICTED') &&
      !user.permissions.includes('file.read.confidential')
    ) {
      throw new AppError(403, 'Confidential file access is restricted', 'FORBIDDEN_CONFIDENTIAL');
    }
    return;
  }
  throw new AppError(403, 'You do not have access to files', 'FORBIDDEN_SCOPE');
}

export function assertApplicationAccess(req: Request, application: { citizen?: unknown; department?: unknown; assignedOfficer?: unknown }): void {
  const user = req.user!;
  const scope = currentScope(req);
  if (scope.type === 'PLATFORM' || scope.type === 'DISTRICT') return;
  if (isCitizen(user)) {
    if (refId(application.citizen) !== user.id) {
      throw new AppError(403, 'You can only access your own applications', 'FORBIDDEN_SCOPE');
    }
    return;
  }
  if (isDepartmentScoped(user)) {
    if (refId(application.department) !== String(user.department ?? '')) {
      throw new AppError(403, 'This application belongs to another department', 'FORBIDDEN_SCOPE');
    }
  }
}

export async function assertDocumentAccess(
  req: Request,
  document: { entityType: string; entityId: unknown; uploadedBy?: unknown; confidentiality?: string },
): Promise<void> {
  const user = req.user!;
  if (document.confidentiality === 'RESTRICTED') {
    throw new AppError(403, 'Restricted documents are not available through this endpoint', 'FORBIDDEN_RESTRICTED');
  }
  if (String(document.uploadedBy ?? '') === user.id) return;
  if (user.role === 'SUPER_ADMIN') return;

  switch (document.entityType) {
    case 'GRIEVANCE': {
      const grievance = await Grievance.findById(document.entityId)
        .select('citizen department')
        .lean();
      if (!grievance) throw new AppError(404, 'Grievance not found', 'NOT_FOUND');
      assertGrievanceAccess(req, grievance);
      return;
    }
    case 'FILE': {
      const file = await DigitalFile.findById(document.entityId)
        .select('department confidentiality')
        .lean();
      if (!file) throw new AppError(404, 'File not found', 'NOT_FOUND');
      assertFileAccess(req, file);
      return;
    }
    case 'APPLICATION': {
      const application = await Application.findById(document.entityId)
        .select('citizen department')
        .lean();
      if (!application) throw new AppError(404, 'Application not found', 'NOT_FOUND');
      assertApplicationAccess(req, application);
      return;
    }
    case 'MEETING': {
      const meeting = await Meeting.findById(document.entityId)
        .select('organizer participants department')
        .lean();
      if (!meeting) throw new AppError(404, 'Meeting not found', 'NOT_FOUND');
      const participant = (meeting.participants ?? []).some(
        (item: { user?: unknown }) => String(item.user ?? '') === user.id,
      );
      if (!participant && String(meeting.organizer) !== user.id && String(meeting.department ?? '') !== String(user.department ?? '') && !isDistrict(user)) {
        throw new AppError(403, 'You do not have access to this meeting', 'FORBIDDEN_SCOPE');
      }
      return;
    }
    case 'INCIDENT': {
      const incident = await Incident.findById(document.entityId).select('reportedBy commander').lean();
      if (!incident) throw new AppError(404, 'Incident not found', 'NOT_FOUND');
      if (!isDistrict(user) && !user.permissions.includes('incident.read')) {
        throw new AppError(403, 'You do not have access to this incident', 'FORBIDDEN_SCOPE');
      }
      return;
    }
    case 'ROAD_REPORT': {
      const report = await RoadDamageReport.findById(document.entityId)
        .select('createdBy assignedDepartment')
        .lean();
      if (!report) throw new AppError(404, 'Road report not found', 'NOT_FOUND');
      if (
        !isDistrict(user) &&
        String(report.createdBy) !== user.id &&
        String(report.assignedDepartment ?? '') !== String(user.department ?? '') &&
        !user.permissions.includes('road.read')
      ) {
        throw new AppError(403, 'You do not have access to this report', 'FORBIDDEN_SCOPE');
      }
      return;
    }
    case 'USER':
      if (String(document.entityId) !== user.id && !user.permissions.includes('user.read')) {
        throw new AppError(403, 'You do not have access to this document', 'FORBIDDEN_SCOPE');
      }
      return;
    default:
      return;
  }
}

export async function assertTaskAccess(req: Request, taskId: string): Promise<void> {
  const task = await MeetingTask.findById(taskId).lean();
  if (!task) throw new AppError(404, 'Task not found', 'NOT_FOUND');
  const user = req.user!;
  if (
    String(task.assignedTo) !== user.id &&
    String(task.createdBy) !== user.id &&
    !isDistrict(user) &&
    !user.permissions.includes('meeting.task.assign')
  ) {
    throw new AppError(403, 'You do not have access to this task', 'FORBIDDEN_SCOPE');
  }
}

export function buildVisibilityFilter(req: Request): Record<string, unknown> | null {
  if (!req.user) return { visibility: 'PUBLIC' };
  if (isCitizen(req.user)) return { visibility: 'PUBLIC' };
  return null;
}
