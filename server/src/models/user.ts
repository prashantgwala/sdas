import bcrypt from 'bcryptjs';
import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ROLES, USER_STATUSES } from '../config/constants';

const preferencesSchema = new Schema(
  {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
    layout: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
    sidebarCollapsed: { type: Boolean, default: false },
    language: { type: String, enum: ['en', 'hi', 'hinglish'], default: 'en' },
  },
  { _id: false },
);

const citizenProfileSchema = new Schema(
  {
    address: { type: String, trim: true, maxlength: 500 },
    tehsil: { type: String, trim: true, maxlength: 120 },
    language: { type: String, enum: ['en', 'hi', 'hinglish'], default: 'en' },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    mobile: { type: String, required: true, unique: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    office: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    tehsil: { type: Schema.Types.ObjectId, ref: 'AdministrativeUnit', default: null },
    designation: { type: String, trim: true, maxlength: 120 },
    status: { type: String, enum: USER_STATUSES, default: 'ACTIVE', index: true },
    citizenProfile: { type: citizenProfileSchema, default: () => ({}) },
    preferences: { type: preferencesSchema, default: () => ({}) },
    lastLoginAt: { type: Date },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    passwordChangedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, department: 1, status: 1 });
userSchema.index({ name: 'text', email: 'text' });

userSchema.methods.setPassword = async function setPassword(password: string) {
  this.passwordHash = await bcrypt.hash(password, 12);
  this.passwordChangedAt = new Date();
};

userSchema.methods.comparePassword = function comparePassword(password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);

const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, maxlength: 500 },
    ip: { type: String, maxlength: 80 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1, revokedAt: 1 });
export const Session = model('Session', sessionSchema);

const otpTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: {
      type: String,
      enum: ['RESET_PASSWORD', 'VERIFY_CONTACT', 'LOGIN'],
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true },
    channel: { type: String, enum: ['email', 'sms'], default: 'email' },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date },
  },
  { timestamps: true },
);
otpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpTokenSchema.index({ user: 1, purpose: 1, createdAt: -1 });
export const OtpToken = model('OtpToken', otpTokenSchema);

const loginAttemptSchema = new Schema(
  {
    identifier: { type: String, required: true, index: true },
    ip: { type: String, maxlength: 80 },
    userAgent: { type: String, maxlength: 500 },
    success: { type: Boolean, required: true },
    reason: { type: String, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
loginAttemptSchema.index({ identifier: 1, createdAt: -1 });
export const LoginAttempt = model('LoginAttempt', loginAttemptSchema);
