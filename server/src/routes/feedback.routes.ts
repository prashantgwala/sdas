import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam, paginationQuery } from '../validators/common';
import {
  createFeedbackSchema,
  feedbackListQuery,
  reviewFeedbackSchema,
} from '../validators/feedback';
import {
  analyticsController,
  createController,
  listController,
  mineController,
  reviewController,
} from '../controllers/feedback.controller';

export const feedbackRouter = Router();

feedbackRouter.use(authenticate);

feedbackRouter.post(
  '/',
  requirePermission('feedback.create'),
  validate({ body: createFeedbackSchema }),
  asyncHandler(createController),
);
feedbackRouter.get(
  '/mine',
  requirePermission('feedback.create'),
  validate({ query: paginationQuery }),
  asyncHandler(mineController),
);
feedbackRouter.get(
  '/',
  requireAnyPermission('feedback.read.dept', 'feedback.read.district'),
  validate({ query: feedbackListQuery }),
  asyncHandler(listController),
);
feedbackRouter.get(
  '/analytics',
  requirePermission('feedback.analyze'),
  asyncHandler(analyticsController),
);
feedbackRouter.post(
  '/:id/review',
  requirePermission('feedback.review'),
  validate({ params: idParam, body: reviewFeedbackSchema }),
  asyncHandler(reviewController),
);
