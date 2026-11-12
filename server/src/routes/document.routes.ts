import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { uploadDocuments } from '../middleware/upload';
import { idParam } from '../validators/common';
import { documentListQuery, myDocumentListQuery, ocrVerifySchema } from '../validators/document';
import {
  deleteController,
  downloadController,
  fetchOcrController,
  listController,
  mineController,
  ocrController,
  uploadController,
  verifyOcrController,
} from '../controllers/document.controller';

export const documentRouter = Router();

documentRouter.use(authenticate);

documentRouter.post('/', uploadDocuments, asyncHandler(uploadController));
documentRouter.get('/mine', validate({ query: myDocumentListQuery }), asyncHandler(mineController));
documentRouter.get('/', validate({ query: documentListQuery }), asyncHandler(listController));
documentRouter.get('/:id/download', validate({ params: idParam }), asyncHandler(downloadController));
documentRouter.delete('/:id', validate({ params: idParam }), asyncHandler(deleteController));

documentRouter.post(
  '/:id/ocr',
  requirePermission('ocr.process'),
  validate({ params: idParam }),
  asyncHandler(ocrController),
);
documentRouter.get('/:id/ocr', validate({ params: idParam }), asyncHandler(fetchOcrController));
documentRouter.patch(
  '/:id/ocr',
  requirePermission('ocr.verify'),
  validate({ params: idParam, body: ocrVerifySchema }),
  asyncHandler(verifyOcrController),
);
