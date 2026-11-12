import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getSetting } from './setting.service';

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
}

function getTransporter(): Transporter | null {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const enabled = await getSetting<boolean>('notifications.emailEnabled', true);
  if (!enabled) return false;
  const client = getTransporter();
  if (!client) return false;
  try {
    await client.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject, html });
    return true;
  } catch (error) {
    logger.error({ err: error, to }, 'Email delivery failed');
    return false;
  }
}

export async function verifyEmailConnection(): Promise<boolean> {
  const client = getTransporter();
  if (!client) return false;
  try {
    await client.verify();
    return true;
  } catch (error) {
    logger.warn({ err: error }, 'SMTP verification failed');
    return false;
  }
}

export function isSmsConfigured(): boolean {
  return Boolean(env.SMS_PROVIDER && env.SMS_API_KEY);
}
