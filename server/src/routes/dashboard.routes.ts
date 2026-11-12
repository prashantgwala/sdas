import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../middleware/error';
import { dashboardController } from '../controllers/dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate, requirePermission('dashboard.self'));
dashboardRouter.get('/', asyncHandler(dashboardController));
