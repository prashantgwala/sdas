import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (error instanceof Error && error.name === 'ValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = error.message;
  } else if (error instanceof Error && error.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid identifier';
  } else if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    code = 'FILE_TOO_LARGE';
    message = `File exceeds the ${env.MAX_UPLOAD_MB} MB limit`;
  } else if (error instanceof SyntaxError && (error as { status?: number }).status === 400) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body contains invalid JSON';
  } else if (
    error instanceof Error &&
    (error as { type?: string }).type === 'entity.too.large'
  ) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE';
    message = 'A record with the same unique value already exists';
  }

  if (statusCode >= 500) {
    logger.error({ err: error, requestId: req.requestId, path: req.originalUrl }, 'Unhandled error');
  }

  res.status(statusCode).json({
    success: false,
    error: { code, message, details },
    requestId: req.requestId,
  });
}

export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
