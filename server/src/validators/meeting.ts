import { z } from 'zod';
import { MEETING_STATUSES, TASK_STATUSES } from '../config/constants';
import { objectId, optionalObjectId, paginationQuery } from './common';

const participantSchema = z.object({
  user: optionalObjectId,
  name: z.string().trim().min(2).max(120),
  role: z.string().trim().max(120).optional(),
});

export const createMeetingSchema = z.object({
  title: z.string().trim().min(5).max(250),
  agenda: z.string().trim().min(10).max(5000),
  type: z.enum(['DISTRICT', 'DEPARTMENT', 'REVIEW', 'EMERGENCY']).optional(),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(15).max(1440).optional(),
  mode: z.enum(['PHYSICAL', 'ONLINE', 'HYBRID']).optional(),
  location: z.string().trim().max(300).optional(),
  department: optionalObjectId,
  visibility: z.enum(['PUBLIC', 'INTERNAL']).optional(),
  participants: z.array(participantSchema).max(100).optional(),
});

export const updateMeetingSchema = createMeetingSchema.partial().extend({
  status: z.enum(MEETING_STATUSES).optional(),
});

export const meetingListQuery = paginationQuery.extend({
  status: z.enum(MEETING_STATUSES).optional(),
  type: z.enum(['DISTRICT', 'DEPARTMENT', 'REVIEW', 'EMERGENCY']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  mine: z.enum(['true', 'false']).optional(),
});

export const minutesDraftSchema = z.object({
  content: z.string().trim().min(20).max(30000),
  attendance: z
    .array(
      z.object({
        user: optionalObjectId,
        name: z.string().trim().min(2).max(120),
        attendance: z.enum(['INVITED', 'PRESENT', 'ABSENT']),
      }),
    )
    .max(100)
    .optional(),
});

export const summarizeMeetingSchema = z.object({
  content: z.string().trim().min(20).max(30000).optional(),
});

export const createTaskSchema = z.object({
  meeting: objectId,
  description: z.string().trim().min(5).max(3000),
  assignedTo: objectId,
  department: optionalObjectId,
  dueDate: z.coerce.date(),
});

export const updateTaskSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  description: z.string().trim().min(5).max(3000).optional(),
  dueDate: z.coerce.date().optional(),
  evidenceDocumentIds: z.array(objectId).max(20).optional(),
});

export const taskListQuery = paginationQuery.extend({
  status: z.enum(TASK_STATUSES).optional(),
  mine: z.enum(['true', 'false']).optional(),
  meeting: optionalObjectId,
});
