import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam } from '../validators/common';
import {
  closeRoadSchema,
  createRoadReportSchema,
  inspectRoadSchema,
  repairUpdateSchema,
  roadAiReviewSchema,
  roadListQuery,
  verifyRoadSchema,
} from '../validators/road';
import {
  aiReviewController,
  closeController,
  createController,
  detailController,
  inspectController,
  listController,
  repairUpdateController,
  verifyController,
} from '../controllers/road.controller';

export const roadRouter = Router();

roadRouter.use(authenticate, requirePermission('road.read'));

roadRouter.get('/', validate({ query: roadListQuery }), asyncHandler(listController));
roadRouter.post(
  '/',
  requirePermission('road.create'),
  validate({ body: createRoadReportSchema }),
  asyncHandler(createController),
);
roadRouter.get('/:id', validate({ params: idParam }), asyncHandler(detailController));
roadRouter.post(
  '/:id/inspect',
  requirePermission('road.inspect'),
  validate({ params: idParam, body: inspectRoadSchema }),
  asyncHandler(inspectController),
);
roadRouter.post(
  '/:id/verify',
  requirePermission('road.verify'),
  validate({ params: idParam, body: verifyRoadSchema }),
  asyncHandler(verifyController),
);
roadRouter.post(
  '/:id/repairs',
  requirePermission('road.repair.update'),
  validate({ params: idParam, body: repairUpdateSchema }),
  asyncHandler(repairUpdateController),
);
roadRouter.post(
  '/:id/ai-review',
  requirePermission('road.ai.review'),
  validate({ params: idParam, body: roadAiReviewSchema }),
  asyncHandler(aiReviewController),
);
roadRouter.post(
  '/:id/close',
  requirePermission('road.close'),
  validate({ params: idParam, body: closeRoadSchema }),
  asyncHandler(closeController),
);
