import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { uploadRoot } from '../middleware/upload';

export function toRelativeStoragePath(absolutePath: string): string {
  return path.relative(uploadRoot(), absolutePath).split(path.sep).join('/');
}

export function resolveStoragePath(relativePath: string): string {
  const resolved = path.resolve(uploadRoot(), relativePath);
  const root = path.resolve(uploadRoot());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Invalid storage path');
  }
  return resolved;
}

export function checksumFileSync(absolutePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(absolutePath));
  return hash.digest('hex');
}

export async function removeStoredFile(relativePath: string): Promise<void> {
  try {
    await fsp.unlink(resolveStoragePath(relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function readStoredFile(relativePath: string): Promise<Buffer> {
  return fsp.readFile(resolveStoragePath(relativePath));
}
