import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  base: { service: 'sdas-api' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      'res.headers["Set-Cookie"]',
      'password',
      'passwordHash',
      'currentPassword',
      'newPassword',
      'refreshToken',
      'accessToken',
      'token',
      'otp',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
});
