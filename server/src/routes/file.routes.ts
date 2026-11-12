import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam } from '../validators/common';
import {
  archiveFileSchema,
  createFileSchema,
  dispatchFileSchema,
  fileDecisionSchema,
  fileListQuery,
  fileNoteSchema,
  finalizeFileSchema,
  qrVerifyQuery,
  receiveFileSchema,
  updateFileSchema,
} from '../validators/file';
import {
  archiveController,
  decisionController,
  detailController,
  dispatchController,
  finalizeController,
  listController,
  movementsController,
  noteController,
  qrFetchController,
  qrGenerateController,
  qrImageController,
  qrVerifyController,
  receiveController,
  registerController,
  updateController,
} from '../controllers/file.controller';

export const fileRouter = Router();

const canRead = requireAnyPermission('file.read.assigned', 'file.read.dept', 'file.read.district');

fileRouter.use(authenticate);

fileRouter.post(
  '/',
  requirePermission('file.register'),
  validate({ body: createFileSchema }),
  asyncHandler(registerController),
);
fileRouter.get('/', canRead, validate({ query: fileListQuery }), asyncHandler(listController));
fileRouter.get('/qr/verify', canRead, validate({ query: qrVerifyQuery }), asyncHandler(qrVerifyController));

fileRouter.get('/:id', canRead, validate({ params: idParam }), asyncHandler(detailController));
fileRouter.patch(
  '/:id',
  requirePermission('file.update'),
  validate({ params: idParam, body: updateFileSchema }),
  asyncHandler(updateController),
);
fileRouter.get('/:id/movements', canRead, validate({ params: idParam }), asyncHandler(movementsController));

fileRouter.post(
  '/:id/qr',
  requirePermission('file.qr.generate'),
  validate({ params: idParam }),
  asyncHandler(qrGenerateController),
);
fileRouter.get('/:id/qr', canRead, validate({ params: idParam }), asyncHandler(qrFetchController));
fileRouter.get('/:id/qr.png', canRead, validate({ params: idParam }), asyncHandler(qrImageController));

fileRouter.post(
  '/:id/dispatch',
  requireAnyPermission('file.dispatch', 'file.forward'),
  validate({ params: idParam, body: dispatchFileSchema }),
  asyncHandler(dispatchController),
);
fileRouter.post(
  '/:id/receive',
  requirePermission('file.receive'),
  validate({ params: idParam, body: receiveFileSchema }),
  asyncHandler(receiveController),
);
fileRouter.post(
  '/:id/notes',
  requirePermission('file.note'),
  validate({ params: idParam, body: fileNoteSchema }),
  asyncHandler(noteController),
);
fileRouter.post(
  '/:id/decision',
  requireAnyPermission('file.approve.dept', 'file.approve.district'),
  validate({ params: idParam, body: fileDecisionSchema }),
  asyncHandler(decisionController),
);
fileRouter.post(
  '/:id/finalize',
  requirePermission('file.finalize'),
  validate({ params: idParam, body: finalizeFileSchema }),
  asyncHandler(finalizeController),
);
fileRouter.post(
  '/:id/archive',
  requirePermission('file.archive'),
  validate({ params: idParam, body: archiveFileSchema }),
  asyncHandler(archiveController),
);
