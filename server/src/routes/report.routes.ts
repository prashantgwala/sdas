import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { reportExportQuery, reportRangeQuery } from '../validators/report';
import {
  departmentsController,
  exportController,
  officersController,
  summaryController,
} from '../controllers/report.controller';

export const reportRouter = Router();

reportRouter.use(
  authenticate,
  requireAnyPermission('report.read.dept', 'report.read.district'),
);

reportRouter.get('/', validate({ query: reportRangeQuery }), asyncHandler(summaryController));
reportRouter.get(
  '/departments',
  validate({ query: reportRangeQuery }),
  asyncHandler(departmentsController),
);
reportRouter.get(
  '/officers',
  validate({ query: reportRangeQuery }),
  asyncHandler(officersController),
);
reportRouter.get(
  '/export',
  requirePermission('export'),
  validate({ query: reportExportQuery }),
  asyncHandler(exportController),
);
