import crypto from 'node:crypto';
import { env } from '../config/env';

const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randomNumericCode(length = 6): string {
  let code = '';
  while (code.length < length) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) throw new Error('Invalid encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function signQrPayload(fileId: string, version: number): string {
  const payload = `${fileId}.${version}`;
  const signature = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyQrPayload(token: string): { fileId: string; version: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [fileId, versionRaw, signature] = parts;
  const expected = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`${fileId}.${versionRaw}`)
    .digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const version = Number(versionRaw);
  if (!Number.isInteger(version)) return null;
  return { fileId, version };
}
