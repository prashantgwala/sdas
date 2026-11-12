import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from './error';
import { getPositiveNumberSetting, getSetting } from '../services/setting.service';

const DEFAULT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

const baseDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(baseDir, { recursive: true });

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    const now = new Date();
    const directory = path.join(
      baseDir,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
    );
    fs.mkdirSync(directory, { recursive: true });
    callback(null, directory);
  },
  filename(_req, file, callback) {
    const extension = EXTENSION_BY_MIME[file.mimetype] ?? path.extname(file.originalname);
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

export async function uploadDocuments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let maxMb = env.MAX_UPLOAD_MB;
  let allowed = new Set(DEFAULT_MIME_TYPES);
  try {
    const [configuredMax, configuredMime] = await Promise.all([
      getPositiveNumberSetting('files.maxUploadMb', env.MAX_UPLOAD_MB),
      getSetting<string[]>('files.allowedMimeTypes', DEFAULT_MIME_TYPES),
    ]);
    maxMb = configuredMax;
    if (Array.isArray(configuredMime) && configuredMime.length > 0) {
      allowed = new Set(configuredMime);
    }
  } catch {
    // Fall back to environment defaults if settings cannot be read.
  }

  const uploader = multer({
    storage,
    fileFilter(_req, file, callback) {
      if (!allowed.has(file.mimetype)) {
        callback(new AppError(415, 'This file type is not allowed', 'UNSUPPORTED_FILE_TYPE'));
        return;
      }
      callback(null, true);
    },
    limits: {
      fileSize: Math.round(maxMb * 1024 * 1024),
      files: 10,
    },
  });

  uploader.array('files', 10)(req, res, (error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String((error as { code?: unknown }).code ?? '');
      if (code === 'LIMIT_FILE_SIZE') {
        next(new AppError(413, `File exceeds the ${maxMb} MB limit`, 'FILE_TOO_LARGE'));
        return;
      }
      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
        next(new AppError(400, 'Too many files. Upload at most 10 files per request.', 'FILE_COUNT_EXCEEDED'));
        return;
      }
    }
    next(error);
  });
}

export function uploadRoot(): string {
  return baseDir;
}

export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime] ?? '';
}
