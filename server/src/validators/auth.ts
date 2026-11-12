import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/\d/, 'Password must include a number');

const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10 digit mobile number');

const email = z.string().trim().toLowerCase().email('Enter a valid email address');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  mobile,
  password,
  language: z.enum(['en', 'hi', 'hinglish']).default('en'),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(128),
  remember: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
});

export const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit verification code'),
  newPassword: password,
});

export const verifyOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit verification code'),
  purpose: z.enum(['RESET_PASSWORD', 'VERIFY_CONTACT']).default('RESET_PASSWORD'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  mobile: mobile.optional(),
  designation: z.string().trim().max(120).optional(),
  citizenProfile: z
    .object({
      address: z.string().trim().max(500).optional(),
      tehsil: z.string().trim().max(120).optional(),
      language: z.enum(['en', 'hi', 'hinglish']).optional(),
    })
    .optional(),
});

export const updatePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  layout: z.enum(['comfortable', 'compact']).optional(),
  sidebarCollapsed: z.boolean().optional(),
  language: z.enum(['en', 'hi', 'hinglish']).optional(),
});
