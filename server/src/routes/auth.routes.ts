import { Router } from 'express';
import { asyncHandler } from '../middleware/error';
import { authenticate } from '../middleware/auth';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  changePasswordController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  profileController,
  refreshController,
  registerController,
  resetPasswordController,
  updatePreferencesController,
  updateProfileController,
  verifyOtpController,
} from '../controllers/auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from '../validators/auth';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(registerController));
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(loginController));
authRouter.post('/refresh', authLimiter, asyncHandler(refreshController));
authRouter.post('/logout', asyncHandler(logoutController));

authRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(forgotPasswordController),
);
authRouter.post(
  '/reset-password',
  passwordResetLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(resetPasswordController),
);
authRouter.post(
  '/verify-otp',
  passwordResetLimiter,
  validate({ body: verifyOtpSchema }),
  asyncHandler(verifyOtpController),
);

authRouter.get('/me', authenticate, asyncHandler(meController));
authRouter.get('/profile', authenticate, asyncHandler(profileController));
authRouter.patch(
  '/profile',
  authenticate,
  validate({ body: updateProfileSchema }),
  asyncHandler(updateProfileController),
);
authRouter.patch(
  '/preferences',
  authenticate,
  validate({ body: updatePreferencesSchema }),
  asyncHandler(updatePreferencesController),
);
authRouter.post(
  '/change-password',
  authenticate,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(changePasswordController),
);
