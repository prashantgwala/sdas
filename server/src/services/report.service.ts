import type { Request } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { z } from 'zod';
import { Grievance } from '../models/grievance';
import { Application } from '../models/application';
import { DigitalFile } from '../models/file';
import { Feedback } from '../models/feedback';
import { HelpdeskTicket } from '../models/platform';
import { Incident } from '../models/disaster';
import { RoadDamageReport } from '../models/infrastructure';
import { MeetingTask } from '../models/meeting';
import { User } from '../models/user';
import { ROLE_LABELS } from '../config/constants';
import { AppError } from '../middleware/error';
import { fileListFilter } from './access.service';
import { recordAudit } from './audit.service';
import { getSetting } from './setting.service';
import type { reportExportQuery } from '../validators/report';

type Input<T> = z.infer<T>;

const TERMINAL_GRIEVANCE = ['RESOLVED', 'CLOSED', 'REJECTED'];

interface Column {
  key: string;
  header: string;
  weight: number;
}

interface Dataset {
  title: string;
  filename: string;
  columns: Column[];
  rows: Array<Record<string, unknown>>;
}

function date(value: unknown): string {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && '_id' in (value as Record<string, unknown>)) {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') return record.name;
    if (typeof record.title === 'string') return record.title;
    return String(record._id);
  }
  return String(value);
}

function rangeFilter(query: { from?: Date; to?: Date }): Record<string, unknown> {
  if (query.from && query.to && query.from > query.to) {
    throw new AppError(422, 'From date must be before to date', 'VALIDATION_ERROR');
  }
  if (!query.from && !query.to) return {};
  return {
    createdAt: {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    },
  };
}

function isDistrict(req: Request): boolean {
  return req.user!.role === 'DISTRICT_ADMIN' || req.user!.role === 'SUPER_ADMIN';
}

function scopeDepartment(req: Request, requested?: string): string | null {
  if (req.user!.role === 'CITIZEN') {
    throw new AppError(403, 'Reports are not available for citizen accounts', 'FORBIDDEN_ROLE');
  }
  if (isDistrict(req)) return requested ?? null;
  return req.user!.department ?? null;
}

async function groupStatus(model: any, match: Record<string, unknown>) {
  return model.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]) as Promise<Array<{ _id: string; count: number }>>;
}

export async function getReportSummary(req: Request, query: { from?: Date; to?: Date; department?: string }) {
  const department = scopeDepartment(req, query.department);
  const dateRange = rangeFilter(query);
  const grievanceMatch: Record<string, unknown> = { ...dateRange };
  const applicationMatch: Record<string, unknown> = { ...dateRange };
  const fileMatch: Record<string, unknown> = { ...dateRange };
  const feedbackMatch: Record<string, unknown> = { ...dateRange };
  const ticketMatch: Record<string, unknown> = { ...dateRange };
  const roadMatch: Record<string, unknown> = { ...dateRange };
  if (department) {
    grievanceMatch.department = department;
    applicationMatch.department = department;
    fileMatch.department = department;
    feedbackMatch.department = department;
    ticketMatch.department = department;
    roadMatch.assignedDepartment = department;
  }

  const now = new Date();
  const [
    grievanceStatus,
    grievancePriority,
    applicationStatus,
    fileStatus,
    ticketStatus,
    roadStatus,
    feedbackSummary,
    feedbackRatings,
    grievanceResolution,
    departmentBreakdown,
    incidents,
  ] = await Promise.all([
    groupStatus(Grievance, grievanceMatch),
    Grievance.aggregate([
      { $match: grievanceMatch },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    groupStatus(Application, applicationMatch),
    groupStatus(DigitalFile, fileMatch),
    groupStatus(HelpdeskTicket, ticketMatch),
    groupStatus(RoadDamageReport, roadMatch),
    Feedback.aggregate([
      { $match: feedbackMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING_REVIEW'] }, 1, 0] } },
        },
      },
    ]),
    Feedback.aggregate([
      { $match: feedbackMatch },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Grievance.aggregate([
      { $match: { ...grievanceMatch, resolvedAt: { $ne: null } } },
      {
        $project: {
          days: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 86400000] },
        },
      },
      { $group: { _id: null, averageDays: { $avg: '$days' }, resolved: { $sum: 1 } } },
    ]),
    isDistrict(req)
      ? Grievance.aggregate([
          { $match: grievanceMatch },
          { $group: { _id: '$department', total: { $sum: 1 }, resolved: { $sum: { $cond: [{ $in: ['$status', TERMINAL_GRIEVANCE] }, 1, 0] } } } },
          { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
          { $sort: { total: -1 } },
        ])
      : Promise.resolve([]),
    isDistrict(req)
      ? Incident.aggregate([
          { $match: dateRange },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
  ]);

  const grievanceTotal = grievanceStatus.reduce((sum, item) => sum + item.count, 0);
  const resolvedGrievances = grievanceStatus
    .filter((item) => TERMINAL_GRIEVANCE.includes(item._id))
    .reduce((sum, item) => sum + item.count, 0);
  const openGrievances = grievanceTotal - resolvedGrievances;
  const overdueGrievances = await Grievance.countDocuments({
    ...grievanceMatch,
    'sla.status': 'OVERDUE',
    status: { $nin: TERMINAL_GRIEVANCE },
  } as never);

  return {
    range: { from: query.from ?? null, to: query.to ?? null },
    scope: { department, districtWide: isDistrict(req) },
    generatedAt: now.toISOString(),
    grievances: {
      total: grievanceTotal,
      open: openGrievances,
      resolved: resolvedGrievances,
      overdue: overdueGrievances,
      resolutionRate: grievanceTotal > 0 ? Math.round((resolvedGrievances / grievanceTotal) * 100) : 0,
      averageResolutionDays:
        Math.round(((grievanceResolution as Array<{ averageDays?: number }>)[0]?.averageDays ?? 0) * 10) / 10,
      byStatus: grievanceStatus,
      byPriority: grievancePriority,
      byDepartment: departmentBreakdown,
    },
    applications: {
      total: applicationStatus.reduce((sum, item) => sum + item.count, 0),
      byStatus: applicationStatus,
    },
    files: {
      total: fileStatus.reduce((sum, item) => sum + item.count, 0),
      byStatus: fileStatus,
    },
    helpdesk: {
      total: ticketStatus.reduce((sum, item) => sum + item.count, 0),
      byStatus: ticketStatus,
    },
    roads: {
      total: roadStatus.reduce((sum, item) => sum + item.count, 0),
      byStatus: roadStatus,
    },
    feedback: {
      total: (feedbackSummary as Array<{ total?: number }>)[0]?.total ?? 0,
      averageRating: Math.round(((feedbackSummary as Array<{ averageRating?: number }>)[0]?.averageRating ?? 0) * 10) / 10,
      pending: (feedbackSummary as Array<{ pending?: number }>)[0]?.pending ?? 0,
      byRating: feedbackRatings,
    },
    incidents: isDistrict(req)
      ? { byStatus: incidents, total: (incidents as Array<{ count: number }>).reduce((sum, item) => sum + item.count, 0) }
      : null,
  };
}

export async function getDepartmentPerformance(req: Request, query: { from?: Date; to?: Date; department?: string }) {
  if (!(isDistrict(req) || req.user!.role === 'DEPARTMENT_HEAD')) {
    throw new AppError(403, 'Department performance is restricted', 'FORBIDDEN_ROLE');
  }
  const department = scopeDepartment(req, query.department);
  const dateRange = rangeFilter(query);
  const base: Record<string, unknown> = { ...dateRange };
  if (department) base.department = department;

  const [grievances, applications, feedback] = await Promise.all([
    Grievance.aggregate([
      { $match: base },
      {
        $group: {
          _id: '$department',
          total: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $in: ['$status', TERMINAL_GRIEVANCE] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ['$sla.status', 'OVERDUE'] }, 1, 0] } },
          avgResolutionDays: {
            $avg: {
              $cond: [
                { $ne: ['$resolvedAt', null] },
                { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 86400000] },
                null,
              ],
            },
          },
        },
      },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
    ]),
    Application.aggregate([
      { $match: base },
      { $group: { _id: '$department', total: { $sum: 1 } } },
    ]),
    Feedback.aggregate([
      { $match: base },
      { $group: { _id: '$department', count: { $sum: 1 }, averageRating: { $avg: '$rating' } } },
    ]),
  ]);

  const applicationMap = new Map(
    (applications as Array<{ _id: unknown; total: number }>).map((item) => [String(item._id), item.total]),
  );
  const feedbackMap = new Map(
    (feedback as Array<{ _id: unknown; count: number; averageRating: number }>).map((item) => [
      String(item._id),
      item,
    ]),
  );

  return (grievances as Array<Record<string, unknown>>).map((item) => {
    const id = String(item._id);
    const departmentInfo = (item.department as Array<{ name?: string; code?: string }> | undefined)?.[0];
    const rating = feedbackMap.get(id);
    return {
      departmentId: id,
      department: departmentInfo?.name ?? 'Unassigned',
      code: departmentInfo?.code ?? '',
      grievances: item.total,
      resolved: item.resolved,
      overdue: item.overdue,
      averageResolutionDays: Math.round(((item.avgResolutionDays as number | null) ?? 0) * 10) / 10,
      applications: applicationMap.get(id) ?? 0,
      feedbackCount: rating?.count ?? 0,
      averageRating: Math.round((rating?.averageRating ?? 0) * 10) / 10,
    };
  });
}

/* ------------------------------ officer workload ------------------------------ */

const TERMINAL_APPLICATION = ['APPROVED', 'REJECTED', 'CLOSED'];
const OPEN_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'OVERDUE'];

export async function getOfficerWorkload(req: Request, query: { from?: Date; to?: Date; department?: string }) {
  if (!(isDistrict(req) || req.user!.role === 'DEPARTMENT_HEAD')) {
    throw new AppError(403, 'Officer workload is restricted', 'FORBIDDEN_ROLE');
  }
  const department = scopeDepartment(req, query.department);
  const dateRange = rangeFilter(query);
  const now = new Date();

  const officerFilter: Record<string, unknown> = {
    role: { $in: ['CLERK', 'OFFICER'] },
    status: 'ACTIVE',
  };
  if (department) officerFilter.department = department;

  const officers = await User.find(officerFilter as never)
    .select('name designation role department')
    .populate('department', 'name code')
    .sort({ name: 1 })
    .lean();

  const officerIds = officers.map((officer) => officer._id as never);
  if (officerIds.length === 0) return [];

  const grievanceMatch: Record<string, unknown> = { assignedOfficer: { $in: officerIds }, ...dateRange };
  const applicationMatch: Record<string, unknown> = { assignedOfficer: { $in: officerIds }, ...dateRange };
  const taskMatch: Record<string, unknown> = { assignedTo: { $in: officerIds }, ...dateRange };
  if (department) {
    grievanceMatch.department = department;
    applicationMatch.department = department;
    taskMatch.department = department;
  }

  const [grievanceStats, applicationStats, taskStats] = await Promise.all([
    Grievance.aggregate([
      { $match: grievanceMatch },
      {
        $group: {
          _id: '$assignedOfficer',
          assigned: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$status', TERMINAL_GRIEVANCE] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ['$sla.status', 'OVERDUE'] }, 1, 0] } },
        },
      },
    ]),
    Application.aggregate([
      { $match: applicationMatch },
      {
        $group: {
          _id: '$assignedOfficer',
          assigned: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$status', TERMINAL_APPLICATION] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ['$sla.status', 'OVERDUE'] }, 1, 0] } },
        },
      },
    ]),
    MeetingTask.aggregate([
      { $match: taskMatch },
      {
        $group: {
          _id: '$assignedTo',
          open: { $sum: { $cond: [{ $in: ['$status', OPEN_TASK_STATUSES] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                { $and: [{ $in: ['$status', OPEN_TASK_STATUSES] }, { $lt: ['$dueDate', now] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  type CountRow = { _id: unknown; assigned: number; completed: number; overdue: number };
  type TaskRow = { _id: unknown; open: number; overdue: number };
  const grievanceMap = new Map((grievanceStats as CountRow[]).map((row) => [String(row._id), row]));
  const applicationMap = new Map((applicationStats as CountRow[]).map((row) => [String(row._id), row]));
  const taskMap = new Map((taskStats as TaskRow[]).map((row) => [String(row._id), row]));

  return officers.map((officer) => {
    const record = officer as Record<string, unknown>;
    const id = String(record._id);
    const grievance = grievanceMap.get(id);
    const application = applicationMap.get(id);
    const task = taskMap.get(id);
    const departmentInfo = record.department as { _id?: unknown; name?: string; code?: string } | null;

    const assigned = (grievance?.assigned ?? 0) + (application?.assigned ?? 0);
    const completed = (grievance?.completed ?? 0) + (application?.completed ?? 0);
    const overdue = (grievance?.overdue ?? 0) + (application?.overdue ?? 0);
    const pending = assigned - completed;

    return {
      officerId: id,
      name: record.name,
      designation: record.designation ?? null,
      role: record.role,
      roleLabel: ROLE_LABELS[record.role as keyof typeof ROLE_LABELS] ?? record.role,
      department: departmentInfo?.name
        ? { id: String(departmentInfo._id), name: departmentInfo.name, code: departmentInfo.code ?? '' }
        : null,
      assigned,
      completed,
      pending,
      overdue,
      grievanceAssigned: grievance?.assigned ?? 0,
      grievanceCompleted: grievance?.completed ?? 0,
      applicationAssigned: application?.assigned ?? 0,
      applicationCompleted: application?.completed ?? 0,
      openTasks: task?.open ?? 0,
      overdueTasks: task?.overdue ?? 0,
      workload: pending + (task?.open ?? 0),
    };
  });
}

/* --------------------------------- exports -------------------------------- */

async function buildGrievanceDataset(req: Request, query: Input<typeof reportExportQuery>): Promise<Dataset> {
  const filter: Record<string, unknown> = { ...rangeFilter(query) };
  const department = scopeDepartment(req, query.department);
  if (department) filter.department = department;
  if (query.status) filter.status = query.status;

  const records = await Grievance.find(filter as never)
    .populate('department', 'name')
    .populate('category', 'name')
    .populate('assignedOfficer', 'name')
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();

  return {
    title: 'Grievance Register',
    filename: 'grievances',
    columns: [
      { key: 'id', header: 'Grievance ID', weight: 14 },
      { key: 'subject', header: 'Subject', weight: 26 },
      { key: 'department', header: 'Department', weight: 14 },
      { key: 'category', header: 'Category', weight: 12 },
      { key: 'priority', header: 'Priority', weight: 8 },
      { key: 'status', header: 'Status', weight: 14 },
      { key: 'sla', header: 'SLA', weight: 10 },
      { key: 'officer', header: 'Officer', weight: 12 },
      { key: 'created', header: 'Submitted', weight: 10 },
      { key: 'resolved', header: 'Resolved', weight: 10 },
    ],
    rows: records.map((record) => ({
      id: record.grievanceId ?? String(record._id),
      subject: record.subject,
      department: text(record.department),
      category: text(record.category),
      priority: record.priority,
      status: record.status,
      sla: (record.sla as { status?: string } | undefined)?.status ?? '',
      officer: text(record.assignedOfficer),
      created: date(record.createdAt),
      resolved: date(record.resolvedAt),
    })),
  };
}

async function buildApplicationDataset(req: Request, query: Input<typeof reportExportQuery>): Promise<Dataset> {
  const filter: Record<string, unknown> = { ...rangeFilter(query) };
  const department = scopeDepartment(req, query.department);
  if (department) filter.department = department;
  if (query.status) filter.status = query.status;

  const records = await Application.find(filter as never)
    .populate('department', 'name')
    .populate('type', 'name')
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();

  return {
    title: 'Application Register',
    filename: 'applications',
    columns: [
      { key: 'id', header: 'Application ID', weight: 16 },
      { key: 'type', header: 'Service', weight: 24 },
      { key: 'department', header: 'Department', weight: 18 },
      { key: 'status', header: 'Status', weight: 14 },
      { key: 'priority', header: 'Priority', weight: 10 },
      { key: 'sla', header: 'SLA', weight: 10 },
      { key: 'created', header: 'Submitted', weight: 10 },
      { key: 'decided', header: 'Decided', weight: 10 },
    ],
    rows: records.map((record) => ({
      id: record.applicationId ?? String(record._id),
      type: text(record.type),
      department: text(record.department),
      status: record.status,
      priority: record.priority,
      sla: (record.sla as { status?: string } | undefined)?.status ?? '',
      created: date(record.submittedAt ?? record.createdAt),
      decided: date((record.decision as { decidedAt?: Date } | null | undefined)?.decidedAt),
    })),
  };
}

async function buildFileDataset(req: Request, query: Input<typeof reportExportQuery>): Promise<Dataset> {
  const filter: Record<string, unknown> = { ...rangeFilter(query), ...fileListFilter(req) };
  const department = scopeDepartment(req, query.department);
  if (department) filter.department = department;
  if (query.status) filter.status = query.status;

  const records = await DigitalFile.find(filter as never)
    .populate('department', 'name')
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();

  return {
    title: 'Digital File Register',
    filename: 'files',
    columns: [
      { key: 'id', header: 'File No.', weight: 14 },
      { key: 'subject', header: 'Subject', weight: 28 },
      { key: 'department', header: 'Department', weight: 18 },
      { key: 'status', header: 'Status', weight: 14 },
      { key: 'classification', header: 'Classification', weight: 12 },
      { key: 'priority', header: 'Priority', weight: 8 },
      { key: 'created', header: 'Registered', weight: 10 },
    ],
    rows: records.map((record) => ({
      id: record.fileNumber ?? record.fileId ?? String(record._id),
      subject: record.subject,
      department: text(record.department),
      status: record.status,
      classification: record.confidentiality,
      priority: record.priority,
      created: date(record.createdAt),
    })),
  };
}

async function buildFeedbackDataset(req: Request, query: Input<typeof reportExportQuery>): Promise<Dataset> {
  const filter: Record<string, unknown> = { ...rangeFilter(query) };
  const department = scopeDepartment(req, query.department);
  if (department) filter.department = department;
  if (query.status) filter.status = query.status;

  const records = await Feedback.find(filter as never)
    .populate('department', 'name')
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();

  return {
    title: 'Citizen Feedback',
    filename: 'feedback',
    columns: [
      { key: 'category', header: 'Category', weight: 18 },
      { key: 'department', header: 'Department', weight: 18 },
      { key: 'rating', header: 'Rating', weight: 8 },
      { key: 'status', header: 'Status', weight: 12 },
      { key: 'topics', header: 'Topics', weight: 22 },
      { key: 'text', header: 'Feedback', weight: 34 },
      { key: 'created', header: 'Received', weight: 10 },
    ],
    rows: records.map((record) => ({
      category: record.category,
      department: text(record.department),
      rating: record.rating,
      status: record.status,
      topics: (record.aiTopics ?? []).join(', '),
      text: record.text,
      created: date(record.createdAt),
    })),
  };
}

async function buildHelpdeskDataset(req: Request, query: Input<typeof reportExportQuery>): Promise<Dataset> {
  const filter: Record<string, unknown> = { ...rangeFilter(query) };
  const department = scopeDepartment(req, query.department);
  if (department) filter.department = department;
  if (query.status) filter.status = query.status;

  const records = await HelpdeskTicket.find(filter as never)
    .populate('department', 'name')
    .populate('assignedTo', 'name')
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();

  return {
    title: 'Helpdesk Tickets',
    filename: 'helpdesk',
    columns: [
      { key: 'id', header: 'Ticket ID', weight: 14 },
      { key: 'subject', header: 'Subject', weight: 28 },
      { key: 'category', header: 'Category', weight: 14 },
      { key: 'department', header: 'Department', weight: 14 },
      { key: 'priority', header: 'Priority', weight: 8 },
      { key: 'status', header: 'Status', weight: 12 },
      { key: 'assigned', header: 'Assigned To', weight: 14 },
      { key: 'created', header: 'Created', weight: 10 },
    ],
    rows: records.map((record) => ({
      id: record.ticketId ?? String(record._id),
      subject: record.subject,
      category: record.category,
      department: text(record.department),
      priority: record.priority,
      status: record.status,
      assigned: text(record.assignedTo),
      created: date(record.createdAt),
    })),
  };
}

function assertExportPermission(req: Request, type: Input<typeof reportExportQuery>['type']): void {
  const permissions = req.user!.permissions;
  const required: Record<string, string> = {
    grievances: 'grievance.export',
    applications: 'application.export',
    files: 'file.export',
    feedback: 'feedback.read.dept',
    helpdesk: 'helpdesk.read.dept',
  };
  const permission = required[type];
  if (permission && !permissions.includes(permission)) {
    const alt = isDistrict(req) && type === 'feedback' ? 'feedback.read.district' : null;
    const altHelpdesk = isDistrict(req) && type === 'helpdesk' ? 'helpdesk.read.district' : null;
    if (
      !(alt && permissions.includes(alt)) &&
      !(altHelpdesk && permissions.includes(altHelpdesk))
    ) {
      throw new AppError(403, 'You do not have permission to export this dataset', 'FORBIDDEN_PERMISSION');
    }
  }
}

function escapeCsv(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(dataset: Dataset): Buffer {
  const lines = [
    dataset.columns.map((column) => escapeCsv(column.header)).join(','),
    ...dataset.rows.map((row) => dataset.columns.map((column) => escapeCsv(row[column.key])).join(',')),
  ];
  return Buffer.from(`\ufeff${lines.join('\r\n')}`, 'utf8');
}

async function toXlsx(dataset: Dataset): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SDAS';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(dataset.title);
  sheet.columns = dataset.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: Math.max(12, column.weight),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  for (const row of dataset.rows) sheet.addRow(row);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, dataset.rows.length + 1), column: dataset.columns.length },
  };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function toPdf(dataset: Dataset): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - 60;
  const totalWeight = dataset.columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = dataset.columns.map((column) => (pageWidth * column.weight) / totalWeight);
  const left = 30;

  const drawHeader = () => {
    let x = left;
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(7);
    dataset.columns.forEach((column, index) => {
      doc.text(column.header, x, y, { width: widths[index], lineBreak: true });
      x += widths[index];
    });
    doc.moveDown(0.4);
    doc
      .moveTo(left, doc.y)
      .lineTo(left + pageWidth, doc.y)
      .strokeColor('#999999')
      .stroke();
    doc.moveDown(0.3);
  };

  doc.font('Helvetica-Bold').fontSize(14).text(dataset.title, { align: 'center' });
  doc.font('Helvetica').fontSize(8).text(`Generated ${new Date().toLocaleString('en-IN')} · ${dataset.rows.length} record(s)`, {
    align: 'center',
  });
  doc.moveDown(0.8);
  drawHeader();

  for (const row of dataset.rows) {
    doc.font('Helvetica').fontSize(7);
    const cellHeights = dataset.columns.map((column, index) =>
      doc.heightOfString(String(row[column.key] ?? ''), { width: widths[index] - 4 }),
    );
    const rowHeight = Math.max(...cellHeights) + 4;
    if (doc.y + rowHeight > doc.page.height - 40) {
      doc.addPage();
      drawHeader();
      doc.font('Helvetica').fontSize(7);
    }
    let x = left;
    const y = doc.y;
    dataset.columns.forEach((column, index) => {
      doc.text(String(row[column.key] ?? ''), x + 1, y, {
        width: widths[index] - 4,
        height: rowHeight,
        ellipsis: true,
      });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  }

  doc.end();
  return finished;
}

export async function exportReport(
  req: Request,
  query: Input<typeof reportExportQuery>,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  assertExportPermission(req, query.type);
  const enabledFormats = await getSetting<string[]>('reports.exportFormats', ['CSV', 'XLSX', 'PDF']);
  const allowedFormats = (Array.isArray(enabledFormats) ? enabledFormats : []).map((format) =>
    String(format).toLowerCase(),
  );
  if (allowedFormats.length > 0 && !allowedFormats.includes(query.format)) {
    throw new AppError(
      403,
      `The ${query.format.toUpperCase()} export format is currently disabled by the administrator`,
      'EXPORT_FORMAT_DISABLED',
    );
  }
  const builders: Record<string, (req: Request, query: Input<typeof reportExportQuery>) => Promise<Dataset>> = {
    grievances: buildGrievanceDataset,
    applications: buildApplicationDataset,
    files: buildFileDataset,
    feedback: buildFeedbackDataset,
    helpdesk: buildHelpdeskDataset,
  };
  const dataset = await builders[query.type](req, query);

  let buffer: Buffer;
  let contentType: string;
  switch (query.format) {
    case 'xlsx':
      buffer = await toXlsx(dataset);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    case 'pdf':
      buffer = await toPdf(dataset);
      contentType = 'application/pdf';
      break;
    default:
      buffer = toCsv(dataset);
      contentType = 'text/csv; charset=utf-8';
  }

  const filename = `${dataset.filename}-${new Date().toISOString().slice(0, 10)}.${query.format}`;
  await recordAudit(req, {
    action: 'REPORT_EXPORTED',
    entityType: 'Report',
    entityLabel: dataset.title,
    after: { type: query.type, format: query.format, rows: dataset.rows.length },
  });
  return { buffer, filename, contentType };
}
