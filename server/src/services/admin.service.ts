import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_LABELS,
  ROLES,
  type Role,
} from '../config/constants';
import { User, Session } from '../models/user';
import { Permission, Role as RoleModel } from '../models/rbac';
import {
  AdministrativeUnit,
  Department,
  DistrictConfig,
  Office,
} from '../models/org';
import { ApplicationType } from '../models/application';
import { GrievanceCategory, RoutingRule, SLARule } from '../models/grievance';
import {
  FileCategory,
  MovementRule,
  RetentionRule,
} from '../models/file';
import {
  AuditLog,
  Integration,
  JobRun,
  KnowledgeArticle,
  SystemSetting,
} from '../models/platform';
import { NotificationTemplate } from '../models/notification';
import { AppError } from '../middleware/error';
import { recordAudit } from './audit.service';
import { invalidatePermissionCache } from './permission.service';
import { notifyUsers } from './notification.service';
import { encryptSecret } from '../utils/crypto';
import { env } from '../config/env';
import { isEmailConfigured, isSmsConfigured, verifyEmailConnection } from './mail.service';
import { runJobByName, type JobName } from './job.service';
import { invalidateSettingCache } from './setting.service';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type {
  administrativeUnitSchema,
  applicationTypeSchema,
  auditListQuery,
  createUserSchema,
  departmentSchema,
  districtConfigSchema,
  fileCategorySchema,
  grievanceCategorySchema,
  integrationSchema,
  knowledgeArticleSchema,
  movementRuleSchema,
  notificationTemplateSchema,
  officeSchema,
  retentionRuleSchema,
  routingRuleSchema,
  settingSchema,
  slaRuleSchema,
  userListQuery,
} from '../validators/admin';

type Input<T> = z.infer<T>;

function oid(value?: string | null): Types.ObjectId | null {
  return value ? new Types.ObjectId(value) : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function publicUser(user: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...user };
  delete clean.passwordHash;
  return clean;
}

/* ---------------------------------- users --------------------------------- */

export async function listUsers(req: Request) {
  const query = req.validatedQuery as Input<typeof userListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.department) filter.department = query.department;
  if (query.office) filter.office = query.office;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { mobile: pattern }, { designation: pattern }];
  }

  const sort = buildSort(query.sort, ['name', 'email', 'role', 'status', 'createdAt', 'lastLoginAt']);
  const [items, total] = await Promise.all([
    User.find(filter as never)
      .select('-passwordHash')
      .populate('department', 'name code')
      .populate('office', 'name code')
      .populate('tehsil', 'name code')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    User.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function getUser(id: string) {
  const user = await User.findById(id)
    .select('-passwordHash')
    .populate('department', 'name code')
    .populate('office', 'name code')
    .populate('tehsil', 'name code')
    .lean();
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  return user;
}

export async function createUser(input: Input<typeof createUserSchema>, req: Request) {
  const exists = await User.findOne({ $or: [{ email: input.email }, { mobile: input.mobile }] }).lean();
  if (exists) throw new AppError(409, 'A user with this email or mobile already exists', 'DUPLICATE');

  if (input.role !== 'CITIZEN' && !input.department) {
    throw new AppError(422, 'Department is required for staff accounts', 'VALIDATION_ERROR');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    name: input.name,
    email: input.email,
    mobile: input.mobile,
    passwordHash,
    role: input.role,
    department: oid(input.department),
    office: oid(input.office),
    tehsil: oid(input.tehsil),
    designation: input.designation,
    status: input.status,
    createdBy: oid(req.user!.id),
  });

  await notifyUsers([String(user._id)], {
    type: 'ACCOUNT_CREATED',
    title: 'Your SDAS account is ready',
    body: `An account was created for you as ${ROLE_LABELS[user.role as Role]}. Sign in and change your password after first use.`,
    link: '/login',
  });
  await recordAudit(req, {
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: String(user._id),
    entityLabel: user.email,
    after: { name: user.name, role: user.role, department: input.department ?? null },
  });

  return publicUser(user.toObject() as unknown as Record<string, unknown>);
}

export async function updateUser(
  id: string,
  input: Record<string, unknown>,
  req: Request,
) {
  const user = await User.findById(id);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

  if (input.email || input.mobile) {
    const clash = await User.findOne({
      _id: { $ne: user._id },
      $or: [
        ...(input.email ? [{ email: input.email }] : []),
        ...(input.mobile ? [{ mobile: input.mobile }] : []),
      ],
    }).lean();
    if (clash) throw new AppError(409, 'A user with this email or mobile already exists', 'DUPLICATE');
  }

  const before = { name: user.name, email: user.email, mobile: user.mobile, department: user.department, office: user.office, designation: user.designation };
  if (typeof input.name === 'string') user.name = input.name;
  if (typeof input.email === 'string') user.email = input.email;
  if (typeof input.mobile === 'string') user.mobile = input.mobile;
  if ('department' in input) user.department = oid(input.department as string);
  if ('office' in input) user.office = oid(input.office as string);
  if ('tehsil' in input) user.tehsil = oid(input.tehsil as string);
  if ('designation' in input) user.designation = input.designation as string;
  await user.save();

  await recordAudit(req, {
    action: 'USER_UPDATED',
    entityType: 'User',
    entityId: id,
    entityLabel: user.email,
    before,
    after: { name: user.name, email: user.email, mobile: user.mobile, department: user.department, office: user.office, designation: user.designation },
  });
  return publicUser(user.toObject() as unknown as Record<string, unknown>);
}

export async function setUserStatus(
  id: string,
  input: { status: string; reason?: string },
  req: Request,
) {
  if (id === req.user!.id && input.status !== 'ACTIVE') {
    throw new AppError(422, 'You cannot deactivate your own account', 'INVALID_OPERATION');
  }
  const user = await User.findById(id);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (user.role === 'SUPER_ADMIN' && input.status !== 'ACTIVE') {
    const activeAdmins = await User.countDocuments({ role: 'SUPER_ADMIN', status: 'ACTIVE' });
    if (activeAdmins <= 1) {
      throw new AppError(422, 'At least one active super admin is required', 'LAST_ADMIN');
    }
  }

  const before = user.status;
  user.status = input.status as typeof user.status;
  if (user.status !== 'ACTIVE') {
    await Session.updateMany({ user: user._id, revokedAt: null } as never, { $set: { revokedAt: new Date() } });
  }
  await user.save();

  await notifyUsers([String(user._id)], {
    type: 'SYSTEM',
    title: 'Account status updated',
    body: `Your account status is now ${user.status}${input.reason ? `. Reason: ${input.reason}` : ''}.`,
  });
  await recordAudit(req, {
    action: 'USER_STATUS_CHANGED',
    entityType: 'User',
    entityId: id,
    entityLabel: user.email,
    before: { status: before },
    after: { status: user.status, reason: input.reason },
  });
  return publicUser(user.toObject() as unknown as Record<string, unknown>);
}

export async function assignUserRole(
  id: string,
  input: { role: Role; department?: string; designation?: string },
  req: Request,
) {
  const user = await User.findById(id);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (id === req.user!.id && input.role !== user.role) {
    throw new AppError(422, 'You cannot change your own role', 'INVALID_OPERATION');
  }
  if (user.role === 'SUPER_ADMIN' && input.role !== 'SUPER_ADMIN') {
    const activeAdmins = await User.countDocuments({ role: 'SUPER_ADMIN', status: 'ACTIVE' });
    if (activeAdmins <= 1) {
      throw new AppError(422, 'At least one active super admin is required', 'LAST_ADMIN');
    }
  }
  if (input.role !== 'CITIZEN' && !input.department && !user.department) {
    throw new AppError(422, 'Department is required for staff accounts', 'VALIDATION_ERROR');
  }

  const before = { role: user.role, department: user.department };
  user.role = input.role;
  if (input.department) user.department = oid(input.department);
  if (input.designation !== undefined) user.designation = input.designation;
  await user.save();

  await notifyUsers([String(user._id)], {
    type: 'SYSTEM',
    title: 'Role updated',
    body: `Your role has been changed to ${ROLE_LABELS[input.role]}.`,
  });
  await recordAudit(req, {
    action: 'USER_ROLE_ASSIGNED',
    entityType: 'User',
    entityId: id,
    entityLabel: user.email,
    before,
    after: { role: user.role, department: user.department },
  });
  return publicUser(user.toObject() as unknown as Record<string, unknown>);
}

export async function resetUserPassword(
  id: string,
  input: { password: string; reason?: string },
  req: Request,
) {
  const user = await User.findById(id);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  user.passwordHash = await bcrypt.hash(input.password, 12);
  user.passwordChangedAt = new Date();
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  await user.save();
  await Session.updateMany({ user: user._id, revokedAt: null } as never, { $set: { revokedAt: new Date() } });
  await recordAudit(req, {
    action: 'USER_PASSWORD_RESET',
    entityType: 'User',
    entityId: id,
    entityLabel: user.email,
    after: { reason: input.reason },
  });
  return { message: 'Password reset and all sessions revoked' };
}

/* ---------------------------------- roles --------------------------------- */

export async function listRoles() {
  let roles = await RoleModel.find({}).lean();
  if (roles.length === 0) {
    roles = ROLES.map((key) => ({
      _id: undefined,
      key,
      name: ROLE_LABELS[key],
      description: '',
      permissions: ROLE_DEFAULT_PERMISSIONS[key],
      isSystem: true,
    })) as unknown as typeof roles;
  }
  return roles;
}

export async function listPermissions() {
  const stored = await Permission.find({}).lean();
  const byCode = new Map(stored.map((item) => [item.code, item]));
  return PERMISSIONS.map((code) => {
    const record = byCode.get(code);
    const [module] = code.split('.');
    return {
      code,
      module: record?.module ?? module,
      action: record?.action ?? code.split('.').slice(1).join('.'),
      description: record?.description ?? '',
    };
  });
}

export async function updateRolePermissions(
  key: Role,
  permissions: string[],
  req: Request,
) {
  const role = await RoleModel.findOne({ key });
  if (!role) throw new AppError(404, 'Role not found', 'NOT_FOUND');
  if (role.key === 'SUPER_ADMIN' && !permissions.includes('settings.manage')) {
    throw new AppError(422, 'Super admin must retain system settings access', 'INVALID_OPERATION');
  }
  const before = [...role.permissions];
  role.permissions = permissions as typeof role.permissions;
  role.updatedBy = new Types.ObjectId(req.user!.id);
  await role.save();
  invalidatePermissionCache(key);
  await recordAudit(req, {
    action: 'ROLE_PERMISSIONS_UPDATED',
    entityType: 'Role',
    entityId: String(role._id),
    entityLabel: key,
    before: { permissions: before },
    after: { permissions },
  });
  return role.toObject();
}

/* ----------------------------------- org ---------------------------------- */

export async function listDepartments(includeInactive = false) {
  return Department.find((includeInactive ? {} : { active: true }) as never)
    .populate('head', 'name email designation')
    .sort({ name: 1 })
    .lean();
}

export async function createDepartment(input: Input<typeof departmentSchema>, req: Request) {
  const department = await Department.create({
    name: input.name,
    code: input.code,
    description: input.description,
    head: oid(input.head),
    contactEmail: input.contactEmail || undefined,
    contactPhone: input.contactPhone,
    active: input.active ?? true,
  });
  await recordAudit(req, {
    action: 'DEPARTMENT_CREATED',
    entityType: 'Department',
    entityId: String(department._id),
    entityLabel: department.name,
    after: department.toObject(),
  });
  return department.toObject();
}

export async function updateDepartment(
  id: string,
  input: Partial<Input<typeof departmentSchema>>,
  req: Request,
) {
  const department = await Department.findById(id);
  if (!department) throw new AppError(404, 'Department not found', 'NOT_FOUND');
  const before = department.toObject();
  if (input.name !== undefined) department.name = input.name;
  if (input.code !== undefined) department.code = input.code;
  if (input.description !== undefined) department.description = input.description;
  if ('head' in input) department.head = oid(input.head);
  if (input.contactEmail !== undefined) department.contactEmail = input.contactEmail || undefined;
  if (input.contactPhone !== undefined) department.contactPhone = input.contactPhone;
  if (input.active !== undefined) department.active = input.active;
  await department.save();
  await recordAudit(req, {
    action: 'DEPARTMENT_UPDATED',
    entityType: 'Department',
    entityId: id,
    entityLabel: department.name,
    before,
    after: department.toObject(),
  });
  return department.toObject();
}

export async function listUnits(includeInactive = false) {
  return AdministrativeUnit.find((includeInactive ? {} : { active: true }) as never)
    .sort({ name: 1 })
    .lean();
}

export async function createUnit(input: Input<typeof administrativeUnitSchema>, req: Request) {
  const unit = await AdministrativeUnit.create({ ...input, code: input.code });
  await recordAudit(req, {
    action: 'UNIT_CREATED',
    entityType: 'AdministrativeUnit',
    entityId: String(unit._id),
    entityLabel: unit.name,
    after: unit.toObject(),
  });
  return unit.toObject();
}

export async function updateUnit(
  id: string,
  input: Partial<Input<typeof administrativeUnitSchema>>,
  req: Request,
) {
  const unit = await AdministrativeUnit.findById(id);
  if (!unit) throw new AppError(404, 'Administrative unit not found', 'NOT_FOUND');
  const before = unit.toObject();
  Object.assign(unit, input);
  await unit.save();
  await recordAudit(req, {
    action: 'UNIT_UPDATED',
    entityType: 'AdministrativeUnit',
    entityId: id,
    entityLabel: unit.name,
    before,
    after: unit.toObject(),
  });
  return unit.toObject();
}

export async function listOffices(filters: { department?: string }, includeInactive = false) {
  const query: Record<string, unknown> = {};
  if (!includeInactive) query.active = true;
  if (filters.department) query.department = filters.department;
  return Office.find(query as never)
    .populate('department', 'name code')
    .populate('tehsil', 'name code')
    .sort({ name: 1 })
    .lean();
}

export async function createOffice(input: Input<typeof officeSchema>, req: Request) {
  const office = await Office.create({
    ...input,
    department: new Types.ObjectId(input.department),
    tehsil: oid(input.tehsil),
    active: input.active ?? true,
  });
  await recordAudit(req, {
    action: 'OFFICE_CREATED',
    entityType: 'Office',
    entityId: String(office._id),
    entityLabel: office.name,
    after: office.toObject(),
  });
  return office.toObject();
}

export async function updateOffice(
  id: string,
  input: Partial<Input<typeof officeSchema>>,
  req: Request,
) {
  const office = await Office.findById(id);
  if (!office) throw new AppError(404, 'Office not found', 'NOT_FOUND');
  const before = office.toObject();
  if (input.name !== undefined) office.name = input.name;
  if (input.code !== undefined) office.code = input.code;
  if (input.department !== undefined) office.department = new Types.ObjectId(input.department);
  if ('tehsil' in input) office.tehsil = oid(input.tehsil);
  if (input.address !== undefined) office.address = input.address;
  if (input.active !== undefined) office.active = input.active;
  await office.save();
  await recordAudit(req, {
    action: 'OFFICE_UPDATED',
    entityType: 'Office',
    entityId: id,
    entityLabel: office.name,
    before,
    after: office.toObject(),
  });
  return office.toObject();
}

export async function getDistrictConfig() {
  const config = await DistrictConfig.findOne({ key: 'default' }).lean();
  if (!config) throw new AppError(404, 'District configuration not found', 'NOT_FOUND');
  return config;
}

export async function updateDistrictConfig(
  input: Input<typeof districtConfigSchema>,
  req: Request,
) {
  const before = await DistrictConfig.findOne({ key: 'default' }).lean();
  const config = await DistrictConfig.findOneAndUpdate(
    { key: 'default' },
    {
      $set: {
        ...input,
        key: 'default',
        contactEmail: input.contactEmail || undefined,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  await recordAudit(req, {
    action: 'DISTRICT_CONFIG_UPDATED',
    entityType: 'DistrictConfig',
    entityId: config?._id ? String(config._id) : null,
    entityLabel: input.name,
    before,
    after: input,
  });
  return config;
}

/* ------------------------------ applications ------------------------------ */

export async function listApplicationTypes(includeInactive = false) {
  return ApplicationType.find((includeInactive ? {} : { active: true }) as never)
    .populate('department', 'name code')
    .sort({ name: 1 })
    .lean();
}

export async function createApplicationType(
  input: Input<typeof applicationTypeSchema>,
  req: Request,
) {
  const type = await ApplicationType.create({
    ...input,
    department: new Types.ObjectId(input.department),
    slaRule: oid(input.slaRule),
    active: input.active ?? true,
  });
  await recordAudit(req, {
    action: 'APPLICATION_TYPE_CREATED',
    entityType: 'ApplicationType',
    entityId: String(type._id),
    entityLabel: type.name,
    after: type.toObject(),
  });
  return type.toObject();
}

export async function updateApplicationType(
  id: string,
  input: Partial<Input<typeof applicationTypeSchema>>,
  req: Request,
) {
  const type = await ApplicationType.findById(id);
  if (!type) throw new AppError(404, 'Application type not found', 'NOT_FOUND');
  const before = type.toObject();
  if (input.name !== undefined) type.name = input.name;
  if (input.code !== undefined) type.code = input.code;
  if (input.department !== undefined) type.department = new Types.ObjectId(input.department);
  if (input.description !== undefined) type.description = input.description;
  if (input.requiredDocuments !== undefined) type.requiredDocuments = input.requiredDocuments as never;
  if (input.formFieldSchema !== undefined) type.formFieldSchema = input.formFieldSchema;
  if ('slaRule' in input) type.slaRule = oid(input.slaRule);
  if (input.active !== undefined) type.active = input.active;
  await type.save();
  await recordAudit(req, {
    action: 'APPLICATION_TYPE_UPDATED',
    entityType: 'ApplicationType',
    entityId: id,
    entityLabel: type.name,
    before,
    after: type.toObject(),
  });
  return type.toObject();
}

/* --------------------------- grievance configuration ---------------------- */

export async function listGrievanceCategories(includeInactive = false) {
  return GrievanceCategory.find((includeInactive ? {} : { active: true }) as never)
    .populate('defaultDepartment', 'name code')
    .populate('parent', 'name code')
    .sort({ name: 1 })
    .lean();
}

export async function createGrievanceCategory(
  input: Input<typeof grievanceCategorySchema>,
  req: Request,
) {
  const category = await GrievanceCategory.create({
    ...input,
    parent: oid(input.parent),
    defaultDepartment: oid(input.defaultDepartment),
  });
  await recordAudit(req, {
    action: 'GRIEVANCE_CATEGORY_CREATED',
    entityType: 'GrievanceCategory',
    entityId: String(category._id),
    entityLabel: category.name,
    after: category.toObject(),
  });
  return category.toObject();
}

export async function updateGrievanceCategory(
  id: string,
  input: Partial<Input<typeof grievanceCategorySchema>>,
  req: Request,
) {
  const category = await GrievanceCategory.findById(id);
  if (!category) throw new AppError(404, 'Grievance category not found', 'NOT_FOUND');
  const before = category.toObject();
  if (input.name !== undefined) category.name = input.name;
  if (input.code !== undefined) category.code = input.code;
  if ('parent' in input) category.parent = oid(input.parent);
  if ('defaultDepartment' in input) category.defaultDepartment = oid(input.defaultDepartment);
  if (input.defaultPriority !== undefined) category.defaultPriority = input.defaultPriority;
  if (input.aiKeywords !== undefined) category.aiKeywords = input.aiKeywords;
  if (input.requiredEvidence !== undefined) category.requiredEvidence = input.requiredEvidence;
  if (input.active !== undefined) category.active = input.active;
  await category.save();
  await recordAudit(req, {
    action: 'GRIEVANCE_CATEGORY_UPDATED',
    entityType: 'GrievanceCategory',
    entityId: id,
    entityLabel: category.name,
    before,
    after: category.toObject(),
  });
  return category.toObject();
}

export async function listRoutingRules() {
  return RoutingRule.find({})
    .populate('category', 'name code')
    .populate('subcategory', 'name code')
    .populate('department', 'name code')
    .populate('office', 'name code')
    .sort({ createdAt: -1 })
    .lean();
}

export async function saveRoutingRule(
  input: Input<typeof routingRuleSchema>,
  req: Request,
  id?: string,
) {
  const values = {
    ...input,
    category: new Types.ObjectId(input.category),
    subcategory: oid(input.subcategory),
    department: new Types.ObjectId(input.department),
    office: oid(input.office),
  };
  const rule = id
    ? await RoutingRule.findByIdAndUpdate(id, { $set: values }, { new: true }).lean()
    : (await RoutingRule.create(values)).toObject();
  if (!rule) throw new AppError(404, 'Routing rule not found', 'NOT_FOUND');
  await recordAudit(req, {
    action: id ? 'ROUTING_RULE_UPDATED' : 'ROUTING_RULE_CREATED',
    entityType: 'RoutingRule',
    entityId: String(rule._id),
    entityLabel: `${input.category} → ${input.department}`,
    after: rule,
  });
  return rule;
}

export async function listSlaRules() {
  return SLARule.find({})
    .populate('category', 'name code')
    .sort({ entityType: 1, priority: 1 })
    .lean();
}

export async function saveSlaRule(
  input: Input<typeof slaRuleSchema>,
  req: Request,
  id?: string,
) {
  const values = {
    ...input,
    category: oid(input.category),
  };
  const rule = id
    ? await SLARule.findByIdAndUpdate(id, { $set: values }, { new: true }).lean()
    : (await SLARule.create(values)).toObject();
  if (!rule) throw new AppError(404, 'SLA rule not found', 'NOT_FOUND');
  await recordAudit(req, {
    action: id ? 'SLA_RULE_UPDATED' : 'SLA_RULE_CREATED',
    entityType: 'SLARule',
    entityId: String(rule._id),
    entityLabel: input.name,
    after: rule,
  });
  return rule;
}

/* ------------------------------ file configuration ------------------------ */

export async function listFileCategories(includeInactive = false) {
  return FileCategory.find((includeInactive ? {} : { active: true }) as never)
    .populate('defaultDepartment', 'name code')
    .sort({ name: 1 })
    .lean();
}

export async function saveFileCategory(
  input: Input<typeof fileCategorySchema>,
  req: Request,
  id?: string,
) {
  const values = {
    ...input,
    defaultDepartment: oid(input.defaultDepartment),
  };
  const category = id
    ? await FileCategory.findByIdAndUpdate(id, { $set: values }, { new: true }).lean()
    : (await FileCategory.create(values)).toObject();
  if (!category) throw new AppError(404, 'File category not found', 'NOT_FOUND');
  await recordAudit(req, {
    action: id ? 'FILE_CATEGORY_UPDATED' : 'FILE_CATEGORY_CREATED',
    entityType: 'FileCategory',
    entityId: String(category._id),
    entityLabel: input.name,
    after: category,
  });
  return category;
}

export async function listMovementRules() {
  return MovementRule.find({}).sort({ name: 1 }).lean();
}

export async function saveMovementRule(
  input: Input<typeof movementRuleSchema>,
  req: Request,
  id?: string,
) {
  const rule = id
    ? await MovementRule.findByIdAndUpdate(id, { $set: input }, { new: true }).lean()
    : (await MovementRule.create(input)).toObject();
  if (!rule) throw new AppError(404, 'Movement rule not found', 'NOT_FOUND');
  await recordAudit(req, {
    action: id ? 'MOVEMENT_RULE_UPDATED' : 'MOVEMENT_RULE_CREATED',
    entityType: 'MovementRule',
    entityId: String(rule._id),
    entityLabel: input.name,
    after: rule,
  });
  return rule;
}

export async function listRetentionRules() {
  return RetentionRule.find({}).sort({ name: 1 }).lean();
}

export async function saveRetentionRule(
  input: Input<typeof retentionRuleSchema>,
  req: Request,
  id?: string,
) {
  const rule = id
    ? await RetentionRule.findByIdAndUpdate(id, { $set: input }, { new: true }).lean()
    : (await RetentionRule.create(input)).toObject();
  if (!rule) throw new AppError(404, 'Retention rule not found', 'NOT_FOUND');
  await recordAudit(req, {
    action: id ? 'RETENTION_RULE_UPDATED' : 'RETENTION_RULE_CREATED',
    entityType: 'RetentionRule',
    entityId: String(rule._id),
    entityLabel: input.name,
    after: rule,
  });
  return rule;
}

/* -------------------------- settings & integrations ----------------------- */

export async function listSettings() {
  return SystemSetting.find({}).sort({ category: 1, key: 1 }).lean();
}

export async function upsertSetting(
  key: string,
  input: Input<typeof settingSchema>,
  req: Request,
) {
  const before = await SystemSetting.findOne({ key }).lean();
  const setting = await SystemSetting.findOneAndUpdate(
    { key },
    {
      $set: {
        value: input.value,
        category: input.category ?? before?.category ?? 'general',
        description: input.description ?? before?.description,
        updatedBy: new Types.ObjectId(req.user!.id),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  invalidateSettingCache();
  await recordAudit(req, {
    action: 'SETTING_UPDATED',
    entityType: 'SystemSetting',
    entityId: setting?._id ? String(setting._id) : null,
    entityLabel: key,
    before: before?.value,
    after: input.value,
  });
  return setting;
}

export async function listIntegrations() {
  return Integration.find({})
    .select('-encryptedConfig')
    .sort({ category: 1, name: 1 })
    .lean();
}

export async function updateIntegration(
  key: string,
  input: Input<typeof integrationSchema>,
  req: Request,
) {
  const integration = await Integration.findOne({ key });
  if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
  const before = {
    status: integration.status,
    provider: integration.provider,
    notes: integration.notes,
  };
  if (input.name !== undefined) integration.name = input.name;
  if (input.provider !== undefined) integration.provider = input.provider;
  if (input.notes !== undefined) integration.notes = input.notes;
  if (input.config !== undefined) {
    integration.encryptedConfig = Object.keys(input.config).length > 0 ? encryptSecret(JSON.stringify(input.config)) : '';
    if (integration.status !== 'ACTIVE') integration.status = 'CONFIGURED';
    integration.lastError = undefined;
  }
  if (input.status !== undefined) integration.status = input.status;
  integration.updatedBy = new Types.ObjectId(req.user!.id);
  await integration.save();
  await recordAudit(req, {
    action: 'INTEGRATION_UPDATED',
    entityType: 'Integration',
    entityId: String(integration._id),
    entityLabel: key,
    before,
    after: { status: integration.status, provider: integration.provider, notes: integration.notes },
  });
  const { encryptedConfig: _encrypted, ...safe } = integration.toObject();
  return safe;
}

export async function testIntegration(key: string, req: Request) {
  const integration = await Integration.findOne({ key });
  if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');

  let ok = false;
  let message = 'Provider is not configured. Add credentials and test again.';
  switch (integration.category) {
    case 'EMAIL':
      ok = isEmailConfigured() && (await verifyEmailConnection());
      message = ok ? 'SMTP connection verified' : 'SMTP is not configured or refused the connection';
      break;
    case 'SMS':
      ok = isSmsConfigured();
      message = ok ? 'SMS provider credentials are present' : 'SMS provider is not configured';
      break;
    case 'AI': {
      const provider = env.OPENROUTER_API_KEY ? 'OpenRouter' : env.OPENAI_API_KEY ? 'OpenAI' : null;
      ok = Boolean(provider);
      message = provider
        ? `${provider} provider key is present. Enable external AI in settings to activate.`
        : 'External AI provider key is missing. Local engine remains active.';
      break;
    }
    case 'OCR':
      ok = Boolean(env.OPENAI_API_KEY);
      message = ok
        ? 'OpenAI key is present for OCR processing. Verify a scanned document before enabling it.'
        : 'External OCR provider key is missing. Local PDF text extraction remains active.';
      break;
    case 'STORAGE':
      ok = true;
      message = 'Private local storage is available';
      break;
    case 'WEATHER':
    case 'GOVERNMENT':
      ok = integration.status === 'ACTIVE';
      message = ok ? 'Marked active by administrator' : 'No verified provider connection is available';
      break;
    default:
      break;
  }

  integration.lastTestAt = new Date();
  integration.lastError = ok ? undefined : message;
  if (ok && integration.status !== 'ACTIVE') integration.status = 'TESTED';
  if (!ok) integration.status = 'NOT_CONFIGURED';
  integration.updatedBy = new Types.ObjectId(req.user!.id);
  await integration.save();

  await recordAudit(req, {
    action: 'INTEGRATION_TESTED',
    entityType: 'Integration',
    entityId: String(integration._id),
    entityLabel: key,
    after: { ok, message },
    status: ok ? 'SUCCESS' : 'FAILURE',
  });
  return { ok, status: integration.status, message, testedAt: integration.lastTestAt };
}

/* --------------------------------- audit ---------------------------------- */

export async function listAuditLogs(req: Request) {
  const query = req.validatedQuery as Input<typeof auditListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.actor) filter.actor = query.actor;
  if (query.status) filter.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ action: pattern }, { entityLabel: pattern }, { entityType: pattern }];
  }
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter as never)
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    AuditLog.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function listJobRuns() {
  return JobRun.find({}).sort({ startedAt: -1 }).limit(50).lean();
}

export async function runJobManually(name: JobName, req: Request) {
  const stats = await runJobByName(name, 'MANUAL');
  await recordAudit(req, {
    action: 'JOB_TRIGGERED',
    entityType: 'JobRun',
    entityLabel: name,
    after: stats,
  });
  return { job: name, stats };
}

/* ------------------------------- templates -------------------------------- */

export async function listTemplates() {
  return NotificationTemplate.find({}).sort({ key: 1, channel: 1 }).lean();
}

export async function saveTemplate(
  input: Input<typeof notificationTemplateSchema>,
  req: Request,
  id?: string,
) {
  const template = id
    ? await NotificationTemplate.findByIdAndUpdate(id, { $set: input }, { new: true }).lean()
    : (await NotificationTemplate.create(input)).toObject();
  if (!template) throw new AppError(404, 'Notification template not found', 'NOT_FOUND');
  await recordAudit(req, {
    action: id ? 'NOTIFICATION_TEMPLATE_UPDATED' : 'NOTIFICATION_TEMPLATE_CREATED',
    entityType: 'NotificationTemplate',
    entityId: String(template._id),
    entityLabel: `${input.key}:${input.channel}`,
    after: template,
  });
  return template;
}

/* ------------------------------ knowledge base ---------------------------- */

export async function listArticles() {
  return KnowledgeArticle.find({}).sort({ updatedAt: -1 }).lean();
}

export async function saveArticle(
  input: Input<typeof knowledgeArticleSchema>,
  req: Request,
  id?: string,
) {
  const payload = {
    title: input.title,
    slug: input.slug,
    locale: input.locale ?? 'en',
    category: input.category,
    content: input.content,
    tags: input.tags ?? [],
    keywords: input.keywords ?? [],
  };
  const article = id
    ? await KnowledgeArticle.findByIdAndUpdate(id, { $set: payload }, { new: true }).lean()
    : (await KnowledgeArticle.create({ ...payload, status: 'DRAFT' })).toObject();
  if (!article) throw new AppError(404, 'Knowledge article not found', 'NOT_FOUND');
  await recordAudit(req, {
    action: id ? 'KNOWLEDGE_ARTICLE_UPDATED' : 'KNOWLEDGE_ARTICLE_CREATED',
    entityType: 'KnowledgeArticle',
    entityId: String(article._id),
    entityLabel: article.title,
    after: { title: article.title, locale: article.locale, status: article.status },
  });
  return article;
}

export async function approveArticle(id: string, req: Request) {
  const article = await KnowledgeArticle.findById(id);
  if (!article) throw new AppError(404, 'Knowledge article not found', 'NOT_FOUND');
  article.status = 'APPROVED';
  article.approvedBy = new Types.ObjectId(req.user!.id);
  article.approvedAt = new Date();
  await article.save();
  await recordAudit(req, {
    action: 'KNOWLEDGE_ARTICLE_APPROVED',
    entityType: 'KnowledgeArticle',
    entityId: id,
    entityLabel: article.title,
  });
  return article.toObject();
}

export async function archiveArticle(id: string, req: Request) {
  const article = await KnowledgeArticle.findById(id);
  if (!article) throw new AppError(404, 'Knowledge article not found', 'NOT_FOUND');
  article.status = 'ARCHIVED';
  await article.save();
  await recordAudit(req, {
    action: 'KNOWLEDGE_ARTICLE_ARCHIVED',
    entityType: 'KnowledgeArticle',
    entityId: id,
    entityLabel: article.title,
  });
  return article.toObject();
}

export async function deleteArticle(id: string, req: Request) {
  const article = await KnowledgeArticle.findByIdAndDelete(id);
  if (!article) throw new AppError(404, 'Knowledge article not found', 'NOT_FOUND');
  await recordAudit(req, {
    action: 'KNOWLEDGE_ARTICLE_DELETED',
    entityType: 'KnowledgeArticle',
    entityId: id,
    entityLabel: article.title,
  });
}
