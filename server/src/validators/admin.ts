import { z } from 'zod';
import {
  CONFIDENTIALITY_LEVELS,
  PERMISSIONS,
  PRIORITIES,
  ROLES,
  USER_STATUSES,
} from '../config/constants';
import { objectId, optionalObjectId, paginationQuery } from './common';

const email = z.string().trim().toLowerCase().email().max(200);
const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10 digit mobile number');
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/\d/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol');

export const userListQuery = paginationQuery.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  department: optionalObjectId,
  office: optionalObjectId,
});

export const orgListQuery = z.object({
  includeInactive: z.enum(['true', 'false']).optional(),
  department: optionalObjectId,
});

export const roleKeyParam = z.object({ key: z.enum(ROLES) });

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  mobile,
  password,
  role: z.enum(ROLES),
  department: optionalObjectId,
  office: optionalObjectId,
  tehsil: optionalObjectId,
  designation: z.string().trim().max(120).optional(),
  status: z.enum(USER_STATUSES).default('ACTIVE'),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: email.optional(),
  mobile: mobile.optional(),
  department: optionalObjectId,
  office: optionalObjectId,
  tehsil: optionalObjectId,
  designation: z.string().trim().max(120).optional(),
});

export const userStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export const userRoleSchema = z.object({
  role: z.enum(ROLES),
  department: optionalObjectId,
  designation: z.string().trim().max(120).optional(),
});

export const adminResetPasswordSchema = z.object({
  password,
  reason: z.string().trim().max(500).optional(),
});

export const jobNameParam = z.object({
  name: z.enum(['sla-monitor', 'task-deadline', 'weather-expiry', 'retention-archival']),
});

export const rolePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphen or underscore'),
  description: z.string().trim().max(500).optional(),
  head: optionalObjectId,
  contactEmail: email.optional().or(z.literal('')),
  contactPhone: z.string().trim().max(20).optional(),
  active: z.boolean().optional(),
});

export const administrativeUnitSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(['TEHSIL', 'BLOCK', 'WARD', 'VILLAGE']).optional(),
  active: z.boolean().optional(),
});

export const officeSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/),
  department: objectId,
  tehsil: optionalObjectId,
  address: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
});

export const districtConfigSchema = z.object({
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  contactEmail: email.optional().or(z.literal('')),
  contactPhone: z.string().trim().max(20).optional(),
  timezone: z.string().trim().max(60).optional(),
  workingDays: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])).optional(),
  holidays: z.array(z.coerce.date()).max(200).optional(),
  locale: z.enum(['en', 'hi']).optional(),
});

export const applicationTypeSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
  department: objectId,
  description: z.string().trim().max(2000).optional(),
  requiredDocuments: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(60),
        label: z.string().trim().min(1).max(120),
        required: z.boolean().default(true),
      }),
    )
    .max(30)
    .optional(),
  formFieldSchema: z.record(z.string(), z.unknown()).optional(),
  slaRule: optionalObjectId,
  active: z.boolean().optional(),
});

export const grievanceCategorySchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
  parent: optionalObjectId,
  defaultDepartment: optionalObjectId,
  defaultPriority: z.enum(PRIORITIES).optional(),
  aiKeywords: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  requiredEvidence: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  active: z.boolean().optional(),
});

export const routingRuleSchema = z.object({
  category: objectId,
  subcategory: optionalObjectId,
  department: objectId,
  office: optionalObjectId,
  priority: z.enum(PRIORITIES).optional(),
  active: z.boolean().optional(),
});

export const slaRuleSchema = z.object({
  entityType: z.enum(['GRIEVANCE', 'FILE', 'APPLICATION', 'TASK']),
  category: optionalObjectId,
  name: z.string().trim().min(2).max(120),
  priority: z.enum(PRIORITIES),
  responseHours: z.coerce.number().int().min(1).max(8760),
  resolutionHours: z.coerce.number().int().min(1).max(8760),
  dueSoonHours: z.coerce.number().int().min(1).max(720).optional(),
  escalationHours: z.array(z.coerce.number().int().min(1).max(8760)).length(3).optional(),
  pauseAllowed: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const fileCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
  defaultDepartment: optionalObjectId,
  defaultConfidentiality: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  active: z.boolean().optional(),
});

export const movementRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  fromRole: z.enum(ROLES),
  toRole: z.enum(ROLES),
  requiresApproval: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const retentionRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  entityType: z.enum(['FILE', 'GRIEVANCE', 'APPLICATION']),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  retentionDays: z.coerce.number().int().min(1).max(36500),
  archiveAfterDays: z.coerce.number().int().min(1).max(36500).optional(),
  active: z.boolean().optional(),
});

export const settingSchema = z.object({
  value: z.unknown(),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
});

export const integrationSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  provider: z.string().trim().max(120).optional(),
  status: z.enum(['NOT_CONFIGURED', 'CONFIGURED', 'TESTED', 'ACTIVE', 'DISABLED']).optional(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const auditListQuery = paginationQuery.extend({
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(60).optional(),
  actor: optionalObjectId,
  status: z.enum(['SUCCESS', 'FAILURE']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const knowledgeArticleSchema = z.object({
  title: z.string().trim().min(5).max(250),
  slug: z.string().trim().min(3).max(250).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens'),
  locale: z.enum(['en', 'hi', 'hinglish']).optional(),
  category: z.string().trim().max(120).optional(),
  content: z.string().trim().min(20).max(20000),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
});

export const notificationTemplateSchema = z.object({
  key: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(150),
  channel: z.enum(['IN_APP', 'EMAIL', 'SMS']),
  locale: z.enum(['en', 'hi', 'hinglish']).optional(),
  subject: z.string().trim().max(250).optional(),
  body: z.string().trim().min(5).max(5000),
  variables: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  active: z.boolean().optional(),
});
