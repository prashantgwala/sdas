import 'dotenv/config';
import { z } from 'zod';

const booleanString = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  DB_NAME: z.string().optional(),
  DNS_SERVERS: z.string().default('8.8.8.8,1.1.1.1'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('30m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  COOKIE_SECURE: booleanString.default(false),
  ENCRYPTION_KEY: z.string().min(32),

  UPLOAD_DIR: z.string().default('./uploads/private'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),

  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),
  OPENROUTER_APP_URL: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  SMS_PROVIDER: z.string().optional().default(''),
  SMS_API_KEY: z.string().optional().default(''),

  DISTRICT_NAME: z.string().default('District Administration'),
  DISTRICT_CODE: z.string().default('DIST'),

  SEED_ADMIN_NAME: z.string().default('System Administrator'),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@sdas.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_ADMIN_MOBILE: z.string().default('9999999999'),

  RESTRICTED_MODULE_ENABLED: booleanString.default(false),
  CRON_ENABLED: booleanString.default(true),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
