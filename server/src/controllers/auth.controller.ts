import type { Request, Response } from 'express';
import { ROLE_DASHBOARD } from '../config/constants';
import { created, ok } from '../utils/response';
import { getPermissionsForRole } from '../services/permission.service';
import {
  changePassword,
  getProfile,
  issueAuthCookies,
  login,
  logout,
  refreshSession,
  register,
  requestPasswordReset,
  resetPassword,
  updatePreferences,
  updateProfile,
  verifyOtp,
} from '../services/auth.service';
import type {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from '../validators/auth';
import type { z } from 'zod';

type Input<T> = z.infer<T>;

async function authPayload(userId: string) {
  const { user, permissions } = await getProfile(userId);
  return {
    user,
    permissions,
    dashboard: ROLE_DASHBOARD[user.role],
  };
}

export async function registerController(req: Request, res: Response): Promise<void> {
  const input = req.body as Input<typeof registerSchema>;
  const user = await register(input, req);
  await issueAuthCookies(user, req, res);
  const payload = await authPayload(String(user._id));
  created(res, payload);
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const input = req.body as Input<typeof loginSchema>;
  const user = await login(input, req);
  await issueAuthCookies(user, req, res);
  const payload = await authPayload(String(user._id));
  ok(res, payload);
}

export async function refreshController(req: Request, res: Response): Promise<void> {
  const { user, csrfToken } = await refreshSession(req, res);
  const permissions = await getPermissionsForRole(user.role);
  ok(res, {
    user,
    permissions,
    csrfToken,
    dashboard: ROLE_DASHBOARD[user.role],
  });
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  await logout(req, res);
  ok(res, { loggedOut: true });
}

export async function meController(req: Request, res: Response): Promise<void> {
  const payload = await authPayload(req.user!.id);
  ok(res, payload);
}

export async function forgotPasswordController(req: Request, res: Response): Promise<void> {
  const input = req.body as Input<typeof forgotPasswordSchema>;
  const result = await requestPasswordReset(input.identifier, req);
  ok(res, {
    message:
      'If an active account matches those details, a verification code has been sent to the registered email address.',
    masked: result.masked,
    delivery: result.delivery,
    ...(result.devCode ? { devCode: result.devCode } : {}),
  });
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const input = req.body as Input<typeof resetPasswordSchema>;
  await resetPassword(input, req);
  ok(res, { message: 'Password reset successful. Sign in with your new password.' });
}

export async function verifyOtpController(req: Request, res: Response): Promise<void> {
  const input = req.body as Input<typeof verifyOtpSchema>;
  const result = await verifyOtp(input);
  ok(res, result);
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  const input = req.body as Input<typeof changePasswordSchema>;
  await changePassword(req.user!.id, input, req);
  ok(res, { message: 'Password changed successfully' });
}

export async function profileController(req: Request, res: Response): Promise<void> {
  const payload = await authPayload(req.user!.id);
  ok(res, payload);
}

export async function updateProfileController(req: Request, res: Response): Promise<void> {
  const input = req.body as Input<typeof updateProfileSchema>;
  const user = await updateProfile(req.user!.id, input, req);
  ok(res, { user });
}

export async function updatePreferencesController(req: Request, res: Response): Promise<void> {
  const input = req.body as Input<typeof updatePreferencesSchema>;
  const result = await updatePreferences(req.user!.id, input);
  ok(res, result);
}
