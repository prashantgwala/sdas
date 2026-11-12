import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam } from '../validators/common';
import {
  createMeetingSchema,
  createTaskSchema,
  meetingListQuery,
  minutesDraftSchema,
  summarizeMeetingSchema,
  taskListQuery,
  updateMeetingSchema,
  updateTaskSchema,
} from '../validators/meeting';
import {
  approveMinutesController,
  createMeetingController,
  createTaskController,
  detailController,
  draftMinutesController,
  listMeetingsController,
  listTasksController,
  summarizeController,
  updateMeetingController,
  updateTaskController,
} from '../controllers/meeting.controller';

export const meetingRouter = Router();

meetingRouter.use(authenticate);

meetingRouter.get(
  '/',
  requirePermission('meeting.read'),
  validate({ query: meetingListQuery }),
  asyncHandler(listMeetingsController),
);
meetingRouter.post(
  '/',
  requirePermission('meeting.create'),
  validate({ body: createMeetingSchema }),
  asyncHandler(createMeetingController),
);
meetingRouter.get(
  '/:id',
  requirePermission('meeting.read'),
  validate({ params: idParam }),
  asyncHandler(detailController),
);
meetingRouter.patch(
  '/:id',
  requirePermission('meeting.update'),
  validate({ params: idParam, body: updateMeetingSchema }),
  asyncHandler(updateMeetingController),
);
meetingRouter.post(
  '/:id/minutes',
  requirePermission('meeting.minutes.draft'),
  validate({ params: idParam, body: minutesDraftSchema }),
  asyncHandler(draftMinutesController),
);
meetingRouter.post(
  '/:id/minutes/summarize',
  requireAnyPermission('meeting.minutes.draft', 'ai.meeting_summary'),
  validate({ params: idParam, body: summarizeMeetingSchema }),
  asyncHandler(summarizeController),
);
meetingRouter.post(
  '/:id/minutes/approve',
  requirePermission('meeting.minutes.approve'),
  validate({ params: idParam }),
  asyncHandler(approveMinutesController),
);
meetingRouter.post(
  '/:id/tasks',
  requirePermission('meeting.task.assign'),
  validate({ params: idParam, body: createTaskSchema.omit({ meeting: true }) }),
  asyncHandler((req, res) => {
    req.body.meeting = params(req).id;
    return createTaskController(req, res);
  }),
);

export const taskRouter = Router();

taskRouter.use(authenticate);

taskRouter.get(
  '/',
  requirePermission('task.read'),
  validate({ query: taskListQuery }),
  asyncHandler(listTasksController),
);
taskRouter.patch(
  '/:id',
  requirePermission('meeting.task.update'),
  validate({ params: idParam, body: updateTaskSchema }),
  asyncHandler(updateTaskController),
);

function params(req: Request): Record<string, string> {
  return (req.validatedParams ?? {}) as Record<string, string>;
}
