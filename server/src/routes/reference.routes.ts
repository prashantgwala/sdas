import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission } from '../middleware/rbac';
import { asyncHandler } from '../middleware/error';
import { catalogsController, officersController } from '../controllers/reference.controller';

export const referenceRouter = Router();

referenceRouter.use(authenticate);
referenceRouter.get('/catalogs', asyncHandler(catalogsController));
referenceRouter.get(
  '/officers',
  requireAnyPermission(
    'grievance.assign',
    'grievance.reassign',
    'file.dispatch',
    'file.forward',
    'application.decision.dept',
    'meeting.task.assign',
  ),
  asyncHandler(officersController),
);
