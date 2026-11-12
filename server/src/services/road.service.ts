import { Types } from 'mongoose';
import type { Request } from 'express';
import type { z } from 'zod';
import { RoadDamageReport } from '../models/infrastructure';
import { AppError } from '../middleware/error';
import { addTimeline } from './timeline.service';
import { recordAudit } from './audit.service';
import { notifyRole, notifyUsers } from './notification.service';
import { nextSequence } from '../utils/ids';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type {
  closeRoadSchema,
  createRoadReportSchema,
  inspectRoadSchema,
  repairUpdateSchema,
  roadListQuery,
  verifyRoadSchema,
} from '../validators/road';

type Input<T> = z.infer<T>;

const DAMAGE_KEYWORDS: Record<string, string[]> = {
  POTHOLE: ['pothole', 'gaddha', 'gadda', 'hole', 'pot hole'],
  CRACKED_SURFACE: ['crack', 'cracked', 'darar', 'surface damage', 'broken road'],
  WATERLOGGING: ['waterlog', 'water logging', 'flood', 'pani', 'stagnant', 'drain'],
  BROKEN_DIVIDER: ['divider', 'median', 'barrier', 'railing'],
  BROKEN_STREETLIGHT: ['street light', 'streetlight', 'lamp', 'light pole', 'dark'],
  DAMAGED_BRIDGE: ['bridge', 'culvert', 'pul', 'flyover'],
  SUBSIDENCE: ['sinkhole', 'cave', 'subsid', 'dhasan', 'collapse'],
};

function analyzeDamage(text: string): { category: string; confidence: number; rationale: string } {
  const normalized = text.toLowerCase();
  let best = { category: 'GENERAL_ROAD_DAMAGE', hits: 0 };
  for (const [category, keywords] of Object.entries(DAMAGE_KEYWORDS)) {
    const hits = keywords.reduce((sum, keyword) => (normalized.includes(keyword) ? sum + 1 : sum), 0);
    if (hits > best.hits) best = { category, hits };
  }
  const confidence = best.hits === 0 ? 0.35 : Math.min(0.9, 0.45 + best.hits * 0.12);
  return {
    category: best.category,
    confidence,
    rationale:
      best.hits === 0
        ? 'No strong keyword match; category requires manual review.'
        : `Matched ${best.hits} keyword(s) related to ${best.category.replaceAll('_', ' ').toLowerCase()}.`,
  };
}

function scopeFilter(req: Request): Record<string, unknown> {
  const user = req.user!;
  if (user.role === 'CITIZEN') return { createdBy: user.id };
  if (user.role === 'DISTRICT_ADMIN' || user.role === 'SUPER_ADMIN') return {};
  return {
    $or: [
      { assignedDepartment: user.department },
      { createdBy: user.id },
      { 'inspection.officer': user.id },
    ],
  };
}

async function loadReport(req: Request, id: string) {
  const report = await RoadDamageReport.findOne({ _id: id, ...scopeFilter(req) } as never);
  if (!report) throw new AppError(404, 'Road damage report not found', 'NOT_FOUND');
  return report;
}

function buildLocation(location?: Input<typeof createRoadReportSchema>['location']) {
  if (!location) return undefined;
  return {
    address: location.address,
    tehsil: location.tehsil ? new Types.ObjectId(location.tehsil) : null,
    ...(location.coordinates
      ? { geo: { type: 'Point' as const, coordinates: location.coordinates } }
      : {}),
  };
}

async function notifyCreator(report: { createdBy: unknown }, title: string, body: string, link: string) {
  const userId = String(report.createdBy ?? '');
  if (!userId) return;
  await notifyUsers([userId], {
    type: 'SYSTEM',
    title,
    body,
    entityType: 'RoadDamageReport',
    entityId: undefined,
    link,
  });
}

export async function listRoadReports(req: Request) {
  const query = req.validatedQuery as Input<typeof roadListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (query.repairStatus) filter.repairStatus = query.repairStatus;
  if (query.department) filter.assignedDepartment = query.department;
  if (query.damageCategory) filter.damageCategory = query.damageCategory;
  if (query.mine === 'true') filter.createdBy = req.user!.id;
  if (query.q) {
    const pattern = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [...((filter.$or as unknown[]) ?? []), { roadName: pattern }, { description: pattern }, { reportId: pattern }];
  }

  const sort = buildSort(query.sort, ['createdAt', 'repairStatus', 'roadName'], '-createdAt');
  const [items, total] = await Promise.all([
    RoadDamageReport.find(filter as never)
      .populate('assignedDepartment', 'name code')
      .populate('inspection.officer', 'name designation')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    RoadDamageReport.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function getRoadReport(req: Request, id: string) {
  const report = await RoadDamageReport.findOne({ _id: id, ...scopeFilter(req) } as never)
    .populate('assignedDepartment', 'name code')
    .populate('inspection.officer', 'name designation email')
    .populate('createdBy', 'name email mobile')
    .lean();
  if (!report) throw new AppError(404, 'Road damage report not found', 'NOT_FOUND');
  return report;
}

export async function createRoadReport(
  input: Input<typeof createRoadReportSchema>,
  req: Request,
) {
  const suggestion = analyzeDamage(`${input.roadName} ${input.damageCategory} ${input.description}`);
  const department = req.user!.department ? new Types.ObjectId(req.user!.department) : null;

  const report = await RoadDamageReport.create({
    reportId: await nextSequence('ROAD'),
    roadName: input.roadName,
    location: buildLocation(input.location),
    documents: (input.documentIds ?? []).map((docId) => new Types.ObjectId(docId)),
    damageCategory: input.damageCategory,
    description: input.description,
    aiSuggestion: {
      category: suggestion.category,
      confidence: suggestion.confidence,
      rationale: suggestion.rationale,
      status: 'SUGGESTED',
    },
    inspection: { status: 'PENDING' },
    assignedDepartment: department,
    repairStatus: 'REPORTED',
    createdBy: new Types.ObjectId(req.user!.id),
  });

  await notifyRole('DISTRICT_ADMIN', {
    type: 'SYSTEM',
    title: `Road damage reported: ${report.reportId}`,
    body: `${input.roadName} — ${input.damageCategory}`,
    entityType: 'RoadDamageReport',
    entityId: String(report._id),
    link: `/roads/${report._id}`,
  });
  await addTimeline({
    entityType: 'ROAD_REPORT',
    entityId: String(report._id),
    action: 'ROAD_REPORT_CREATED',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: `Road damage reported on ${input.roadName}`,
  });
  await recordAudit(req, {
    action: 'ROAD_REPORT_CREATED',
    entityType: 'RoadDamageReport',
    entityId: String(report._id),
    entityLabel: report.reportId ?? undefined,
    after: { roadName: input.roadName, damageCategory: input.damageCategory, ai: suggestion },
  });
  return report.toObject();
}

export async function inspectRoadReport(
  id: string,
  input: Input<typeof inspectRoadSchema>,
  req: Request,
) {
  const report = await loadReport(req, id);
  if (report.repairStatus === 'COMPLETED') {
    throw new AppError(422, 'This report is already completed', 'INVALID_STATE');
  }

  const before = { status: report.repairStatus, inspection: report.inspection };
  report.inspection.officer = input.officer
    ? new Types.ObjectId(input.officer)
    : new Types.ObjectId(req.user!.id);
  report.inspection.status = input.status;
  report.inspection.findings = input.findings;
  report.inspection.verified = input.verified ?? false;
  report.inspection.inspectedAt = input.inspectedAt ?? (input.status === 'COMPLETED' ? new Date() : null);
  if (input.documentIds) {
    report.inspection.documents = input.documentIds.map((docId) => new Types.ObjectId(docId));
  }
  if (report.repairStatus === 'REPORTED' && input.status === 'COMPLETED') {
    report.repairStatus = 'INSPECTED';
  }
  await report.save();

  await notifyCreator(
    report,
    `Inspection completed: ${report.reportId}`,
    input.findings.slice(0, 300),
    `/roads/${id}`,
  );
  await addTimeline({
    entityType: 'ROAD_REPORT',
    entityId: id,
    action: 'ROAD_INSPECTED',
    fromStatus: before.status,
    toStatus: report.repairStatus,
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: input.findings.slice(0, 500),
  });
  await recordAudit(req, {
    action: 'ROAD_REPORT_INSPECTED',
    entityType: 'RoadDamageReport',
    entityId: id,
    entityLabel: report.reportId ?? undefined,
    before,
    after: { status: report.repairStatus, inspection: report.inspection },
  });
  return report.toObject();
}

export async function verifyRoadReport(
  id: string,
  input: Input<typeof verifyRoadSchema>,
  req: Request,
) {
  const report = await loadReport(req, id);
  if (report.repairStatus === 'COMPLETED') {
    throw new AppError(422, 'This report is already completed', 'INVALID_STATE');
  }
  const user = req.user!;
  if (
    input.assignedDepartment &&
    user.role !== 'DISTRICT_ADMIN' &&
    user.role !== 'SUPER_ADMIN' &&
    input.assignedDepartment !== user.department
  ) {
    throw new AppError(403, 'You can only assign reports to your own department', 'FORBIDDEN_SCOPE');
  }

  const before = {
    repairStatus: report.repairStatus,
    assignedDepartment: report.assignedDepartment,
    verified: report.inspection.verified,
  };
  report.inspection.verified = input.verified;
  if (input.findings) report.inspection.findings = input.findings;
  if (input.assignedDepartment) {
    report.assignedDepartment = new Types.ObjectId(input.assignedDepartment);
  }
  report.repairStatus = input.verified ? 'APPROVED' : 'REJECTED';
  await report.save();

  await notifyCreator(
    report,
    input.verified ? `Road repair approved: ${report.reportId}` : `Road report rejected: ${report.reportId}`,
    input.findings ?? (input.verified ? 'Your road damage report has been verified for repair.' : 'The report could not be verified.'),
    `/roads/${id}`,
  );
  await addTimeline({
    entityType: 'ROAD_REPORT',
    entityId: id,
    action: input.verified ? 'ROAD_VERIFIED' : 'ROAD_REJECTED',
    fromStatus: before.repairStatus,
    toStatus: report.repairStatus,
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: input.findings?.slice(0, 500),
  });
  await recordAudit(req, {
    action: input.verified ? 'ROAD_REPORT_VERIFIED' : 'ROAD_REPORT_REJECTED',
    entityType: 'RoadDamageReport',
    entityId: id,
    entityLabel: report.reportId ?? undefined,
    before,
    after: {
      repairStatus: report.repairStatus,
      assignedDepartment: report.assignedDepartment,
      verified: report.inspection.verified,
    },
  });
  return report.toObject();
}

export async function addRepairUpdate(
  id: string,
  input: Input<typeof repairUpdateSchema>,
  req: Request,
) {
  const report = await loadReport(req, id);
  if (report.repairStatus === 'COMPLETED') {
    throw new AppError(422, 'This report is already completed', 'INVALID_STATE');
  }
  if (input.status === 'COMPLETED') {
    throw new AppError(422, 'Use the close endpoint with closure evidence to complete the report', 'INVALID_OPERATION');
  }
  const before = report.repairStatus;
  report.repairUpdates.push({
    text: input.text,
    status: input.status,
    actor: new Types.ObjectId(req.user!.id),
    at: new Date(),
    evidence: (input.evidenceDocumentIds ?? []).map((docId) => new Types.ObjectId(docId)),
  });
  report.repairStatus = input.status;
  await report.save();

  await notifyCreator(
    report,
    `Road repair update: ${report.reportId}`,
    input.text.slice(0, 300),
    `/roads/${id}`,
  );
  await addTimeline({
    entityType: 'ROAD_REPORT',
    entityId: id,
    action: 'ROAD_REPAIR_UPDATED',
    fromStatus: before,
    toStatus: report.repairStatus,
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: input.text.slice(0, 500),
  });
  await recordAudit(req, {
    action: 'ROAD_REPAIR_UPDATED',
    entityType: 'RoadDamageReport',
    entityId: id,
    entityLabel: report.reportId ?? undefined,
    before: { repairStatus: before },
    after: { repairStatus: report.repairStatus, text: input.text },
  });
  return report.toObject();
}

export async function reviewRoadAiSuggestion(
  id: string,
  input: { decision: 'ACCEPTED' | 'REJECTED'; category?: string },
  req: Request,
) {
  const report = await loadReport(req, id);
  if (report.aiSuggestion.status !== 'SUGGESTED') {
    throw new AppError(409, 'The AI suggestion has already been reviewed', 'INVALID_STATE');
  }
  if (input.decision === 'ACCEPTED' && input.category) {
    report.damageCategory = input.category;
  }
  report.aiSuggestion.status = input.decision;
  report.aiSuggestion.reviewedBy = new Types.ObjectId(req.user!.id);
  report.aiSuggestion.reviewedAt = new Date();
  await report.save();

  await recordAudit(req, {
    action: 'ROAD_AI_SUGGESTION_REVIEWED',
    entityType: 'RoadDamageReport',
    entityId: id,
    entityLabel: report.reportId ?? undefined,
    after: { decision: input.decision, category: input.category },
  });
  return report.toObject();
}

export async function closeRoadReport(
  id: string,
  input: Input<typeof closeRoadSchema>,
  req: Request,
) {
  const report = await loadReport(req, id);
  if (report.repairStatus === 'COMPLETED') {
    throw new AppError(409, 'This report is already completed', 'INVALID_STATE');
  }
  const before = report.repairStatus;
  report.repairStatus = 'COMPLETED';
  report.closedAt = new Date();
  report.closureEvidence = (input.evidenceDocumentIds ?? []).map((docId) => new Types.ObjectId(docId));
  report.repairUpdates.push({
    text: input.summary,
    status: 'COMPLETED',
    actor: new Types.ObjectId(req.user!.id),
    at: new Date(),
    evidence: report.closureEvidence,
  });
  await report.save();

  await notifyCreator(
    report,
    `Road repair completed: ${report.reportId}`,
    input.summary.slice(0, 300),
    `/roads/${id}`,
  );
  await addTimeline({
    entityType: 'ROAD_REPORT',
    entityId: id,
    action: 'ROAD_REPORT_COMPLETED',
    fromStatus: before,
    toStatus: 'COMPLETED',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: input.summary.slice(0, 500),
  });
  await recordAudit(req, {
    action: 'ROAD_REPORT_COMPLETED',
    entityType: 'RoadDamageReport',
    entityId: id,
    entityLabel: report.reportId ?? undefined,
    before: { repairStatus: before },
    after: { repairStatus: report.repairStatus, summary: input.summary },
  });
  return report.toObject();
}
