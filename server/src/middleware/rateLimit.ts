import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const skipInTest = () => env.NODE_ENV === 'test';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipInTest,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' },
  },
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many password reset requests.' },
  },
});

export const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many export requests.' },
  },
});
