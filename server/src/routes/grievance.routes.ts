import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam } from '../validators/common';
import {
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
import {
  acknowledgeController,
  actionController,
  actionsController,
  assignController,
  classifyController,
  closeController,
  createController,
  decisionController,
  detailController,
  escalateController,
  listController,
  reopenQueueController,
  reopenRequestController,
  reopenReviewController,
  resolutionController,
  routeController,
  timelineController,
  verifyController,
} from '../controllers/grievance.controller';

export const grievanceRouter = Router();

const canRead = requireAnyPermission(
  'grievance.read.own',
  'grievance.read.assigned',
  'grievance.read.dept',
  'grievance.read.district',
);

grievanceRouter.use(authenticate);

grievanceRouter.post(
  '/',
  requirePermission('grievance.create'),
  validate({ body: createGrievanceSchema }),
  asyncHandler(createController),
);

grievanceRouter.get(
  '/',
  canRead,
  validate({ query: grievanceListQuery }),
  asyncHandler(listController),
);

grievanceRouter.get('/reopen-queue', canRead, asyncHandler(reopenQueueController));

grievanceRouter.get(
  '/:id',
  canRead,
  validate({ params: idParam }),
  asyncHandler(detailController),
);
grievanceRouter.get(
  '/:id/timeline',
  canRead,
  validate({ params: idParam }),
  asyncHandler(timelineController),
);
grievanceRouter.get(
  '/:id/actions',
  canRead,
  validate({ params: idParam }),
  asyncHandler(actionsController),
);

grievanceRouter.post(
  '/:id/verify',
  requirePermission('grievance.verify'),
  validate({ params: idParam, body: verifyGrievanceSchema }),
  asyncHandler(verifyController),
);
grievanceRouter.post(
  '/:id/classify',
  requirePermission('grievance.classify'),
  validate({ params: idParam, body: classifyGrievanceSchema }),
  asyncHandler(classifyController),
);
grievanceRouter.post(
  '/:id/route',
  requirePermission('grievance.route'),
  validate({ params: idParam, body: routeGrievanceSchema }),
  asyncHandler(routeController),
);
grievanceRouter.post(
  '/:id/assign',
  requireAnyPermission('grievance.assign', 'grievance.reassign'),
  validate({ params: idParam, body: assignGrievanceSchema }),
  asyncHandler(assignController),
);
grievanceRouter.post(
  '/:id/acknowledge',
  requirePermission('grievance.investigate'),
  validate({ params: idParam }),
  asyncHandler(acknowledgeController),
);
grievanceRouter.post(
  '/:id/actions',
  requireAnyPermission('grievance.investigate', 'grievance.act'),
  validate({ params: idParam, body: grievanceActionSchema }),
  asyncHandler(actionController),
);
grievanceRouter.post(
  '/:id/resolution',
  requirePermission('grievance.resolve'),
  validate({ params: idParam, body: resolutionSchema }),
  asyncHandler(resolutionController),
);
grievanceRouter.post(
  '/:id/decision',
  requireAnyPermission('grievance.approve.dept', 'grievance.approve.district'),
  validate({ params: idParam, body: decisionSchema }),
  asyncHandler(decisionController),
);
grievanceRouter.post(
  '/:id/close',
  requirePermission('grievance.close'),
  validate({ params: idParam, body: closeGrievanceSchema }),
  asyncHandler(closeController),
);
grievanceRouter.post(
  '/:id/reopen-request',
  requirePermission('grievance.read.own'),
  validate({ params: idParam, body: reopenRequestSchema }),
  asyncHandler(reopenRequestController),
);
grievanceRouter.post(
  '/:id/reopen-review',
  requirePermission('grievance.reopen.review'),
  validate({ params: idParam, body: reopenReviewSchema }),
  asyncHandler(reopenReviewController),
);
grievanceRouter.post(
  '/:id/escalate',
  requirePermission('grievance.escalate'),
  validate({ params: idParam, body: escalateGrievanceSchema }),
  asyncHandler(escalateController),
);
