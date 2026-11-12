import { Types } from 'mongoose';
import type { Request } from 'express';
import { APPLICATION_STATUSES, type Priority } from '../config/constants';
import { Application, ApplicationType } from '../models/application';
import { User } from '../models/user';
import { AppError } from '../middleware/error';
import { applicationListFilter, assertApplicationAccess } from './access.service';
import { addTimeline } from './timeline.service';
import { recordAudit } from './audit.service';
import { notifyDepartment, notifyUsers } from './notification.service';
import { calculateDueDate, slaStatusFor } from './sla.service';
import { nextSequence } from '../utils/ids';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type { z } from 'zod';
import type {
  applicationDecisionSchema,
  applicationListQuery,
  createApplicationSchema,
  reviewApplicationSchema,
  verifyApplicationSchema,
} from '../validators/application';

type Input<T> = z.infer<T>;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadApplication(id: string) {
  const application = await Application.findById(id);
  if (!application) throw new AppError(404, 'Application not found', 'NOT_FOUND');
  return application;
}

function fieldsFromSchema(schema: unknown): Array<{ key: string; label: string; required: boolean }> {
  if (!schema || typeof schema !== 'object') return [];
  const fields = (schema as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((field): field is Record<string, unknown> => Boolean(field) && typeof field === 'object')
    .map((field) => ({
      key: String(field.key ?? ''),
      label: String(field.label ?? field.key ?? ''),
      required: Boolean(field.required),
    }))
    .filter((field) => field.key);
}

function missingFormFields(
  schema: unknown,
  formData: Record<string, unknown>,
): Array<{ key: string; label: string }> {
  return fieldsFromSchema(schema).filter((field) => {
    if (!field.required) return false;
    const value = formData[field.key];
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  }).map((field) => ({ key: field.key, label: field.label }));
}

export async function listApplicationTypes(req: Request) {
  const canConfigure = req.user!.permissions.includes('application.config');
  const filter: Record<string, unknown> = canConfigure ? {} : { active: true };
  if (req.user!.role === 'CITIZEN' || req.user!.role === 'CLERK') {
    if (!canConfigure) filter.active = true;
  }
  return ApplicationType.find(filter as never)
    .populate('department', 'name code')
    .sort({ name: 1 })
    .lean();
}

export async function createApplication(input: Input<typeof createApplicationSchema>, req: Request) {
  const type = await ApplicationType.findOne({ _id: input.type, active: true }).lean();
  if (!type) throw new AppError(404, 'Application type is not available', 'NOT_FOUND');

  if (!req.user!.permissions.includes('application.create')) {
    throw new AppError(403, 'You cannot submit applications', 'FORBIDDEN_PERMISSION');
  }

  const priority = (input.priority ?? 'NORMAL') as Priority;
  const { dueAt } = await calculateDueDate('APPLICATION', null, priority, new Date());
  const applicationId = await nextSequence('APP');

  const previous = await Application.findOne({
    citizen: req.user!.id,
    type: type._id,
    status: { $nin: ['CLOSED', 'REJECTED'] },
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();

  const checklist = (type.requiredDocuments ?? []).map((document) => ({
    key: document.key,
    label: document.label,
    required: document.required,
    provided: false,
    document: null,
    verified: false,
  }));

  const application = await Application.create({
    applicationId,
    type: type._id,
    citizen: req.user!.id,
    formData: input.formData,
    department: type.department,
    status: 'SUBMITTED',
    checklist,
    missingDocuments: checklist.filter((item) => item.required).map((item) => item.label),
    duplicateOf: previous?._id ?? null,
    duplicateWarning: Boolean(previous),
    priority,
    sla: { dueAt, status: slaStatusFor(dueAt) },
    submittedAt: new Date(),
  });

  await addTimeline({
    entityType: 'APPLICATION',
    entityId: String(application._id),
    action: 'SUBMITTED',
    toStatus: 'SUBMITTED',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: `Application ${applicationId} submitted`,
  });
  if (previous) {
    await addTimeline({
      entityType: 'APPLICATION',
      entityId: String(application._id),
      action: 'DUPLICATE_FLAGGED',
      actor: req.user!.id,
      visibility: 'INTERNAL',
      message: 'A recent application of the same type was detected for this citizen.',
      metadata: { duplicateOf: String(previous._id) },
    });
  }

  await notifyDepartment(String(type.department), ['CLERK'], {
    type: 'APPLICATION_STATUS_CHANGED',
    title: `New application ${applicationId}`,
    body: `${type.name} — document verification required.`,
    entityType: 'Application',
    entityId: String(application._id),
    link: `/clerk/applications/${application._id}`,
  });
  await notifyUsers([req.user!.id], {
    type: 'APPLICATION_STATUS_CHANGED',
    title: `Application ${applicationId} submitted`,
    body: 'Your application has been submitted for verification.',
    entityType: 'Application',
    entityId: String(application._id),
    link: `/citizen/applications/${application._id}`,
  });

  await recordAudit(req, {
    action: 'APPLICATION_SUBMITTED',
    entityType: 'Application',
    entityId: String(application._id),
    entityLabel: applicationId,
    after: { type: String(type._id), duplicateWarning: Boolean(previous) },
  });

  return application.toObject();
}

export async function listApplications(req: Request) {
  const query = req.validatedQuery as Input<typeof applicationListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { ...applicationListFilter(req) };

  if (query.status) {
    const statuses = query.status
      .split(',')
      .map((status) => status.trim().toUpperCase())
      .filter((status) => (APPLICATION_STATUSES as readonly string[]).includes(status));
    if (statuses.length) filter.status = { $in: statuses };
  }
  if (query.type) filter.type = query.type;
  if (query.department && req.user!.role === 'DISTRICT_ADMIN') filter.department = query.department;
  if (query.mine) {
    if (req.user!.role === 'CITIZEN') filter.citizen = req.user!.id;
    else if (req.user!.role === 'OFFICER') filter.assignedOfficer = req.user!.id;
  }
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.q) {
    filter.$or = [
      { applicationId: new RegExp(escapeRegex(query.q), 'i') },
      { 'formData.name': new RegExp(escapeRegex(query.q), 'i') },
    ];
  }

  const sort = buildSort(query.sort, ['createdAt', 'updatedAt', 'status', 'sla.dueAt'], '-createdAt');
  const [items, total] = await Promise.all([
    Application.find(filter as never)
      .populate('type', 'name code requiredDocuments')
      .populate('department', 'name code')
      .populate('citizen', 'name mobile email')
      .populate('assignedOfficer', 'name designation')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Application.countDocuments(filter as never),
  ]);

  return { items, meta: buildPageMeta(total, pagination) };
}

export async function getApplicationDetail(id: string, req: Request) {
  const application = await Application.findById(id)
    .populate('type', 'name code description requiredDocuments formFieldSchema')
    .populate('department', 'name code')
    .populate('citizen', 'name mobile email')
    .populate('assignedClerk', 'name designation')
    .populate('assignedOfficer', 'name designation email mobile')
    .populate('documents')
    .populate('checklist.document')
    .populate('decision.decidedBy', 'name designation')
    .lean();
  if (!application) throw new AppError(404, 'Application not found', 'NOT_FOUND');
  assertApplicationAccess(req, application);
  return application;
}

export async function verifyApplication(
  id: string,
  input: Input<typeof verifyApplicationSchema>,
  req: Request,
) {
  const application = await loadApplication(id);
  assertApplicationAccess(req, application);
  if (!['SUBMITTED', 'UNDER_VERIFICATION', 'DOCUMENT_PENDING'].includes(application.status)) {
    throw new AppError(409, 'This application is not awaiting document verification', 'INVALID_STATUS');
  }
  const type = await ApplicationType.findById(application.type).lean();
  if (!type) throw new AppError(404, 'Application type not found', 'NOT_FOUND');

  const checklist = (application.checklist ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    required: item.required,
    provided: item.provided,
    document: item.document ?? null,
    verified: item.verified,
    remarks: item.remarks,
  }));
  const index = new Map(checklist.map((item) => [item.key, item]));
  for (const required of type.requiredDocuments ?? []) {
    if (!index.has(required.key)) {
      const item = {
        key: required.key,
        label: required.label,
        required: required.required,
        provided: false,
        document: null,
        verified: false,
        remarks: undefined,
      };
      checklist.push(item);
      index.set(required.key, item);
    }
  }
  for (const incoming of input.checklist ?? []) {
    const target = index.get(incoming.key);
    if (!target) continue;
    target.provided = incoming.provided || Boolean(incoming.document);
    if (incoming.document) target.document = new Types.ObjectId(incoming.document);
    target.verified = incoming.verified;
    target.remarks = incoming.remarks;
  }

  const missing = checklist
    .filter((item) => item.required && !item.provided)
    .map((item) => item.label);

  let officerId: Types.ObjectId | null = application.assignedOfficer
    ? new Types.ObjectId(String(application.assignedOfficer))
    : null;
  if (input.assignOfficer) {
    const officer = await User.findOne({
      _id: input.assignOfficer,
      role: 'OFFICER',
      status: 'ACTIVE',
      department: application.department,
    })
      .select('_id')
      .lean();
    if (!officer) throw new AppError(422, 'Select an active officer from this department', 'INVALID_OFFICER');
    officerId = officer._id as Types.ObjectId;
  }

  application.checklist = checklist as never;
  application.missingDocuments = missing;
  application.assignedClerk = new Types.ObjectId(req.user!.id);
  if (officerId) application.assignedOfficer = officerId;
  application.status = missing.length > 0 ? 'DOCUMENT_PENDING' : 'UNDER_REVIEW';
  await application.save();

  await addTimeline({
    entityType: 'APPLICATION',
    entityId: String(application._id),
    action: missing.length > 0 ? 'DOCUMENTS_PENDING' : 'VERIFIED',
    toStatus: application.status,
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message:
      missing.length > 0
        ? `Verification completed. Missing documents: ${missing.join(', ')}`
        : 'Documents verified. Application moved for departmental review.',
  });

  await notifyUsers([String(application.citizen)], {
    type: missing.length > 0 ? 'APPLICATION_DOCUMENT_MISSING' : 'APPLICATION_STATUS_CHANGED',
    title:
      missing.length > 0
        ? `Documents required for ${application.applicationId}`
        : `Application ${application.applicationId} verified`,
    body:
      missing.length > 0
        ? `Please upload: ${missing.join(', ')}`
        : 'Your documents have been verified and the application is under review.',
    entityType: 'Application',
    entityId: String(application._id),
    link: `/citizen/applications/${application._id}`,
    channels: ['IN_APP', 'EMAIL'],
  });

  if (officerId) {
    await notifyUsers([String(officerId)], {
      type: 'APPLICATION_STATUS_CHANGED',
      title: `Application ${application.applicationId} assigned for review`,
      body: type.name,
      entityType: 'Application',
      entityId: String(application._id),
      link: `/officer/applications/${application._id}`,
    });
  }

  await recordAudit(req, {
    action: 'APPLICATION_VERIFIED',
    entityType: 'Application',
    entityId: String(application._id),
    entityLabel: application.applicationId,
    after: { status: application.status, missingDocuments: missing, officer: officerId ? String(officerId) : null },
  });

  return application.toObject();
}

export async function assignApplication(
  id: string,
  input: { officerId: string; priority?: Priority; dueAt?: Date; remarks?: string },
  req: Request,
) {
  const application = await loadApplication(id);
  assertApplicationAccess(req, application);
  const officer = await User.findOne({
    _id: input.officerId,
    role: 'OFFICER',
    status: 'ACTIVE',
    department: application.department,
  })
    .select('name')
    .lean();
  if (!officer) throw new AppError(422, 'Select an active officer from this department', 'INVALID_OFFICER');

  application.assignedOfficer = officer._id as Types.ObjectId;
  if (input.priority) {
    application.priority = input.priority;
    const { dueAt } = await calculateDueDate('APPLICATION', null, input.priority, new Date());
    application.sla.dueAt = input.dueAt ?? dueAt;
    application.sla.assignedAt = new Date();
    application.sla.status = slaStatusFor(application.sla.dueAt) as never;
  }
  if (application.status === 'SUBMITTED') application.status = 'UNDER_REVIEW';
  await application.save();

  await addTimeline({
    entityType: 'APPLICATION',
    entityId: String(application._id),
    action: 'ASSIGNED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `Assigned to ${officer.name}${input.remarks ? ` — ${input.remarks}` : ''}`,
  });
  await notifyUsers([String(officer._id)], {
    type: 'APPLICATION_STATUS_CHANGED',
    title: `Application ${application.applicationId} assigned`,
    body: input.remarks || String(application.applicationId ?? ''),
    entityType: 'Application',
    entityId: String(application._id),
    link: `/officer/applications/${application._id}`,
    channels: ['IN_APP', 'EMAIL'],
  });
  await recordAudit(req, {
    action: 'APPLICATION_ASSIGNED',
    entityType: 'Application',
    entityId: String(application._id),
    entityLabel: application.applicationId,
    after: { officer: String(officer._id), remarks: input.remarks },
  });

  return application.toObject();
}

export async function reviewApplication(
  id: string,
  input: Input<typeof reviewApplicationSchema>,
  req: Request,
) {
  const application = await loadApplication(id);
  assertApplicationAccess(req, application);
  if (!['UNDER_REVIEW', 'DOCUMENT_PENDING'].includes(application.status)) {
    throw new AppError(409, 'This application is not under review', 'INVALID_STATUS');
  }
  if (application.missingDocuments.length > 0) {
    throw new AppError(409, 'Resolve missing documents before recommending a decision', 'DOCUMENTS_PENDING');
  }
  if (application.assignedOfficer && String(application.assignedOfficer) !== req.user!.id && req.user!.role === 'OFFICER') {
    throw new AppError(403, 'This application is assigned to another officer', 'FORBIDDEN_SCOPE');
  }

  application.reviewNotes = input.reviewNotes;
  application.reviewedBy = new Types.ObjectId(req.user!.id);
  application.reviewedAt = new Date();
  application.status = 'PENDING_DECISION';
  await application.save();

  await addTimeline({
    entityType: 'APPLICATION',
    entityId: String(application._id),
    action: 'REVIEW_COMPLETED',
    toStatus: 'PENDING_DECISION',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: input.reviewNotes,
  });
  if (application.department) {
    await notifyDepartment(String(application.department), ['DEPARTMENT_HEAD'], {
      type: 'APPLICATION_STATUS_CHANGED',
      title: `Application ${application.applicationId} awaiting decision`,
      body: input.reviewNotes,
      entityType: 'Application',
      entityId: String(application._id),
      link: `/dept-head/applications/${application._id}`,
    });
  }
  await recordAudit(req, {
    action: 'APPLICATION_REVIEWED',
    entityType: 'Application',
    entityId: String(application._id),
    entityLabel: application.applicationId,
  });

  return application.toObject();
}

export async function decideApplication(
  id: string,
  input: Input<typeof applicationDecisionSchema>,
  req: Request,
) {
  const application = await loadApplication(id);
  assertApplicationAccess(req, application);
  if (!['PENDING_DECISION', 'UNDER_REVIEW'].includes(application.status)) {
    throw new AppError(409, 'This application is not awaiting a decision', 'INVALID_STATUS');
  }

  const now = new Date();
  application.decision = {
    outcome: input.outcome,
    reason: input.reason,
    decidedBy: new Types.ObjectId(req.user!.id),
    decidedAt: now,
  } as never;
  application.status = input.outcome;
  application.sla.completedAt = now;
  application.sla.status = 'COMPLETED';
  await application.save();

  await addTimeline({
    entityType: 'APPLICATION',
    entityId: String(application._id),
    action: `DECISION_${input.outcome}`,
    toStatus: application.status,
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: `Application ${input.outcome.toLowerCase()}: ${input.reason}`,
  });
  await notifyUsers([String(application.citizen)], {
    type: 'APPLICATION_STATUS_CHANGED',
    title: `Application ${application.applicationId} ${input.outcome.toLowerCase()}`,
    body: input.reason,
    entityType: 'Application',
    entityId: String(application._id),
    link: `/citizen/applications/${application._id}`,
    channels: ['IN_APP', 'EMAIL'],
  });
  await recordAudit(req, {
    action: 'APPLICATION_DECISION',
    entityType: 'Application',
    entityId: String(application._id),
    entityLabel: application.applicationId,
    after: { outcome: input.outcome, reason: input.reason },
  });

  return application.toObject();
}

export async function completenessReview(id: string, req: Request) {
  const application = await Application.findById(id)
    .populate('type', 'name requiredDocuments formFieldSchema')
    .lean();
  if (!application) throw new AppError(404, 'Application not found', 'NOT_FOUND');
  assertApplicationAccess(req, application);

  const type = application.type as unknown as {
    formFieldSchema?: unknown;
    requiredDocuments?: Array<{ key: string; label: string; required: boolean }>;
  };
  const formMissing = missingFormFields(
    type.formFieldSchema,
    (application.formData ?? {}) as Record<string, unknown>,
  );
  const checklistMissing = (application.checklist ?? [])
    .filter((item) => item.required && !item.provided)
    .map((item) => ({ key: item.key, label: item.label }));
  const totalRequired =
    fieldsFromSchema(type.formFieldSchema).filter((field) => field.required).length +
    (type.requiredDocuments ?? []).filter((document) => document.required).length;
  const missingCount = formMissing.length + checklistMissing.length;
  const completeness = totalRequired === 0 ? 100 : Math.max(0, Math.round(((totalRequired - missingCount) / totalRequired) * 100));

  return {
    completeness,
    missingFields: formMissing,
    missingDocuments: checklistMissing,
    totalRequired,
  };
}
