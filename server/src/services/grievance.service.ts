import { Types } from 'mongoose';
import type { Request } from 'express';
import { GRIEVANCE_STATUSES, type GrievanceStatus, type Priority } from '../config/constants';
import {
  Grievance,
  GrievanceAction,
  GrievanceCategory,
  RoutingRule,
  TimelineEvent,
} from '../models/grievance';
import { Department, Office } from '../models/org';
import { User } from '../models/user';
import { AppError } from '../middleware/error';
import { assertGrievanceAccess, grievanceListFilter } from './access.service';
import { classifyGrievance } from './ai.service';
import { addTimeline } from './timeline.service';
import { recordAudit } from './audit.service';
import { notifyDepartment, notifyRole, notifyUsers } from './notification.service';
import { calculateDueDate, slaStatusFor } from './sla.service';
import { nextSequence } from '../utils/ids';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type {
  assignGrievanceSchema,
  classifyGrievanceSchema,
  closeGrievanceSchema,
  createGrievanceSchema,
  decisionSchema,
  escalateGrievanceSchema,
  grievanceActionSchema,
  grievanceListQuery,
  reopenRequestSchema,
  reopenReviewSchema,
  resolutionSchema,
  routeGrievanceSchema,
  verifyGrievanceSchema,
} from '../validators/grievance';
import type { z } from 'zod';

type Input<T> = z.infer<T>;

const TERMINAL_STATUSES: GrievanceStatus[] = ['RESOLVED', 'CLOSED', 'REJECTED'];
const SEARCH_FIELDS = ['subject', 'description', 'grievanceId'];

function refId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadGrievance(id: string) {
  const grievance = await Grievance.findById(id);
  if (!grievance) throw new AppError(404, 'Grievance not found', 'NOT_FOUND');
  return grievance;
}

function citizenVisible(input: Record<string, any>) {
  return {
    ...input,
    aiSuggestion: undefined,
    assignedBy: undefined,
    verifiedBy: undefined,
    routedBy: undefined,
    createdBy: undefined,
    assignedOfficer: input.assignedOfficer
      ? {
          _id: input.assignedOfficer._id,
          name: input.assignedOfficer.name,
          designation: input.assignedOfficer.designation,
        }
      : null,
    decision: input.decision ? { outcome: input.decision.outcome, reason: input.decision.reason, decidedAt: input.decision.decidedAt } : null,
    reopenRequest: input.reopenRequest
      ? { status: input.reopenRequest.status, requestedAt: input.reopenRequest.requestedAt, decisionNotes: input.reopenRequest.decisionNotes }
      : undefined,
  };
}

export async function createGrievance(
  input: Input<typeof createGrievanceSchema>,
  req: Request,
) {
  const user = req.user!;
  const isCitizen = user.role === 'CITIZEN';
  if (!isCitizen && !user.permissions.includes('grievance.create')) {
    throw new AppError(403, 'You cannot register grievances', 'FORBIDDEN_PERMISSION');
  }
  const source = isCitizen ? 'CITIZEN' : 'ASSISTED';

  let contact = input.contact;
  let citizenId: Types.ObjectId | null = null;
  if (isCitizen) {
    const citizen = await User.findById(user.id).select('name email mobile').lean();
    if (!citizen) throw new AppError(404, 'User not found', 'NOT_FOUND');
    contact = { name: citizen.name, mobile: citizen.mobile, email: citizen.email };
    citizenId = new Types.ObjectId(user.id);
  } else {
    if (!contact) {
      throw new AppError(422, 'Contact name and mobile are required for assisted registration', 'VALIDATION_ERROR');
    }
    const existingCitizen = await User.findOne({ mobile: contact.mobile, role: 'CITIZEN' })
      .select('_id')
      .lean();
    citizenId = existingCitizen ? new Types.ObjectId(String(existingCitizen._id)) : null;
  }

  const ai = await classifyGrievance(`${input.subject}\n${input.description}`);
  const selectedCategoryId = input.category ?? ai.category ?? null;
  const category = selectedCategoryId
    ? await GrievanceCategory.findById(selectedCategoryId).lean()
    : null;

  let departmentId = category?.defaultDepartment ? String(category.defaultDepartment) : null;
  let priority: Priority = input.priority ?? (category?.defaultPriority as Priority) ?? 'NORMAL';
  let officeId: string | null = null;

  if (category) {
    const routing = await RoutingRule.findOne({
      category: category._id,
      active: true,
    })
      .sort({ subcategory: 1 })
      .lean();
    if (!departmentId && routing?.department) departmentId = String(routing.department);
    if (!input.priority && routing?.priority) priority = routing.priority as Priority;
    if (routing?.office) officeId = String(routing.office);
  }

  if (!category && !departmentId) {
    departmentId = null;
  }

  const now = new Date();
  const { dueAt } = await calculateDueDate('GRIEVANCE', selectedCategoryId, priority, now);
  const grievanceId = await nextSequence('GRV');

  const aiStatus = input.category
    ? ai.category && String(ai.category) === String(input.category)
      ? 'ACCEPTED'
      : 'EDITED'
    : 'SUGGESTED';

  const grievance = await Grievance.create({
    grievanceId,
    citizen: citizenId,
    contact: { ...contact, email: contact.email || undefined },
    subject: input.subject,
    description: input.description,
    category: selectedCategoryId,
    subcategory: input.subcategory ?? null,
    location: input.location,
    tehsil: input.tehsil ?? null,
    department: departmentId,
    priority,
    status: 'SUBMITTED',
    source,
    aiSuggestion: {
      category: ai.category,
      department: ai.department ?? departmentId,
      confidence: ai.confidence,
      status: aiStatus,
      rationale: ai.rationale,
      reviewedBy: input.category ? user.id : null,
      reviewedAt: input.category ? now : null,
    },
    sla: {
      dueAt,
      status: slaStatusFor(dueAt),
      assignedAt: null,
    },
    submittedAt: now,
    createdBy: user.id,
  });

  await addTimeline(
    {
      entityType: 'GRIEVANCE',
      entityId: String(grievance._id),
      action: 'SUBMITTED',
      toStatus: 'SUBMITTED',
      actor: user.id,
      visibility: 'PUBLIC',
      message: `Grievance ${grievanceId} submitted`,
    },
  );
  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'AI_CLASSIFICATION',
    actor: user.id,
    visibility: 'INTERNAL',
    message: ai.rationale,
    metadata: { confidence: ai.confidence, suggestedCategory: ai.category, engine: ai.engine },
  });

  if (departmentId) {
    await notifyDepartment(
      departmentId,
      ['CLERK', 'DEPARTMENT_HEAD'],
      {
        type: 'GRIEVANCE_SUBMITTED',
        title: `New grievance ${grievanceId}`,
        body: input.subject,
        entityType: 'Grievance',
        entityId: String(grievance._id),
        link: `/clerk/grievances/${grievance._id}`,
        channels: ['IN_APP'],
      },
    );
  } else {
    await notifyRole('CLERK', {
      type: 'GRIEVANCE_SUBMITTED',
      title: `Unrouted grievance ${grievanceId}`,
      body: `${input.subject} — classification and routing required.`,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/clerk/verification/${grievance._id}`,
    });
  }

  if (citizenId) {
    await notifyUsers([String(citizenId)], {
      type: 'GRIEVANCE_STATUS_CHANGED',
      title: `Grievance ${grievanceId} received`,
      body: 'Your grievance has been registered and will be processed by the concerned department.',
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/citizen/grievances/${grievance._id}`,
    });
  }

  await recordAudit(req, {
    action: 'GRIEVANCE_CREATED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievanceId,
    after: { subject: input.subject, category: selectedCategoryId, department: departmentId },
  });

  return grievance.toObject();
}

export async function verifyGrievance(
  id: string,
  input: Input<typeof verifyGrievanceSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (TERMINAL_STATUSES.includes(grievance.status as GrievanceStatus)) {
    throw new AppError(409, 'Closed grievances cannot be verified again', 'INVALID_STATUS');
  }
  if (grievance.assignedOfficer && grievance.status !== 'SUBMITTED') {
    throw new AppError(409, 'This grievance is already in process', 'INVALID_STATUS');
  }

  const before = {
    status: grievance.status,
    category: grievance.category,
    department: grievance.department,
    priority: grievance.priority,
  };

  const categoryId = input.category ?? (grievance.category ? String(grievance.category) : null);
  const category = categoryId
    ? await GrievanceCategory.findById(categoryId).lean()
    : null;

  if (input.subject) grievance.subject = input.subject;
  if (input.description) grievance.description = input.description;
  if (input.location !== undefined) grievance.location = input.location;
  if (input.tehsil !== undefined) grievance.tehsil = input.tehsil ? new Types.ObjectId(input.tehsil) : null;
  if (input.contact) grievance.contact = { ...input.contact, email: input.contact.email || undefined } as never;

  grievance.category = category ? (category._id as Types.ObjectId) : grievance.category;
  if (input.subcategory) grievance.subcategory = new Types.ObjectId(input.subcategory);
  const departmentId =
    input.department ??
    (category?.defaultDepartment ? String(category.defaultDepartment) : null) ??
    (grievance.department ? String(grievance.department) : null);
  if (departmentId) grievance.department = new Types.ObjectId(departmentId);
  grievance.priority = (input.priority ?? category?.defaultPriority ?? grievance.priority) as never;

  if (grievance.aiSuggestion) {
    const suggested = refId(grievance.aiSuggestion.category);
    if (suggested) {
      grievance.aiSuggestion.status =
        String(grievance.category ?? '') === suggested ? 'ACCEPTED' : 'EDITED';
      grievance.aiSuggestion.reviewedBy = new Types.ObjectId(req.user!.id);
      grievance.aiSuggestion.reviewedAt = new Date();
    }
  }

  const now = new Date();
  const { dueAt } = await calculateDueDate(
    'GRIEVANCE',
    grievance.category ? String(grievance.category) : null,
    grievance.priority as Priority,
    now,
  );
  grievance.sla.dueAt = dueAt;
  grievance.sla.status = slaStatusFor(dueAt) as never;
  grievance.status = 'RECEIVED';
  grievance.verifiedBy = new Types.ObjectId(req.user!.id);
  grievance.verifiedAt = now;
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'VERIFIED',
    fromStatus: before.status,
    toStatus: 'RECEIVED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: input.notes || 'Grievance details verified and classified',
  });
  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'RECEIVED',
    toStatus: 'RECEIVED',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: 'Grievance details verified and received by the administration',
  });

  if (grievance.citizen) {
    await notifyUsers([String(grievance.citizen)], {
      type: 'GRIEVANCE_STATUS_CHANGED',
      title: `Grievance ${grievance.grievanceId} verified`,
      body: 'Your grievance has been verified and routed for further action.',
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/citizen/grievances/${grievance._id}`,
    });
  }

  await recordAudit(req, {
    action: 'GRIEVANCE_VERIFIED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    before,
    after: {
      status: grievance.status,
      category: String(grievance.category ?? ''),
      department: String(grievance.department ?? ''),
      priority: grievance.priority,
    },
  });

  return grievance.toObject();
}

export async function reviewClassification(
  id: string,
  input: Input<typeof classifyGrievanceSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  const category = await GrievanceCategory.findById(input.category).lean();
  if (!category) throw new AppError(404, 'Category not found', 'NOT_FOUND');

  const departmentId =
    input.department ??
    (category.defaultDepartment ? String(category.defaultDepartment) : null);

  grievance.category = category._id as Types.ObjectId;
  if (input.subcategory) grievance.subcategory = new Types.ObjectId(input.subcategory);
  if (departmentId) grievance.department = new Types.ObjectId(departmentId);
  if (input.priority) grievance.priority = input.priority;
  if (grievance.status === 'UNDER_VERIFICATION' || grievance.status === 'SUBMITTED') {
    grievance.status = 'RECEIVED';
  }
  grievance.aiSuggestion.category = category._id as Types.ObjectId;
  grievance.aiSuggestion.department = departmentId
    ? (new Types.ObjectId(departmentId) as never)
    : null;
  grievance.aiSuggestion.status = input.decision;
  grievance.aiSuggestion.reviewedBy = new Types.ObjectId(req.user!.id);
  grievance.aiSuggestion.reviewedAt = new Date();
  if (input.notes) grievance.aiSuggestion.rationale = input.notes;
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'CLASSIFICATION_REVIEWED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `Classification ${input.decision.toLowerCase()}${input.notes ? `: ${input.notes}` : ''}`,
  });
  await recordAudit(req, {
    action: 'GRIEVANCE_CLASSIFIED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    after: { category: String(category._id), decision: input.decision },
  });

  return grievance.toObject();
}

export async function routeGrievance(
  id: string,
  input: Input<typeof routeGrievanceSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (TERMINAL_STATUSES.includes(grievance.status as GrievanceStatus)) {
    throw new AppError(409, 'Closed grievances cannot be routed', 'INVALID_STATUS');
  }
  if (!grievance.category) {
    throw new AppError(422, 'Classify the grievance before routing it', 'CATEGORY_REQUIRED');
  }

  const department = await Department.findById(input.department).lean();
  if (!department || !department.active) throw new AppError(404, 'Department not found', 'NOT_FOUND');
  if (input.office) {
    const office = await Office.findOne({ _id: input.office, department: department._id }).lean();
    if (!office) throw new AppError(422, 'Selected office does not belong to the department', 'INVALID_OFFICE');
  }

  const fromDepartment = grievance.department ? String(grievance.department) : null;
  grievance.department = new Types.ObjectId(input.department);
  grievance.office = input.office ? new Types.ObjectId(input.office) : null;
  if (input.priority) grievance.priority = input.priority;
  grievance.routedBy = new Types.ObjectId(req.user!.id);
  grievance.routedAt = new Date();
  if (grievance.status === 'SUBMITTED') grievance.status = 'RECEIVED';

  const { dueAt } = await calculateDueDate(
    'GRIEVANCE',
    String(grievance.category),
    grievance.priority as Priority,
    new Date(),
  );
  grievance.sla.dueAt = dueAt;
  grievance.sla.status = slaStatusFor(dueAt) as never;
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'ROUTED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `Routed to ${department.name}${input.remarks ? ` — ${input.remarks}` : ''}`,
    metadata: { fromDepartment, toDepartment: String(department._id) },
  });
  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'ROUTED',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: 'Grievance forwarded to the concerned department',
  });

  await notifyDepartment(String(department._id), ['DEPARTMENT_HEAD', 'CLERK'], {
    type: 'GRIEVANCE_SUBMITTED',
    title: `Grievance ${grievance.grievanceId} routed to your department`,
    body: grievance.subject,
    entityType: 'Grievance',
    entityId: String(grievance._id),
    link: `/dept-head/grievances/${grievance._id}`,
  });

  await recordAudit(req, {
    action: 'GRIEVANCE_ROUTED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    before: { department: fromDepartment },
    after: { department: String(department._id), office: input.office ?? null },
  });

  return grievance.toObject();
}

export async function assignGrievance(
  id: string,
  input: Input<typeof assignGrievanceSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (TERMINAL_STATUSES.includes(grievance.status as GrievanceStatus)) {
    throw new AppError(409, 'Closed grievances cannot be assigned', 'INVALID_STATUS');
  }
  if (!grievance.department) {
    throw new AppError(422, 'Route the grievance to a department before assignment', 'DEPARTMENT_REQUIRED');
  }

  const officer = await User.findById(input.officerId).select('name role department status').lean();
  if (!officer || officer.role !== 'OFFICER') {
    throw new AppError(422, 'Select an active officer', 'INVALID_OFFICER');
  }
  if (officer.status !== 'ACTIVE') throw new AppError(422, 'Selected officer is not active', 'INVALID_OFFICER');
  if (String(officer.department ?? '') !== String(grievance.department)) {
    throw new AppError(422, 'Officer does not belong to the grievance department', 'INVALID_OFFICER');
  }

  const previousOfficer = grievance.assignedOfficer ? String(grievance.assignedOfficer) : null;
  const now = new Date();
  grievance.assignedOfficer = officer._id as Types.ObjectId;
  grievance.assignedBy = new Types.ObjectId(req.user!.id);
  grievance.assignedAt = now;
  grievance.status = 'ASSIGNED';
  if (input.priority) grievance.priority = input.priority;

  if (input.dueAt) {
    grievance.sla.dueAt = input.dueAt;
  } else {
    const { dueAt } = await calculateDueDate(
      'GRIEVANCE',
      grievance.category ? String(grievance.category) : null,
      grievance.priority as Priority,
      now,
    );
    grievance.sla.dueAt = dueAt;
  }
  grievance.sla.assignedAt = now;
  grievance.sla.status = slaStatusFor(grievance.sla.dueAt) as never;
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: previousOfficer ? 'REASSIGNED' : 'ASSIGNED',
    fromStatus: 'RECEIVED',
    toStatus: 'ASSIGNED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `Assigned to ${officer.name}${input.remarks ? ` — ${input.remarks}` : ''}`,
    metadata: { officer: String(officer._id), previousOfficer },
  });
  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'ASSIGNED',
    toStatus: 'ASSIGNED',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: 'Grievance assigned for investigation',
  });

  await notifyUsers([String(officer._id)], {
    type: 'GRIEVANCE_ASSIGNED',
    title: `Grievance ${grievance.grievanceId} assigned to you`,
    body: grievance.subject,
    entityType: 'Grievance',
    entityId: String(grievance._id),
    link: `/officer/grievances/${grievance._id}`,
    channels: ['IN_APP', 'EMAIL'],
  });
  if (grievance.citizen) {
    await notifyUsers([String(grievance.citizen)], {
      type: 'GRIEVANCE_STATUS_CHANGED',
      title: `Grievance ${grievance.grievanceId} assigned`,
      body: 'Your grievance has been assigned to an officer for investigation.',
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/citizen/grievances/${grievance._id}`,
    });
  }

  await recordAudit(req, {
    action: previousOfficer ? 'GRIEVANCE_REASSIGNED' : 'GRIEVANCE_ASSIGNED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    before: { assignedOfficer: previousOfficer },
    after: { assignedOfficer: String(officer._id), dueAt: grievance.sla.dueAt },
  });

  return grievance.toObject();
}

export async function acknowledgeGrievance(id: string, req: Request) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (String(grievance.assignedOfficer ?? '') !== req.user!.id) {
    throw new AppError(403, 'Only the assigned officer can accept this grievance', 'FORBIDDEN_SCOPE');
  }
  if (grievance.status !== 'ASSIGNED') {
    throw new AppError(409, 'This grievance is not awaiting acceptance', 'INVALID_STATUS');
  }

  const now = new Date();
  grievance.status = 'UNDER_INVESTIGATION';
  grievance.acknowledgedAt = now;
  grievance.sla.acknowledgedAt = now;
  grievance.sla.status = slaStatusFor(grievance.sla.dueAt, { dueSoonHours: 24 }) as never;
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'ACKNOWLEDGED',
    fromStatus: 'ASSIGNED',
    toStatus: 'UNDER_INVESTIGATION',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: 'Investigation has started',
  });
  await recordAudit(req, {
    action: 'GRIEVANCE_ACKNOWLEDGED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
  });

  return grievance.toObject();
}

export async function addGrievanceAction(
  id: string,
  input: Input<typeof grievanceActionSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (TERMINAL_STATUSES.includes(grievance.status as GrievanceStatus)) {
    throw new AppError(409, 'Closed grievances cannot be updated', 'INVALID_STATUS');
  }
  const isAssignedOfficer = String(grievance.assignedOfficer ?? '') === req.user!.id;
  const isSupervisor =
    req.user!.role === 'DEPARTMENT_HEAD' || req.user!.role === 'DISTRICT_ADMIN';
  if (!isAssignedOfficer && !isSupervisor) {
    throw new AppError(403, 'Only the assigned officer can record action on this grievance', 'FORBIDDEN_SCOPE');
  }

  const action = await GrievanceAction.create({
    grievance: grievance._id,
    type: input.type,
    text: input.text,
    documents: input.documentIds ?? [],
    actor: req.user!.id,
    visibility: input.visibility ?? (input.type === 'ATR' ? 'INTERNAL' : 'INTERNAL'),
  });

  if (input.type === 'ATR') {
    grievance.status = 'ACTION_TAKEN';
    await grievance.save();
    if (grievance.department) {
      await notifyDepartment(String(grievance.department), ['DEPARTMENT_HEAD'], {
        type: 'GRIEVANCE_STATUS_CHANGED',
        title: `Action report submitted for ${grievance.grievanceId}`,
        body: grievance.subject,
        entityType: 'Grievance',
        entityId: String(grievance._id),
        link: `/dept-head/grievances/${grievance._id}`,
      });
    }
  }

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: input.type,
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message:
      input.type === 'ATR'
        ? 'Action taken report submitted'
        : input.type === 'EVIDENCE'
          ? 'Inspection evidence uploaded'
          : 'Officer action updated',
  });
  await recordAudit(req, {
    action: `GRIEVANCE_${input.type}`,
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    after: { actionId: String(action._id) },
  });

  return action.toObject();
}

export async function submitResolution(
  id: string,
  input: Input<typeof resolutionSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (String(grievance.assignedOfficer ?? '') !== req.user!.id && req.user!.role !== 'DEPARTMENT_HEAD') {
    throw new AppError(403, 'Only the assigned officer can submit a resolution', 'FORBIDDEN_SCOPE');
  }
  if (!['ASSIGNED', 'UNDER_INVESTIGATION', 'ACTION_TAKEN'].includes(grievance.status)) {
    throw new AppError(409, 'A resolution cannot be submitted at this stage', 'INVALID_STATUS');
  }

  const now = new Date();
  grievance.resolution = {
    text: input.text,
    documents: (input.documentIds ?? []) as never,
    submittedBy: new Types.ObjectId(req.user!.id),
    submittedAt: now,
  };
  grievance.status = 'PENDING_APPROVAL';
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'RESOLUTION_SUBMITTED',
    fromStatus: 'UNDER_INVESTIGATION',
    toStatus: 'PENDING_APPROVAL',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: 'Resolution submitted for supervisory review',
  });
  if (grievance.department) {
    await notifyDepartment(String(grievance.department), ['DEPARTMENT_HEAD'], {
      type: 'GRIEVANCE_STATUS_CHANGED',
      title: `Resolution awaiting approval: ${grievance.grievanceId}`,
      body: grievance.subject,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/dept-head/grievances/${grievance._id}`,
    });
  }
  await recordAudit(req, {
    action: 'GRIEVANCE_RESOLUTION_SUBMITTED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    after: { resolutionSubmittedAt: now },
  });

  return grievance.toObject();
}

export async function decideGrievance(
  id: string,
  input: Input<typeof decisionSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (!['PENDING_APPROVAL', 'ACTION_TAKEN'].includes(grievance.status)) {
    throw new AppError(409, 'This grievance is not awaiting a decision', 'INVALID_STATUS');
  }
  if (input.outcome === 'RETURNED' && req.user!.role === 'DISTRICT_ADMIN' && !grievance.assignedOfficer) {
    throw new AppError(422, 'There is no assigned officer to return this grievance to', 'INVALID_STATUS');
  }

  const now = new Date();
  grievance.decision = {
    outcome: input.outcome,
    reason: input.reason,
    decidedBy: new Types.ObjectId(req.user!.id),
    decidedAt: now,
  } as never;

  if (input.outcome === 'RESOLVED') {
    grievance.status = 'RESOLVED';
    grievance.resolvedAt = now;
    grievance.sla.completedAt = now;
    grievance.sla.status = 'COMPLETED';
  } else if (input.outcome === 'REJECTED') {
    grievance.status = 'REJECTED';
    grievance.closedAt = now;
    grievance.sla.completedAt = now;
    grievance.sla.status = 'COMPLETED';
  } else if (input.outcome === 'CLOSED') {
    grievance.status = 'CLOSED';
    grievance.closedAt = now;
    grievance.sla.completedAt = now;
    grievance.sla.status = 'COMPLETED';
  } else {
    grievance.status = 'UNDER_INVESTIGATION';
    grievance.acknowledgedAt = null;
  }
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: `DECISION_${input.outcome}`,
    toStatus: grievance.status,
    actor: req.user!.id,
    visibility: input.outcome === 'RETURNED' ? 'INTERNAL' : 'PUBLIC',
    message:
      input.outcome === 'RESOLVED'
        ? 'Grievance resolved'
        : input.outcome === 'REJECTED'
          ? `Grievance rejected: ${input.reason}`
          : input.outcome === 'RETURNED'
            ? `Returned to officer: ${input.reason}`
            : 'Grievance closed',
  });

  if (grievance.citizen) {
    await notifyUsers([String(grievance.citizen)], {
      type: 'GRIEVANCE_STATUS_CHANGED',
      title: `Grievance ${grievance.grievanceId} ${input.outcome.toLowerCase()}`,
      body: input.reason,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/citizen/grievances/${grievance._id}`,
      channels: ['IN_APP', 'EMAIL'],
    });
  }
  if (input.outcome === 'RETURNED' && grievance.assignedOfficer) {
    await notifyUsers([String(grievance.assignedOfficer)], {
      type: 'GRIEVANCE_STATUS_CHANGED',
      title: `Grievance ${grievance.grievanceId} returned for rework`,
      body: input.reason,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/officer/grievances/${grievance._id}`,
    });
  }

  await recordAudit(req, {
    action: 'GRIEVANCE_DECISION',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    after: { outcome: input.outcome, reason: input.reason },
  });

  return grievance.toObject();
}

export async function closeGrievance(
  id: string,
  input: Input<typeof closeGrievanceSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (!['RESOLVED', 'REJECTED'].includes(grievance.status)) {
    throw new AppError(409, 'Only resolved or rejected grievances can be closed', 'INVALID_STATUS');
  }
  if (!req.user!.permissions.includes('grievance.close')) {
    throw new AppError(403, 'You cannot close grievances', 'FORBIDDEN_PERMISSION');
  }

  const now = new Date();
  grievance.status = 'CLOSED';
  grievance.closedAt = now;
  grievance.sla.completedAt = grievance.sla.completedAt ?? now;
  grievance.sla.status = 'COMPLETED';
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'CLOSED',
    toStatus: 'CLOSED',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: `Grievance closed: ${input.reason}`,
  });
  await recordAudit(req, {
    action: 'GRIEVANCE_CLOSED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    after: { reason: input.reason },
  });

  return grievance.toObject();
}

export async function requestReopen(
  id: string,
  input: Input<typeof reopenRequestSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (String(grievance.citizen ?? '') !== req.user!.id) {
    throw new AppError(403, 'Only the complainant can request reopening', 'FORBIDDEN_SCOPE');
  }
  if (!['RESOLVED', 'CLOSED', 'REJECTED'].includes(grievance.status)) {
    throw new AppError(409, 'This grievance is not eligible for reopening', 'INVALID_STATUS');
  }
  if (grievance.reopenRequest?.status === 'PENDING') {
    throw new AppError(409, 'A reopening request is already pending', 'DUPLICATE');
  }

  grievance.reopenRequest = {
    reason: input.reason,
    status: 'PENDING',
    requestedAt: new Date(),
    reviewedBy: null,
    reviewedAt: null,
    decisionNotes: undefined,
  } as never;
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'REOPEN_REQUESTED',
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: 'Complainant requested reopening of the grievance',
  });
  if (grievance.department) {
    await notifyDepartment(String(grievance.department), ['DEPARTMENT_HEAD'], {
      type: 'GRIEVANCE_STATUS_CHANGED',
      title: `Reopening requested: ${grievance.grievanceId}`,
      body: input.reason,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/dept-head/grievances/${grievance._id}`,
    });
  }
  await recordAudit(req, {
    action: 'GRIEVANCE_REOPEN_REQUESTED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    after: { reason: input.reason },
  });

  return grievance.toObject();
}

export async function reviewReopen(
  id: string,
  input: Input<typeof reopenReviewSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (grievance.reopenRequest?.status !== 'PENDING') {
    throw new AppError(409, 'There is no pending reopening request', 'INVALID_STATUS');
  }

  const now = new Date();
  grievance.reopenRequest.status = input.approve ? 'APPROVED' : 'REJECTED';
  grievance.reopenRequest.reviewedBy = new Types.ObjectId(req.user!.id);
  grievance.reopenRequest.reviewedAt = now;
  grievance.reopenRequest.decisionNotes = input.decisionNotes;

  if (input.approve) {
    grievance.status = 'REOPENED';
    grievance.resolvedAt = null;
    grievance.closedAt = null;
    grievance.decision = null;
    grievance.sla.completedAt = null;
    grievance.sla.assignedAt = null;
    grievance.sla.acknowledgedAt = null;
    grievance.reopenRequest.requestedAt = now;
    const { dueAt } = await calculateDueDate(
      'GRIEVANCE',
      grievance.category ? String(grievance.category) : null,
      grievance.priority as Priority,
      now,
    );
    grievance.sla.dueAt = dueAt;
    grievance.sla.status = slaStatusFor(dueAt) as never;
  }
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: input.approve ? 'REOPENED' : 'REOPEN_REJECTED',
    toStatus: grievance.status,
    actor: req.user!.id,
    visibility: 'PUBLIC',
    message: input.approve
      ? 'Grievance reopened for further action'
      : `Reopening request rejected${input.decisionNotes ? `: ${input.decisionNotes}` : ''}`,
  });

  if (grievance.citizen) {
    await notifyUsers([String(grievance.citizen)], {
      type: 'GRIEVANCE_STATUS_CHANGED',
      title: `Reopening request ${input.approve ? 'approved' : 'rejected'}`,
      body: input.decisionNotes || `Grievance ${grievance.grievanceId}`,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/citizen/grievances/${grievance._id}`,
    });
  }
  await recordAudit(req, {
    action: input.approve ? 'GRIEVANCE_REOPENED' : 'GRIEVANCE_REOPEN_REJECTED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    after: { decisionNotes: input.decisionNotes },
  });

  return grievance.toObject();
}

export async function escalateGrievance(
  id: string,
  input: Input<typeof escalateGrievanceSchema>,
  req: Request,
) {
  const grievance = await loadGrievance(id);
  assertGrievanceAccess(req, grievance);
  if (TERMINAL_STATUSES.includes(grievance.status as GrievanceStatus)) {
    throw new AppError(409, 'Closed grievances cannot be escalated', 'INVALID_STATUS');
  }

  const level = input.level ?? Math.min(3, (grievance.sla.escalationLevel ?? 0) + 1);
  grievance.sla.escalationLevel = level;
  grievance.sla.escalatedAt = new Date();
  await grievance.save();

  await addTimeline({
    entityType: 'GRIEVANCE',
    entityId: String(grievance._id),
    action: 'ESCALATED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `Escalated to level ${level}: ${input.reason}`,
    metadata: { level },
  });

  const recipients: string[] = [];
  if (grievance.assignedOfficer) recipients.push(String(grievance.assignedOfficer));
  if (grievance.department) {
    await notifyDepartment(String(grievance.department), ['DEPARTMENT_HEAD'], {
      type: 'ESCALATION_ALERT',
      title: `Grievance ${grievance.grievanceId} escalated`,
      body: input.reason,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/dept-head/grievances/${grievance._id}`,
      channels: ['IN_APP', 'EMAIL'],
    });
  }
  if (recipients.length > 0) {
    await notifyUsers(recipients, {
      type: 'ESCALATION_ALERT',
      title: `Grievance ${grievance.grievanceId} escalated`,
      body: input.reason,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/officer/grievances/${grievance._id}`,
    });
  }
  if (level >= 2) {
    await notifyRole('DISTRICT_ADMIN', {
      type: 'ESCALATION_ALERT',
      title: `Level ${level} escalation: ${grievance.grievanceId}`,
      body: `${grievance.subject} — ${input.reason}`,
      entityType: 'Grievance',
      entityId: String(grievance._id),
      link: `/district/grievances/${grievance._id}`,
    });
  }

  await recordAudit(req, {
    action: 'GRIEVANCE_ESCALATED',
    entityType: 'Grievance',
    entityId: String(grievance._id),
    entityLabel: grievance.grievanceId,
    after: { level, reason: input.reason },
  });

  return grievance.toObject();
}

export async function listGrievances(req: Request) {
  const query = req.validatedQuery as Input<typeof grievanceListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { ...grievanceListFilter(req) };

  if (query.status) {
    const statuses = query.status
      .split(',')
      .map((status) => status.trim().toUpperCase())
      .filter((status) => (GRIEVANCE_STATUSES as readonly string[]).includes(status));
    if (statuses.length > 0) filter.status = { $in: statuses };
  }
  if (query.priority) filter.priority = query.priority;
  if (query.category) filter.category = query.category;
  if (query.department) {
    if (req.user!.role === 'DISTRICT_ADMIN' || req.user!.role === 'SUPER_ADMIN') {
      filter.department = query.department;
    }
  }
  if (query.assignedOfficer) filter.assignedOfficer = query.assignedOfficer;
  if (query.mine && req.user!.role === 'OFFICER') filter.assignedOfficer = req.user!.id;
  if (query.overdue) {
    filter['sla.dueAt'] = { $lt: new Date() };
    filter.status = { $nin: TERMINAL_STATUSES };
  }
  if (query.escalated) {
    filter['sla.escalationLevel'] = { $gt: 0 };
    filter.status = { $nin: TERMINAL_STATUSES };
  }
  if (query.due) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    if (query.due === 'TODAY') {
      filter['sla.dueAt'] = { $gte: startOfToday, $lt: startOfTomorrow };
    } else {
      const soonEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      filter['sla.dueAt'] = { $gte: startOfTomorrow, $lte: soonEnd };
    }
    filter.status = { $nin: TERMINAL_STATUSES };
  }
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    const searchOr = SEARCH_FIELDS.map((field) => ({ [field]: regex }));
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else {
      filter.$or = searchOr;
    }
  }

  const sort = buildSort(query.sort, ['createdAt', 'updatedAt', 'priority', 'status', 'sla.dueAt'], '-createdAt');
  const [items, total] = await Promise.all([
    Grievance.find(filter as never)
      .populate('category', 'name code')
      .populate('department', 'name code')
      .populate('assignedOfficer', 'name designation')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Grievance.countDocuments(filter as never),
  ]);

  const shaped = req.user!.role === 'CITIZEN' ? items.map((item) => citizenVisible(item as never)) : items;
  return { items: shaped, meta: buildPageMeta(total, pagination) };
}

export async function getGrievanceDetail(id: string, req: Request) {
  const grievance = await Grievance.findById(id)
    .populate('citizen', 'name email mobile')
    .populate('category', 'name code')
    .populate('subcategory', 'name code')
    .populate('department', 'name code')
    .populate('office', 'name code')
    .populate('tehsil', 'name code')
    .populate('assignedOfficer', 'name designation email mobile')
    .populate('attachments')
    .populate('aiSuggestion.category', 'name code')
    .populate('aiSuggestion.department', 'name code')
    .lean();
  if (!grievance) throw new AppError(404, 'Grievance not found', 'NOT_FOUND');
  assertGrievanceAccess(req, grievance);
  return req.user!.role === 'CITIZEN' ? citizenVisible(grievance as never) : grievance;
}

export async function getGrievanceTimeline(id: string, req: Request) {
  const grievance = await Grievance.findById(id).select('citizen department').lean();
  if (!grievance) throw new AppError(404, 'Grievance not found', 'NOT_FOUND');
  assertGrievanceAccess(req, grievance);

  const filter: Record<string, unknown> = { entityType: 'GRIEVANCE', entityId: grievance._id };
  if (req.user!.role === 'CITIZEN') filter.visibility = 'PUBLIC';

  const events = await TimelineEvent.find(filter as never)
    .populate('actor', 'name role')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  if (req.user!.role === 'CITIZEN') {
    return events.map((event) => ({
      _id: event._id,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      message: event.message,
      createdAt: event.createdAt,
    }));
  }
  return events;
}

export async function getGrievanceActions(id: string, req: Request) {
  const grievance = await Grievance.findById(id).select('citizen department').lean();
  if (!grievance) throw new AppError(404, 'Grievance not found', 'NOT_FOUND');
  assertGrievanceAccess(req, grievance);

  const filter: Record<string, unknown> = { grievance: grievance._id };
  if (req.user!.role === 'CITIZEN') filter.visibility = 'PUBLIC';
  else if (!req.user!.permissions.includes('grievance.read.dept')) filter.visibility = 'PUBLIC';

  return GrievanceAction.find(filter as never)
    .populate('actor', 'name role designation')
    .populate('documents')
    .sort({ createdAt: -1 })
    .lean();
}

export async function getReopenQueue(req: Request) {
  const filter: Record<string, unknown> = {
    'reopenRequest.status': 'PENDING',
    ...grievanceListFilter(req),
  };
  return Grievance.find(filter as never)
    .populate('citizen', 'name mobile')
    .populate('category', 'name')
    .populate('department', 'name')
    .sort({ 'reopenRequest.requestedAt': 1 })
    .lean();
}
