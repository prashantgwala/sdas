import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam } from '../validators/common';
import {
  applicationDecisionSchema,
  applicationListQuery,
  assignApplicationSchema,
  createApplicationSchema,
  reviewApplicationSchema,
  verifyApplicationSchema,
} from '../validators/application';
import {
  assignController,
  completenessController,
  createController,
  decisionController,
  detailController,
  listController,
  reviewController,
  typesController,
  verifyController,
} from '../controllers/application.controller';

export const applicationRouter = Router();

const canRead = requireAnyPermission(
  'application.read.own',
  'application.read.assigned',
  'application.read.dept',
  'application.read.district',
);

applicationRouter.use(authenticate);

applicationRouter.get('/types', typesController);

applicationRouter.post(
  '/',
  requirePermission('application.create'),
  validate({ body: createApplicationSchema }),
  asyncHandler(createController),
);
applicationRouter.get('/', canRead, validate({ query: applicationListQuery }), asyncHandler(listController));
applicationRouter.get('/:id', canRead, validate({ params: idParam }), asyncHandler(detailController));
applicationRouter.get('/:id/completeness', canRead, validate({ params: idParam }), asyncHandler(completenessController));

applicationRouter.post(
  '/:id/verify',
  requirePermission('application.verify'),
  validate({ params: idParam, body: verifyApplicationSchema }),
  asyncHandler(verifyController),
);
applicationRouter.post(
  '/:id/assign',
  requirePermission('application.decision.dept'),
  validate({ params: idParam, body: assignApplicationSchema }),
  asyncHandler(assignController),
);
applicationRouter.post(
  '/:id/review',
  requirePermission('application.review'),
  validate({ params: idParam, body: reviewApplicationSchema }),
  asyncHandler(reviewController),
);
applicationRouter.post(
  '/:id/decision',
  requireAnyPermission('application.decision.dept', 'application.decision.district'),
  validate({ params: idParam, body: applicationDecisionSchema }),
  asyncHandler(decisionController),
);
