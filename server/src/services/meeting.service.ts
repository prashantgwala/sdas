import { Types } from 'mongoose';
import type { Request } from 'express';
import type { z } from 'zod';
import { Meeting, MeetingTask } from '../models/meeting';
import { User } from '../models/user';
import { AppError } from '../middleware/error';
import { addTimeline } from './timeline.service';
import { recordAudit } from './audit.service';
import { notifyUsers } from './notification.service';
import { summarizeMeeting } from './ai.service';
import { nextSequence } from '../utils/ids';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type {
  createMeetingSchema,
  createTaskSchema,
  meetingListQuery,
  taskListQuery,
  updateMeetingSchema,
  updateTaskSchema,
} from '../validators/meeting';

type Input<T> = z.infer<T>;

function meetingFilter(req: Request): Record<string, unknown> {
  const user = req.user!;
  if (user.role === 'CITIZEN') return { visibility: 'PUBLIC' };
  if (user.role === 'DISTRICT_ADMIN' || user.role === 'SUPER_ADMIN') return {};
  return {
    $or: [
      { department: user.department },
      { organizer: user.id },
      { 'participants.user': user.id },
    ],
  };
}

function taskFilter(req: Request): Record<string, unknown> {
  const user = req.user!;
  if (user.role === 'DISTRICT_ADMIN' || user.role === 'SUPER_ADMIN') return {};
  if (user.permissions.includes('meeting.task.assign')) {
    return { $or: [{ assignedTo: user.id }, { department: user.department }] };
  }
  return { assignedTo: user.id };
}

async function loadMeeting(req: Request, id: string) {
  const meeting = await Meeting.findOne({ _id: id, ...meetingFilter(req) } as never);
  if (!meeting) throw new AppError(404, 'Meeting not found', 'NOT_FOUND');
  return meeting;
}

async function ensureDepartmentAllowed(req: Request, departmentId?: string | null): Promise<void> {
  const user = req.user!;
  if (user.role === 'DEPARTMENT_HEAD' || user.role === 'CLERK' || user.role === 'OFFICER') {
    if (departmentId && String(departmentId) !== String(user.department ?? '')) {
      throw new AppError(403, 'You can only manage meetings for your department', 'FORBIDDEN_SCOPE');
    }
  }
}

export async function listMeetings(req: Request) {
  const query = req.validatedQuery as Input<typeof meetingListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { ...meetingFilter(req) };
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.mine === 'true') {
    filter.$and = [
      { $or: [{ organizer: req.user!.id }, { 'participants.user': req.user!.id }] },
    ];
  }
  if (query.from || query.to) {
    filter.scheduledAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.q) {
    const pattern = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [...((filter.$or as unknown[]) ?? []), { title: pattern }, { agenda: pattern }];
  }

  const sort = buildSort(query.sort, ['scheduledAt', 'createdAt', 'title', 'status'], '-scheduledAt');
  const [items, total] = await Promise.all([
    Meeting.find(filter as never)
      .populate('organizer', 'name designation email')
      .populate('department', 'name code')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Meeting.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function getMeeting(id: string, req: Request) {
  const meeting = await Meeting.findOne({ _id: id, ...meetingFilter(req) } as never)
    .populate('organizer', 'name designation email')
    .populate('department', 'name code')
    .populate('participants.user', 'name email designation role')
    .lean();
  if (!meeting) throw new AppError(404, 'Meeting not found', 'NOT_FOUND');
  const tasks = await MeetingTask.find({ meeting: id } as never)
    .populate('assignedTo', 'name designation')
    .sort({ dueDate: 1 })
    .lean();
  return { ...meeting, tasks };
}

export async function createMeeting(
  input: Input<typeof createMeetingSchema>,
  req: Request,
) {
  const user = req.user!;
  if (input.type === 'DISTRICT' && user.role !== 'DISTRICT_ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Only district administrators can schedule district meetings', 'FORBIDDEN_ROLE');
  }
  const departmentId = input.department ?? user.department ?? null;
  await ensureDepartmentAllowed(req, departmentId);

  const participants: Array<{ user: Types.ObjectId | null; name: string; role?: string; attendance: 'INVITED' }> = [];
  const userIds: string[] = [];
  for (const participant of input.participants ?? []) {
    if (participant.user) {
      const account = await User.findOne({ _id: participant.user, status: 'ACTIVE' })
        .select('name designation department')
        .lean();
      if (!account) throw new AppError(422, `Participant ${participant.name} is not an active user`, 'INVALID_PARTICIPANT');
      participants.push({
        user: new Types.ObjectId(String(account._id)),
        name: account.name,
        role: participant.role ?? account.designation ?? undefined,
        attendance: 'INVITED',
      });
      userIds.push(String(account._id));
    } else {
      participants.push({ user: null, name: participant.name, role: participant.role, attendance: 'INVITED' });
    }
  }

  const meeting = await Meeting.create({
    meetingId: await nextSequence('MTG'),
    title: input.title,
    agenda: input.agenda,
    type: input.type ?? 'DEPARTMENT',
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? 60,
    mode: input.mode ?? 'PHYSICAL',
    location: input.location,
    organizer: new Types.ObjectId(user.id),
    department: departmentId ? new Types.ObjectId(departmentId) : null,
    participants,
    visibility: input.visibility ?? 'INTERNAL',
    status: 'SCHEDULED',
    minutes: { content: '', status: 'DRAFT' },
  });

  if (userIds.length > 0) {
    await notifyUsers(userIds, {
      type: 'MEETING_SCHEDULED',
      title: `Meeting scheduled: ${meeting.title}`,
      body: `${meeting.scheduledAt.toLocaleString('en-IN')} · ${meeting.location ?? meeting.mode}`,
      entityType: 'Meeting',
      entityId: String(meeting._id),
      link: `/meetings/${meeting._id}`,
    });
  }
  await addTimeline({
    entityType: 'MEETING',
    entityId: String(meeting._id),
    action: 'MEETING_SCHEDULED',
    actor: user.id,
    visibility: meeting.visibility === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL',
    message: `Meeting scheduled for ${meeting.scheduledAt.toISOString()}`,
  });
  await recordAudit(req, {
    action: 'MEETING_CREATED',
    entityType: 'Meeting',
    entityId: String(meeting._id),
    entityLabel: meeting.title,
    after: { title: meeting.title, scheduledAt: meeting.scheduledAt, department: departmentId },
  });
  return meeting.toObject();
}

export async function updateMeeting(
  id: string,
  input: Input<typeof updateMeetingSchema>,
  req: Request,
) {
  const meeting = await loadMeeting(req, id);
  await ensureDepartmentAllowed(req, input.department ?? (meeting.department ? String(meeting.department) : null));
  const before = {
    title: meeting.title,
    scheduledAt: meeting.scheduledAt,
    status: meeting.status,
    location: meeting.location,
  };

  if (input.title !== undefined) meeting.title = input.title;
  if (input.agenda !== undefined) meeting.agenda = input.agenda;
  if (input.type !== undefined) {
    if (input.type === 'DISTRICT' && req.user!.role !== 'DISTRICT_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      throw new AppError(403, 'Only district administrators can schedule district meetings', 'FORBIDDEN_ROLE');
    }
    meeting.type = input.type;
  }
  if (input.scheduledAt !== undefined) meeting.scheduledAt = input.scheduledAt;
  if (input.durationMinutes !== undefined) meeting.durationMinutes = input.durationMinutes;
  if (input.mode !== undefined) meeting.mode = input.mode;
  if (input.location !== undefined) meeting.location = input.location;
  if ('department' in input) {
    meeting.department = input.department ? new Types.ObjectId(input.department) : null;
  }
  if (input.visibility !== undefined) meeting.visibility = input.visibility;
  if (input.status !== undefined) meeting.status = input.status;
  if (input.participants !== undefined) {
    const participants: Array<Record<string, unknown>> = [];
    for (const participant of input.participants) {
      if (participant.user) {
        const account = await User.findOne({ _id: participant.user, status: 'ACTIVE' })
          .select('name designation')
          .lean();
        if (!account) throw new AppError(422, `Participant ${participant.name} is not an active user`, 'INVALID_PARTICIPANT');
        participants.push({
          user: account._id,
          name: account.name,
          role: participant.role ?? account.designation,
          attendance: 'INVITED',
        });
      } else {
        participants.push({
          user: null,
          name: participant.name,
          role: participant.role,
          attendance: 'INVITED',
        });
      }
    }
    meeting.participants = participants as never;
  }
  await meeting.save();

  await recordAudit(req, {
    action: 'MEETING_UPDATED',
    entityType: 'Meeting',
    entityId: id,
    entityLabel: meeting.title,
    before,
    after: { title: meeting.title, scheduledAt: meeting.scheduledAt, status: meeting.status, location: meeting.location },
  });
  return meeting.toObject();
}

export async function draftMinutes(
  id: string,
  input: { content: string; attendance?: Array<{ user?: string; name: string; attendance: 'INVITED' | 'PRESENT' | 'ABSENT' }> },
  req: Request,
) {
  const meeting = await loadMeeting(req, id);
  await ensureDepartmentAllowed(req, meeting.department ? String(meeting.department) : null);
  if (meeting.status === 'CANCELLED') {
    throw new AppError(422, 'Minutes cannot be drafted for a cancelled meeting', 'INVALID_STATE');
  }

  meeting.minutes.content = input.content;
  meeting.minutes.status = 'DRAFT';
  meeting.minutes.draftedBy = new Types.ObjectId(req.user!.id);

  if (input.attendance) {
    for (const entry of input.attendance) {
      const participant = (meeting.participants as unknown as Array<Record<string, unknown>>).find(
        (item) =>
          (entry.user && String(item.user ?? '') === entry.user) ||
          String(item.name).toLowerCase() === entry.name.toLowerCase(),
      );
      if (participant) participant.attendance = entry.attendance;
    }
  }
  await meeting.save();

  await addTimeline({
    entityType: 'MEETING',
    entityId: id,
    action: 'MINUTES_DRAFTED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: 'Meeting minutes drafted',
  });
  await recordAudit(req, {
    action: 'MEETING_MINUTES_DRAFTED',
    entityType: 'Meeting',
    entityId: id,
    entityLabel: meeting.title,
  });
  return meeting.toObject();
}

export async function summarizeMinutes(
  id: string,
  content: string | undefined,
  req: Request,
) {
  const meeting = await loadMeeting(req, id);
  const source = content?.trim() || meeting.minutes.content?.trim() || `${meeting.agenda}\n${meeting.title}`;
  if (source.length < 20) {
    throw new AppError(422, 'Provide the minutes content before generating a summary', 'VALIDATION_ERROR');
  }
  const result = await summarizeMeeting(source);
  meeting.minutes.aiSummary = result.summary;
  meeting.minutes.aiGeneratedAt = new Date();
  await meeting.save();

  await recordAudit(req, {
    action: 'MEETING_SUMMARY_GENERATED',
    entityType: 'Meeting',
    entityId: id,
    entityLabel: meeting.title,
    after: { actionPoints: result.actionPoints },
  });
  return {
    ...result,
    generatedAt: meeting.minutes.aiGeneratedAt,
    engine: 'local-extractive',
    requiresReview: true,
  };
}

export async function approveMinutes(id: string, req: Request) {
  const meeting = await loadMeeting(req, id);
  if (meeting.minutes.status === 'APPROVED') {
    throw new AppError(409, 'Minutes are already approved', 'INVALID_STATE');
  }
  if (!meeting.minutes.content?.trim()) {
    throw new AppError(422, 'Draft the minutes before approval', 'INVALID_STATE');
  }
  meeting.minutes.status = 'APPROVED';
  meeting.minutes.approvedBy = new Types.ObjectId(req.user!.id);
  meeting.minutes.approvedAt = new Date();
  meeting.status = 'COMPLETED';
  await meeting.save();

  await notifyUsers([String(meeting.organizer)], {
    type: 'SYSTEM',
    title: `Minutes approved: ${meeting.title}`,
    body: 'The meeting minutes have been approved and the meeting is marked completed.',
    entityType: 'Meeting',
    entityId: id,
    link: `/meetings/${id}`,
  });
  await addTimeline({
    entityType: 'MEETING',
    entityId: id,
    action: 'MINUTES_APPROVED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: 'Minutes approved; meeting completed',
  });
  await recordAudit(req, {
    action: 'MEETING_MINUTES_APPROVED',
    entityType: 'Meeting',
    entityId: id,
    entityLabel: meeting.title,
  });
  return meeting.toObject();
}

/* ---------------------------------- tasks --------------------------------- */

export async function listTasks(req: Request) {
  const query = req.validatedQuery as Input<typeof taskListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { ...taskFilter(req) };
  if (query.status) filter.status = query.status;
  if (query.meeting) filter.meeting = query.meeting;
  if (query.mine === 'true') filter.assignedTo = req.user!.id;
  if (query.q) {
    filter.description = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const sort = buildSort(query.sort, ['dueDate', 'createdAt', 'status'], 'dueDate');
  const [items, total] = await Promise.all([
    MeetingTask.find(filter as never)
      .populate('meeting', 'title meetingId scheduledAt')
      .populate('assignedTo', 'name designation email')
      .populate('department', 'name code')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    MeetingTask.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function createTask(
  input: Input<typeof createTaskSchema>,
  req: Request,
) {
  const meeting = await loadMeeting(req, input.meeting);
  const assignee = await User.findOne({ _id: input.assignedTo, status: 'ACTIVE' })
    .select('name department')
    .lean();
  if (!assignee) throw new AppError(422, 'Select an active user to assign the task', 'INVALID_ASSIGNEE');

  const user = req.user!;
  if (user.role !== 'DISTRICT_ADMIN' && user.role !== 'SUPER_ADMIN') {
    if (String(assignee.department ?? '') !== String(user.department ?? '')) {
      throw new AppError(403, 'Tasks can only be assigned within your department', 'FORBIDDEN_SCOPE');
    }
  }

  const task = await MeetingTask.create({
    taskId: await nextSequence('TASK'),
    meeting: new Types.ObjectId(input.meeting),
    description: input.description,
    assignedTo: new Types.ObjectId(input.assignedTo),
    department: input.department
      ? new Types.ObjectId(input.department)
      : (assignee.department as Types.ObjectId | null | undefined) ?? (meeting.department as Types.ObjectId | null),
    dueDate: input.dueDate,
    status: 'OPEN',
    createdBy: new Types.ObjectId(user.id),
  });

  await notifyUsers([input.assignedTo], {
    type: 'TASK_DEADLINE',
    title: 'New action item assigned',
    body: `${input.description.slice(0, 180)} · Due ${input.dueDate.toISOString().slice(0, 10)}`,
    entityType: 'MeetingTask',
    entityId: String(task._id),
    link: `/tasks/${task._id}`,
    channels: ['IN_APP', 'EMAIL'],
  });
  await addTimeline({
    entityType: 'TASK',
    entityId: String(task._id),
    action: 'TASK_ASSIGNED',
    actor: user.id,
    visibility: 'INTERNAL',
    message: `Task assigned to ${assignee.name}`,
  });
  await recordAudit(req, {
    action: 'MEETING_TASK_CREATED',
    entityType: 'MeetingTask',
    entityId: String(task._id),
    entityLabel: task.taskId ?? undefined,
    after: { meeting: input.meeting, assignedTo: input.assignedTo, dueDate: input.dueDate },
  });
  return task.toObject();
}

export async function updateTask(
  id: string,
  input: Input<typeof updateTaskSchema>,
  req: Request,
) {
  const task = await MeetingTask.findById(id);
  if (!task) throw new AppError(404, 'Task not found', 'NOT_FOUND');
  const user = req.user!;
  const canAssign = user.permissions.includes('meeting.task.assign');
  if (String(task.assignedTo) !== user.id && String(task.createdBy) !== user.id && !canAssign) {
    throw new AppError(403, 'You do not have access to this task', 'FORBIDDEN_SCOPE');
  }
  if (user.role !== 'DISTRICT_ADMIN' && user.role !== 'SUPER_ADMIN' && !canAssign && input.status && input.status !== 'IN_PROGRESS' && input.status !== 'COMPLETED') {
    throw new AppError(403, 'You can only progress your assigned tasks', 'FORBIDDEN_PERMISSION');
  }

  const before = { status: task.status, dueDate: task.dueDate, description: task.description };
  if (input.description !== undefined) task.description = input.description;
  if (input.dueDate !== undefined) task.dueDate = input.dueDate;
  if (input.status !== undefined) {
    task.status = input.status;
    if (input.status === 'COMPLETED') task.completedAt = new Date();
    if (input.status !== 'COMPLETED') task.completedAt = null;
  }
  if (input.evidenceDocumentIds !== undefined) {
    task.completionEvidence = input.evidenceDocumentIds.map((docId) => new Types.ObjectId(docId));
  }
  await task.save();

  await addTimeline({
    entityType: 'TASK',
    entityId: id,
    action: 'TASK_UPDATED',
    fromStatus: before.status,
    toStatus: task.status,
    actor: user.id,
    visibility: 'INTERNAL',
    message: input.status ? `Task marked ${task.status}` : 'Task updated',
  });
  if (input.status === 'COMPLETED') {
    await notifyUsers([String(task.createdBy)], {
      type: 'SYSTEM',
      title: 'Action item completed',
      body: `${task.description.slice(0, 180)} has been marked completed.`,
      entityType: 'MeetingTask',
      entityId: id,
      link: `/tasks/${id}`,
    });
  }
  await recordAudit(req, {
    action: 'MEETING_TASK_UPDATED',
    entityType: 'MeetingTask',
    entityId: id,
    entityLabel: task.taskId ?? undefined,
    before,
    after: { status: task.status, dueDate: task.dueDate, description: task.description },
  });
  return task.toObject();
}
