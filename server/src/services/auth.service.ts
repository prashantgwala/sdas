import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { env, isProduction } from '../config/env';
import { logger } from '../config/logger';
import type { Role } from '../config/constants';
import { LoginAttempt, OtpToken, Session, User } from '../models/user';
import { AppError } from '../middleware/error';
import { getPermissionsForRole } from './permission.service';
import { getPositiveNumberSetting } from './setting.service';
import { recordAudit } from './audit.service';
import { sendEmail, isEmailConfigured } from './mail.service';
import { parseDuration } from '../utils/dates';
import { hashToken, randomNumericCode, randomToken } from '../utils/crypto';
import {
  clearAuthCookies,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens';

const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  department: string | null;
  departmentName: string | null;
  office: string | null;
  designation: string | null;
  status: string;
  preferences?: Record<string, unknown>;
  citizenProfile?: Record<string, unknown>;
  lastLoginAt?: Date | null;
  createdAt?: Date;
}

type UserRecord = Record<string, any>;

export function toPublicUser(user: UserRecord): PublicUser {
  const department = user.department;
  const departmentId =
    department && typeof department === 'object' ? String(department._id ?? '') : department ?? null;
  const departmentName =
    department && typeof department === 'object' ? department.name ?? null : null;

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    department: departmentId || null,
    departmentName,
    office: user.office ? String(typeof user.office === 'object' ? user.office._id : user.office) : null,
    designation: user.designation ?? null,
    status: user.status,
    preferences: user.preferences,
    citizenProfile: user.citizenProfile,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}

async function findByIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  const query = normalized.includes('@')
    ? { email: normalized }
    : { mobile: identifier.trim() };
  return User.findOne(query).select('+passwordHash');
}

function clientMeta(req: Request) {
  return {
    ip: req.ip?.slice(0, 80),
    userAgent: req.header('user-agent')?.slice(0, 500),
  };
}

async function createSession(
  user: { _id: unknown; role: Role },
  req: Request,
): Promise<{ refreshToken: string; sessionId: string }> {
  const sessionId = new Types.ObjectId();
  const refreshToken = signRefreshToken(String(user._id), String(sessionId));
  const meta = clientMeta(req);
  await Session.create({
    _id: sessionId,
    user: new Types.ObjectId(String(user._id)),
    refreshTokenHash: hashToken(refreshToken),
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_TTL)),
  });
  return { refreshToken, sessionId: String(sessionId) };
}

async function issueSession(
  user: { _id: unknown; role: Role },
  req: Request,
  res: Parameters<typeof setAuthCookies>[0],
) {
  const { refreshToken, sessionId } = await createSession(user, req);
  const accessMinutes = await getPositiveNumberSetting('security.sessionTimeoutMinutes', parseDuration(env.ACCESS_TOKEN_TTL) / 60_000);
  const accessToken = signAccessToken(String(user._id), sessionId, user.role, accessMinutes);
  const csrfToken = randomToken(32);
  setAuthCookies(res, accessToken, refreshToken, csrfToken, accessMinutes);
  return csrfToken;
}

export async function register(
  input: { name: string; email: string; mobile: string; password: string; language: 'en' | 'hi' | 'hinglish' },
  req: Request,
) {
  const existing = await User.findOne({
    $or: [{ email: input.email }, { mobile: input.mobile }],
  })
    .select('email mobile')
    .lean();
  if (existing) {
    const field = existing.email === input.email ? 'email' : 'mobile';
    throw new AppError(409, `An account with this ${field} already exists`, 'ACCOUNT_EXISTS');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    name: input.name,
    email: input.email,
    mobile: input.mobile,
    passwordHash,
    role: 'CITIZEN',
    status: 'ACTIVE',
    citizenProfile: { language: input.language },
    preferences: { language: input.language },
  });

  await recordAudit(req, {
    action: 'AUTH_REGISTER',
    entityType: 'User',
    entityId: String(user._id),
    entityLabel: user.email,
    actorId: String(user._id),
    actorRole: 'CITIZEN',
  });

  return user.toObject();
}

export async function login(
  input: { identifier: string; password: string },
  req: Request,
) {
  const meta = clientMeta(req);
  const user = await findByIdentifier(input.identifier);
  const recordAttempt = (success: boolean, reason: string) =>
    LoginAttempt.create({
      identifier: input.identifier.slice(0, 120),
      ip: meta.ip,
      userAgent: meta.userAgent,
      success,
      reason,
    }).catch((error) => logger.warn({ err: error }, 'Failed to record login attempt'));

  if (!user) {
    await recordAttempt(false, 'UNKNOWN_ACCOUNT');
    await recordAudit(req, {
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityLabel: input.identifier,
      status: 'FAILURE',
      actorRole: null,
    });
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await recordAttempt(false, 'ACCOUNT_LOCKED');
    throw new AppError(423, 'Account temporarily locked after multiple failed attempts', 'ACCOUNT_LOCKED');
  }

  if (user.status !== 'ACTIVE') {
    await recordAttempt(false, 'ACCOUNT_INACTIVE');
    throw new AppError(403, 'This account is not active. Contact the administrator.', 'ACCOUNT_INACTIVE');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    const [maxFailedLogins, lockMinutes] = await Promise.all([
      getPositiveNumberSetting('security.maxLoginAttempts', 5),
      getPositiveNumberSetting('security.lockoutMinutes', 30),
    ]);
    const failedLoginCount = (user.failedLoginCount ?? 0) + 1;
    const lockedUntil =
      failedLoginCount >= maxFailedLogins
        ? new Date(Date.now() + lockMinutes * 60 * 1000)
        : user.lockedUntil;
    await User.updateOne({ _id: user._id }, { $set: { failedLoginCount, lockedUntil } });
    await recordAttempt(false, 'INVALID_PASSWORD');
    await recordAudit(req, {
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: String(user._id),
      entityLabel: user.email,
      status: 'FAILURE',
      actorId: String(user._id),
      actorRole: user.role,
    });
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } },
  );
  await recordAttempt(true, 'SUCCESS');
  await recordAudit(req, {
    action: 'AUTH_LOGIN',
    entityType: 'User',
    entityId: String(user._id),
    entityLabel: user.email,
    actorId: String(user._id),
    actorRole: user.role,
  });

  return user;
}

export async function issueAuthCookies(
  user: { _id: unknown; role: Role },
  req: Request,
  res: Parameters<typeof setAuthCookies>[0],
) {
  await issueSession(user, req, res);
}

export async function refreshSession(req: Request, res: Parameters<typeof setAuthCookies>[0]) {
  const cookies = req.cookies as Record<string, string> | undefined;
  const token = cookies?.sdas_refresh;
  if (!token) throw new AppError(401, 'Refresh session missing', 'UNAUTHORIZED');

  const payload = verifyRefreshToken(token);
  const session = await Session.findById(payload.sid);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    clearAuthCookies(res);
    throw new AppError(401, 'Session expired or revoked', 'SESSION_EXPIRED');
  }
  if (session.refreshTokenHash !== hashToken(token)) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { revokedAt: new Date() } },
    );
    clearAuthCookies(res);
    logger.warn({ userId: payload.sub, sessionId: payload.sid }, 'Refresh token reuse detected');
    throw new AppError(401, 'Session is no longer valid', 'SESSION_EXPIRED');
  }

  const user = await User.findById(payload.sub).populate('department', 'name code').lean();
  if (!user || user.status !== 'ACTIVE') {
    clearAuthCookies(res);
    throw new AppError(401, 'Session is no longer valid', 'UNAUTHORIZED');
  }

  const nextRefresh = signRefreshToken(String(user._id), String(session._id));
  session.refreshTokenHash = hashToken(nextRefresh);
  session.lastUsedAt = new Date();
  session.expiresAt = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_TTL));
  await session.save();

  const accessMinutes = await getPositiveNumberSetting('security.sessionTimeoutMinutes', parseDuration(env.ACCESS_TOKEN_TTL) / 60_000);
  const accessToken = signAccessToken(String(user._id), String(session._id), user.role, accessMinutes);
  const csrfToken = randomToken(32);
  setAuthCookies(res, accessToken, nextRefresh, csrfToken, accessMinutes);

  return { user: toPublicUser(user), csrfToken };
}

export async function logout(req: Request, res: Parameters<typeof clearAuthCookies>[0]) {
  if (req.sessionId) {
    await Session.updateOne(
      { _id: req.sessionId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ).catch(() => undefined);
  }
  clearAuthCookies(res);
}

export async function getProfile(userId: string) {
  const user = await User.findById(userId)
    .populate('department', 'name code')
    .populate('office', 'name code')
    .lean();
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  const permissions = await getPermissionsForRole(user.role);
  return { user: toPublicUser(user), permissions };
}

export async function requestPasswordReset(identifier: string, req: Request) {
  const user = await findByIdentifier(identifier);
  const masked = identifier.includes('@')
    ? identifier.replace(/^(.).*(@.*)$/, '$1***$2')
    : `${identifier.slice(0, 2)}******${identifier.slice(-2)}`;

  if (!user || user.status !== 'ACTIVE') {
    return { delivery: 'NONE' as const, masked };
  }

  await OtpToken.updateMany(
    { user: user._id, purpose: 'RESET_PASSWORD', usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  const code = randomNumericCode(6);
  await OtpToken.create({
    user: user._id,
    purpose: 'RESET_PASSWORD',
    tokenHash: hashToken(code),
    channel: 'email',
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  });

  let delivery: 'EMAIL' | 'NONE' = 'NONE';
  if (isEmailConfigured() && user.email) {
    const sent = await sendEmail(
      user.email,
      'SDAS password reset code',
      `<p>Your SDAS password reset code is <strong>${code}</strong>.</p>
       <p>This code expires in ${OTP_TTL_MINUTES} minutes. If you did not request a reset, ignore this email.</p>`,
    );
    if (sent) delivery = 'EMAIL';
  }

  await recordAudit(req, {
    action: 'AUTH_PASSWORD_RESET_REQUESTED',
    entityType: 'User',
    entityId: String(user._id),
    entityLabel: user.email,
    actorId: String(user._id),
    actorRole: user.role,
  });

  return {
    delivery,
    masked,
    devCode: !isProduction && delivery === 'NONE' ? code : undefined,
  };
}

export async function resetPassword(
  input: { identifier: string; code: string; newPassword: string },
  req: Request,
) {
  const user = await findByIdentifier(input.identifier);
  if (!user || user.status !== 'ACTIVE') {
    throw new AppError(400, 'Invalid or expired verification code', 'INVALID_OTP');
  }

  const token = await OtpToken.findOne({
    user: user._id,
    purpose: 'RESET_PASSWORD',
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!token || token.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(400, 'Invalid or expired verification code', 'INVALID_OTP');
  }

  if (token.tokenHash !== hashToken(input.code)) {
    await OtpToken.updateOne({ _id: token._id }, { $inc: { attempts: 1 } });
    throw new AppError(400, 'Invalid or expired verification code', 'INVALID_OTP');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    },
  );
  await OtpToken.updateOne({ _id: token._id }, { $set: { usedAt: new Date() } });
  await Session.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  await recordAudit(req, {
    action: 'AUTH_PASSWORD_RESET',
    entityType: 'User',
    entityId: String(user._id),
    entityLabel: user.email,
    actorId: String(user._id),
    actorRole: user.role,
  });
}

export async function verifyOtp(
  input: { identifier: string; code: string; purpose: 'RESET_PASSWORD' | 'VERIFY_CONTACT' },
) {
  const user = await findByIdentifier(input.identifier);
  if (!user) throw new AppError(400, 'Invalid or expired verification code', 'INVALID_OTP');

  const token = await OtpToken.findOne({
    user: user._id,
    purpose: input.purpose,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!token || token.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(400, 'Invalid or expired verification code', 'INVALID_OTP');
  }
  if (token.tokenHash !== hashToken(input.code)) {
    await OtpToken.updateOne({ _id: token._id }, { $inc: { attempts: 1 } });
    throw new AppError(400, 'Invalid or expired verification code', 'INVALID_OTP');
  }
  return { valid: true };
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  req: Request,
) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) throw new AppError(400, 'Current password is incorrect', 'INVALID_PASSWORD');

  user.passwordHash = await bcrypt.hash(input.newPassword, 12);
  user.passwordChangedAt = new Date();
  await user.save();

  await Session.updateMany(
    { user: user._id, _id: { $ne: req.sessionId }, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  await recordAudit(req, {
    action: 'AUTH_PASSWORD_CHANGED',
    entityType: 'User',
    entityId: String(user._id),
    entityLabel: user.email,
  });
}

export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    mobile?: string;
    designation?: string;
    citizenProfile?: { address?: string; tehsil?: string; language?: string };
  },
  req: Request,
) {
  if (input.mobile) {
    const exists = await User.findOne({ mobile: input.mobile, _id: { $ne: userId } })
      .select('_id')
      .lean();
    if (exists) throw new AppError(409, 'Mobile number is already in use', 'DUPLICATE');
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.mobile ? { mobile: input.mobile } : {}),
        ...(input.designation !== undefined ? { designation: input.designation } : {}),
        ...(input.citizenProfile ? { citizenProfile: input.citizenProfile } : {}),
      },
    },
    { new: true, runValidators: true },
  )
    .populate('department', 'name code')
    .lean();

  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

  await recordAudit(req, {
    action: 'PROFILE_UPDATED',
    entityType: 'User',
    entityId: userId,
    entityLabel: user.email,
    after: { name: user.name, mobile: user.mobile, designation: user.designation },
  });

  return toPublicUser(user);
}

export async function updatePreferences(
  userId: string,
  input: Record<string, unknown>,
) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: Object.fromEntries(Object.entries(input).map(([key, value]) => [`preferences.${key}`, value])) },
    { new: true },
  ).lean();
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  return { preferences: user.preferences };
}
