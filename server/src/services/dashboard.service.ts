import type { Request } from 'express';
import { Types } from 'mongoose';
import { Grievance } from '../models/grievance';
import { Application } from '../models/application';
import { DigitalFile, FileMovement } from '../models/file';
import { Feedback } from '../models/feedback';
import { Meeting, MeetingTask } from '../models/meeting';
import { Incident, WeatherAlert } from '../models/disaster';
import { RoadDamageReport } from '../models/infrastructure';
import { Notification } from '../models/notification';
import { User } from '../models/user';
import { Department } from '../models/org';
import { AuditLog, Integration, JobRun } from '../models/platform';
import {
  applicationListFilter,
  fileListFilter,
  grievanceListFilter,
} from './access.service';

interface NamedCount {
  label: string;
  value: number;
}

async function countByStatus(
  model: any,
  field: string,
  match: Record<string, unknown>,
): Promise<NamedCount[]> {
  const rows = (await model.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])) as Array<{ _id: string | null; count: number }>;
  return rows.map((row) => ({ label: row._id ?? 'UNKNOWN', value: row.count }));
}

async function trend(
  model: any,
  match: Record<string, unknown>,
  dateField: string,
  days = 14,
): Promise<Array<{ date: string; value: number }>> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  const rows = (await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone: 'Asia/Kolkata' } },
        count: { $sum: 1 },
      },
    },
  ])) as Array<{ _id: string; count: number }>;
  const map = new Map(rows.map((row) => [row._id, row.count]));
  const series: Array<{ date: string; value: number }> = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(since);
    date.setDate(since.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    series.push({ date: key, value: map.get(key) ?? 0 });
  }
  return series;
}

async function departmentBreakdown(
  collection: 'grievances' | 'applications' | 'files',
  match: Record<string, unknown>,
): Promise<NamedCount[]> {
  const rows = (await (collection === 'grievances'
    ? Grievance.aggregate([
        { $match: match },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
    : collection === 'applications'
      ? Application.aggregate([
          { $match: match },
          { $group: { _id: '$department', count: { $sum: 1 } } },
          { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ])
      : DigitalFile.aggregate([
          { $match: match },
          { $group: { _id: '$department', count: { $sum: 1 } } },
          { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]))) as Array<{
    _id: unknown;
    count: number;
    dept?: Array<{ name?: string }>;
  }>;
  return rows.map((row) => ({
    label: row.dept?.[0]?.name ?? 'Unassigned',
    value: row.count,
  }));
}

async function taskSummary(userId: string) {
  const now = new Date();
  const [tasks, open, overdue] = await Promise.all([
    MeetingTask.find({ assignedTo: userId, status: { $in: ['OPEN', 'IN_PROGRESS', 'OVERDUE'] } } as never)
      .populate('meeting', 'title scheduledAt')
      .sort({ dueDate: 1 })
      .limit(8)
      .lean(),
    MeetingTask.countDocuments({ assignedTo: userId, status: { $in: ['OPEN', 'IN_PROGRESS'] } } as never),
    MeetingTask.countDocuments({
      assignedTo: userId,
      status: { $in: ['OPEN', 'IN_PROGRESS'] },
      dueDate: { $lt: now },
    } as never),
  ]);
  return { tasks: tasks as unknown[], open, overdue };
}

async function unreadNotifications(userId: string): Promise<number> {
  return Notification.countDocuments({ recipient: userId, readAt: null } as never);
}

function scopedUser(req: Request) {
  return req.user!;
}

export async function getDashboard(req: Request): Promise<Record<string, unknown>> {
  const user = scopedUser(req);
  const grievanceFilter = grievanceListFilter(req);
  const applicationFilter = applicationListFilter(req);
  const fileFilter = fileListFilter(req);
  const now = new Date();
  const dueSoon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [unread, taskData] = await Promise.all([
    unreadNotifications(user.id),
    taskSummary(user.id),
  ]);

  if (user.role === 'CITIZEN') {
    const openGrievance = { $in: ['SUBMITTED', 'RECEIVED', 'UNDER_VERIFICATION', 'ASSIGNED', 'UNDER_INVESTIGATION', 'ACTION_TAKEN', 'PENDING_APPROVAL', 'REOPENED'] };
    const [grievanceStatus, applicationStatus, totalGrievances, openGrievances, totalApplications, openApplications, recentGrievances, recentApplications, feedback] = await Promise.all([
      countByStatus(Grievance, 'status', grievanceFilter),
      countByStatus(Application, 'status', applicationFilter),
      Grievance.countDocuments(grievanceFilter as never),
      Grievance.countDocuments({ ...grievanceFilter, status: openGrievance } as never),
      Application.countDocuments(applicationFilter as never),
      Application.countDocuments({ ...applicationFilter, status: { $in: ['SUBMITTED', 'UNDER_VERIFICATION', 'DOCUMENT_PENDING', 'UNDER_REVIEW', 'PENDING_DECISION'] } } as never),
      Grievance.find(grievanceFilter as never)
        .select('grievanceId subject status priority sla createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Application.find(applicationFilter as never)
        .select('applicationId status priority sla createdAt updatedAt type')
        .populate('type', 'name code')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Feedback.aggregate([
        { $match: { citizen: new Types.ObjectId(user.id) } },
        { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
    ]);

    return {
      role: user.role,
      generatedAt: new Date().toISOString(),
      stats: { totalGrievances, openGrievances, totalApplications, openApplications, unread, openTasks: taskData.open },
      charts: {
        grievancesByStatus: grievanceStatus,
        applicationsByStatus: applicationStatus,
        grievanceTrend: await trend(Grievance, grievanceFilter, 'createdAt'),
      },
      recent: {
        grievances: recentGrievances,
        applications: recentApplications,
      },
      feedback: (feedback as Array<{ average?: number; count?: number }>)[0] ?? { average: 0, count: 0 },
      tasks: taskData.tasks,
    };
  }

  const isDistrictWide = user.role === 'DISTRICT_ADMIN';
  const [grievanceStatus, applicationStatus, fileStatus, overdueGrievances, dueSoonGrievances, totalGrievances, openApplications, totalFiles, recentGrievances, recentApplications, feedbackStats, grievanceTrend, resolvedTrend] = await Promise.all([
    countByStatus(Grievance, 'status', grievanceFilter),
    countByStatus(Application, 'status', applicationFilter),
    countByStatus(DigitalFile, 'status', fileFilter),
    Grievance.countDocuments({ ...grievanceFilter, 'sla.status': 'OVERDUE', status: { $nin: ['CLOSED', 'REJECTED', 'RESOLVED'] } } as never),
    Grievance.countDocuments({ ...grievanceFilter, 'sla.dueAt': { $lte: dueSoon, $gt: now }, status: { $nin: ['CLOSED', 'REJECTED', 'RESOLVED'] } } as never),
    Grievance.countDocuments(grievanceFilter as never),
    Application.countDocuments({ ...applicationFilter, status: { $in: ['SUBMITTED', 'UNDER_VERIFICATION', 'DOCUMENT_PENDING', 'UNDER_REVIEW', 'PENDING_DECISION'] } } as never),
    DigitalFile.countDocuments(fileFilter as never),
    Grievance.find(grievanceFilter as never)
      .select('grievanceId subject status priority sla department assignedOfficer createdAt')
      .populate('department', 'name code')
      .populate('assignedOfficer', 'name')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    Application.find(applicationFilter as never)
      .select('applicationId status priority sla department createdAt type')
      .populate('department', 'name code')
      .populate('type', 'name code')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    Feedback.aggregate([
      { $match: user.department && !isDistrictWide ? { department: new Types.ObjectId(String(user.department)) } : {} },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    trend(Grievance, grievanceFilter, 'createdAt'),
    trend(Grievance, { ...grievanceFilter, resolvedAt: { $ne: null } }, 'resolvedAt'),
  ]);

  const base: Record<string, unknown> = {
    role: user.role,
    generatedAt: new Date().toISOString(),
    stats: {
      totalGrievances,
      overdueGrievances,
      dueSoonGrievances,
      openApplications,
      totalFiles,
      unread,
      openTasks: taskData.open,
      overdueTasks: taskData.overdue,
    },
    charts: {
      grievancesByStatus: grievanceStatus,
      applicationsByStatus: applicationStatus,
      filesByStatus: fileStatus,
      grievanceTrend,
      resolvedTrend,
    },
    recent: {
      grievances: recentGrievances,
      applications: recentApplications,
    },
    feedback: (feedbackStats as Array<{ average?: number; count?: number }>)[0] ?? { average: 0, count: 0 },
    tasks: taskData.tasks,
  };

  if (user.role === 'DEPARTMENT_HEAD' && user.department) {
    const [officerWorkload, pendingApprovals, movements] = await Promise.all([
      Grievance.aggregate([
        { $match: { department: new Types.ObjectId(String(user.department)), status: { $nin: ['CLOSED', 'REJECTED', 'RESOLVED'] } } },
        { $group: { _id: '$assignedOfficer', count: { $sum: 1 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      DigitalFile.countDocuments({ department: user.department, status: 'APPROVAL_PENDING' } as never),
      FileMovement.find({ toUser: user.id, status: 'DISPATCHED' } as never)
        .populate('file', 'fileId subject priority')
        .sort({ dispatchedAt: -1 })
        .limit(5)
        .lean(),
    ]);
    base.stats = { ...(base.stats as object), pendingApprovals };
    base.officerWorkload = officerWorkload;
    base.inbox = movements;
  }

  if (isDistrictWide || user.role === 'SUPER_ADMIN') {
    const [deptStats, activeIncidents, activeAlerts, roadOpen, staffCount, departments] = await Promise.all([
      departmentBreakdown('grievances', {}),
      Incident.countDocuments({ status: { $in: ['REPORTED', 'ACTIVE', 'CONTAINED'] } } as never),
      WeatherAlert.countDocuments({ active: true, validTo: { $gt: now } } as never),
      RoadDamageReport.countDocuments({ repairStatus: { $nin: ['COMPLETED', 'REJECTED'] } } as never),
      User.countDocuments({ status: 'ACTIVE' } as never),
      Department.countDocuments({ active: true } as never),
    ]);
    base.district = {
      departments: departments,
      activeStaff: staffCount,
      activeIncidents,
      activeAlerts,
      openRoadReports: roadOpen,
      grievanceByDepartment: deptStats,
      applicationByDepartment: await departmentBreakdown('applications', {}),
    };
    base.alerts = await WeatherAlert.find({ active: true, validTo: { $gt: now } } as never)
      .sort({ severity: -1, validTo: 1 })
      .limit(5)
      .lean();
  }

  if (user.role === 'SUPER_ADMIN') {
    const [usersByRole, auditRecent, integrations, jobRuns, meetings] = await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      AuditLog.find({}).sort({ createdAt: -1 }).limit(8).lean(),
      Integration.find({}).select('key name category status lastTestAt lastError').lean(),
      JobRun.find({}).sort({ startedAt: -1 }).limit(6).lean(),
      Meeting.countDocuments({ scheduledAt: { $gte: now }, status: 'SCHEDULED' } as never),
    ]);
    base.system = {
      usersByRole,
      upcomingMeetings: meetings,
      integrations,
      jobRuns,
      auditRecent,
    };
  }

  return base;
}
