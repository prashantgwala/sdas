import { Types } from 'mongoose';
import type { Request } from 'express';
import { calculateDueDate } from './sla.service';
import { nextSequence } from '../utils/ids';
import { HelpdeskTicket } from '../models/platform';
import { User } from '../models/user';
import { AppError } from '../middleware/error';
import { recordAudit } from './audit.service';
import { notifyRole, notifyUsers } from './notification.service';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type { Priority } from '../config/constants';
import type {
  createTicketSchema,
  ticketListQuery,
} from '../validators/helpdesk';
import type { z } from 'zod';

type Input<T> = z.infer<T>;

function isCitizen(req: Request): boolean {
  return req.user!.role === 'CITIZEN';
}

function isDistrict(req: Request): boolean {
  return req.user!.role === 'DISTRICT_ADMIN' || req.user!.role === 'SUPER_ADMIN';
}

function scopeFilter(req: Request): Record<string, unknown> {
  const user = req.user!;
  if (isCitizen(req)) return { citizen: user.id };
  if (isDistrict(req)) return {};
  return { department: user.department };
}

async function loadAccessibleTicket(req: Request, id: string) {
  const ticket = await HelpdeskTicket.findOne({ _id: id, ...scopeFilter(req) } as never);
  if (!ticket) throw new AppError(404, 'Ticket not found', 'NOT_FOUND');
  return ticket;
}

export async function createTicket(
  input: Input<typeof createTicketSchema>,
  req: Request,
) {
  const user = req.user!;
  const priority = (input.priority ?? 'NORMAL') as Priority;
  const { dueAt } = await calculateDueDate('TASK', null, priority);
  const ticket = await HelpdeskTicket.create({
    ticketId: await nextSequence('TKT'),
    citizen: new Types.ObjectId(user.id),
    subject: input.subject,
    category: input.category,
    description: input.description,
    priority,
    status: 'OPEN',
    messages: [
      {
        author: new Types.ObjectId(user.id),
        authorName: user.name,
        content: input.description,
        internal: false,
        at: new Date(),
      },
    ],
    sla: { dueAt, status: 'WITHIN_TIME', escalationLevel: 0 },
  });

  await notifyRole('DISTRICT_ADMIN', {
    type: 'SYSTEM',
    title: `New helpdesk ticket ${ticket.ticketId}`,
    body: input.subject,
    entityType: 'HelpdeskTicket',
    entityId: String(ticket._id),
    link: `/helpdesk/${ticket._id}`,
  });
  await recordAudit(req, {
    action: 'HELPDESK_TICKET_CREATED',
    entityType: 'HelpdeskTicket',
    entityId: String(ticket._id),
    entityLabel: ticket.ticketId ?? undefined,
    after: { subject: input.subject, category: input.category, priority },
  });
  return ticket.toObject();
}

export async function listMyTickets(req: Request) {
  const query = req.validatedQuery as Input<typeof ticketListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { citizen: req.user!.id };
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;

  const [items, total] = await Promise.all([
    HelpdeskTicket.find(filter as never)
      .select('-messages')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    HelpdeskTicket.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function listTickets(req: Request) {
  const query = req.validatedQuery as Input<typeof ticketListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.department) filter.department = query.department;
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.q) {
    const pattern = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ subject: pattern }, { description: pattern }, { ticketId: pattern }];
  }

  const sort = buildSort(query.sort, ['createdAt', 'priority', 'status'], '-createdAt');
  const [items, total] = await Promise.all([
    HelpdeskTicket.find(filter as never)
      .select('-messages')
      .populate('citizen', 'name email mobile')
      .populate('assignedTo', 'name designation')
      .populate('department', 'name code')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    HelpdeskTicket.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function getTicket(req: Request, id: string) {
  const ticket = await HelpdeskTicket.findOne({ _id: id, ...scopeFilter(req) } as never)
    .populate('citizen', 'name email mobile')
    .populate('assignedTo', 'name designation email')
    .populate('department', 'name code')
    .lean();
  if (!ticket) throw new AppError(404, 'Ticket not found', 'NOT_FOUND');
  if (isCitizen(req)) {
    return {
      ...ticket,
      messages: ticket.messages.filter((message) => !message.internal),
    };
  }
  return ticket;
}

export async function replyToTicket(
  req: Request,
  id: string,
  input: { content: string; internal?: boolean },
) {
  const ticket = await loadAccessibleTicket(req, id);
  if (ticket.status === 'CLOSED') {
    throw new AppError(422, 'Closed tickets cannot receive new messages', 'INVALID_STATE');
  }
  const user = req.user!;
  const internal = isCitizen(req) ? false : Boolean(input.internal);

  ticket.messages.push({
    author: new Types.ObjectId(user.id),
    authorName: user.name,
    content: input.content,
    internal,
    at: new Date(),
  });

  if (!isCitizen(req)) {
    if (!ticket.assignedTo) ticket.assignedTo = new Types.ObjectId(user.id);
    if (ticket.status === 'OPEN') ticket.status = 'IN_PROGRESS';
    if (!ticket.department && user.department) {
      ticket.department = new Types.ObjectId(user.department);
    }
  } else if (ticket.status === 'RESOLVED') {
    ticket.status = 'IN_PROGRESS';
    ticket.resolvedAt = null;
  }
  await ticket.save();

  if (internal) {
    if (ticket.assignedTo) {
      await notifyUsers([String(ticket.assignedTo)], {
        type: 'SYSTEM',
        title: `Internal note on ${ticket.ticketId}`,
        body: input.content.slice(0, 300),
        entityType: 'HelpdeskTicket',
        entityId: String(ticket._id),
        link: `/helpdesk/${ticket._id}`,
      });
    }
  } else if (isCitizen(req)) {
    if (ticket.assignedTo) {
      await notifyUsers([String(ticket.assignedTo)], {
        type: 'SYSTEM',
        title: `Citizen replied on ${ticket.ticketId}`,
        body: input.content.slice(0, 300),
        entityType: 'HelpdeskTicket',
        entityId: String(ticket._id),
        link: `/helpdesk/${ticket._id}`,
      });
    } else {
      await notifyRole('DISTRICT_ADMIN', {
        type: 'SYSTEM',
        title: `Citizen replied on unassigned ticket ${ticket.ticketId}`,
        body: input.content.slice(0, 300),
        entityType: 'HelpdeskTicket',
        entityId: String(ticket._id),
        link: `/helpdesk/${ticket._id}`,
      });
    }
  } else {
    await notifyUsers([String(ticket.citizen)], {
      type: 'SYSTEM',
      title: `Support replied to your ticket ${ticket.ticketId}`,
      body: input.content.slice(0, 300),
      entityType: 'HelpdeskTicket',
      entityId: String(ticket._id),
      link: `/citizen/helpdesk/${ticket._id}`,
    });
  }

  await recordAudit(req, {
    action: 'HELPDESK_TICKET_REPLIED',
    entityType: 'HelpdeskTicket',
    entityId: id,
    entityLabel: ticket.ticketId ?? undefined,
    after: { internal, status: ticket.status },
  });
  return ticket.toObject();
}

export async function assignTicket(
  req: Request,
  id: string,
  input: { assignedTo: string; department?: string },
) {
  const ticket = await HelpdeskTicket.findById(id);
  if (!ticket) throw new AppError(404, 'Ticket not found', 'NOT_FOUND');
  const user = req.user!;
  if (
    user.role === 'DEPARTMENT_HEAD' &&
    String(ticket.department ?? '') !== String(user.department ?? '')
  ) {
    throw new AppError(403, 'You can only assign tickets within your department', 'FORBIDDEN_SCOPE');
  }

  const assignee = await User.findOne({ _id: input.assignedTo, status: 'ACTIVE' })
    .select('name department')
    .lean();
  if (!assignee) throw new AppError(422, 'Select an active staff member', 'INVALID_ASSIGNEE');
  if (user.role === 'DEPARTMENT_HEAD' && String(assignee.department ?? '') !== String(user.department ?? '')) {
    throw new AppError(403, 'You can only assign tickets to officers in your department', 'FORBIDDEN_SCOPE');
  }

  const before = { assignedTo: ticket.assignedTo, department: ticket.department, status: ticket.status };
  ticket.assignedTo = new Types.ObjectId(input.assignedTo);
  ticket.department = input.department
    ? new Types.ObjectId(input.department)
    : (assignee.department as Types.ObjectId | null | undefined) ?? ticket.department;
  ticket.status = 'IN_PROGRESS';
  await ticket.save();

  await notifyUsers([input.assignedTo], {
    type: 'SYSTEM',
    title: `Ticket assigned: ${ticket.ticketId}`,
    body: ticket.subject,
    entityType: 'HelpdeskTicket',
    entityId: String(ticket._id),
    link: `/helpdesk/${ticket._id}`,
    channels: ['IN_APP', 'EMAIL'],
  });
  await recordAudit(req, {
    action: 'HELPDESK_TICKET_ASSIGNED',
    entityType: 'HelpdeskTicket',
    entityId: id,
    entityLabel: ticket.ticketId ?? undefined,
    before,
    after: { assignedTo: ticket.assignedTo, department: ticket.department, status: ticket.status },
  });
  return ticket.toObject();
}

export async function updateTicketStatus(
  req: Request,
  id: string,
  input: { status: 'RESOLVED' | 'CLOSED'; resolution?: string },
) {
  const ticket = await loadAccessibleTicket(req, id);
  const before = ticket.status;
  if (input.status === 'RESOLVED' && !input.resolution?.trim() && !ticket.resolution) {
    throw new AppError(422, 'Add a resolution note before resolving the ticket', 'VALIDATION_ERROR');
  }
  ticket.status = input.status;
  if (input.resolution) ticket.resolution = input.resolution;
  ticket.resolvedAt = new Date();
  await ticket.save();

  await notifyUsers([String(ticket.citizen)], {
    type: 'SYSTEM',
    title: `Ticket ${input.status.toLowerCase()}: ${ticket.ticketId}`,
    body: ticket.resolution ?? ticket.subject,
    entityType: 'HelpdeskTicket',
    entityId: String(ticket._id),
    link: `/citizen/helpdesk/${ticket._id}`,
  });
  await recordAudit(req, {
    action: input.status === 'RESOLVED' ? 'HELPDESK_TICKET_RESOLVED' : 'HELPDESK_TICKET_CLOSED',
    entityType: 'HelpdeskTicket',
    entityId: id,
    entityLabel: ticket.ticketId ?? undefined,
    before: { status: before },
    after: { status: input.status, resolution: ticket.resolution },
  });
  return ticket.toObject();
}

export async function ticketStats(req: Request) {
  const match = { ...scopeFilter(req) };
  const [byStatus, byPriority, byCategory, resolution] = await Promise.all([
    HelpdeskTicket.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    HelpdeskTicket.aggregate([
      { $match: { ...match, status: { $in: ['OPEN', 'IN_PROGRESS'] } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    HelpdeskTicket.aggregate([
      { $match: match },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    HelpdeskTicket.aggregate([
      { $match: { ...match, resolvedAt: { $ne: null } } },
      {
        $project: {
          hours: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] },
        },
      },
      { $group: { _id: null, averageHours: { $avg: '$hours' }, resolved: { $sum: 1 } } },
    ]),
  ]);
  return {
    byStatus,
    byPriority,
    byCategory,
    resolution: (resolution as Array<Record<string, unknown>>)[0] ?? { averageHours: 0, resolved: 0 },
  };
}
