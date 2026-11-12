import type { Request, Response } from 'express';
import { created, noContent, ok } from '../utils/response';
import {
  approveArticle,
  archiveArticle,
  assignUserRole,
  createApplicationType,
  createDepartment,
  createGrievanceCategory,
  createOffice,
  createUnit,
  createUser,
  deleteArticle,
  getDistrictConfig,
  getUser,
  listApplicationTypes,
  listArticles,
  listAuditLogs,
  listDepartments,
  listFileCategories,
  listGrievanceCategories,
  listIntegrations,
  listJobRuns,
  listMovementRules,
  listOffices,
  listPermissions,
  listRetentionRules,
  listRoles,
  listRoutingRules,
  listSettings,
  listSlaRules,
  listTemplates,
  listUnits,
  listUsers,
  resetUserPassword,
  runJobManually,
  saveArticle,
  saveFileCategory,
  saveMovementRule,
  saveRetentionRule,
  saveRoutingRule,
  saveSlaRule,
  saveTemplate,
  setUserStatus,
  testIntegration,
  updateApplicationType,
  updateDepartment,
  updateDistrictConfig,
  updateGrievanceCategory,
  updateIntegration,
  updateOffice,
  updateRolePermissions,
  updateUnit,
  updateUser,
  upsertSetting,
} from '../services/admin.service';
import type { Role } from '../config/constants';
import type { JobName } from '../services/job.service';

function params(req: Request): Record<string, string> {
  return (req.validatedParams ?? {}) as Record<string, string>;
}

function query(req: Request): Record<string, unknown> {
  return (req.validatedQuery ?? {}) as Record<string, unknown>;
}

function truthy(value: unknown): boolean {
  return value === 'true' || value === true;
}

/* --------------------------------- users ---------------------------------- */

export async function usersController(req: Request, res: Response): Promise<void> {
  const result = await listUsers(req);
  ok(res, result.items, result.meta);
}

export async function userDetailController(req: Request, res: Response): Promise<void> {
  ok(res, await getUser(params(req).id));
}

export async function createUserController(req: Request, res: Response): Promise<void> {
  created(res, await createUser(req.body, req));
}

export async function updateUserController(req: Request, res: Response): Promise<void> {
  ok(res, await updateUser(params(req).id, req.body, req));
}

export async function userStatusController(req: Request, res: Response): Promise<void> {
  ok(res, await setUserStatus(params(req).id, req.body, req));
}

export async function userRoleController(req: Request, res: Response): Promise<void> {
  ok(res, await assignUserRole(params(req).id, { ...req.body, role: req.body.role as Role }, req));
}

export async function userResetPasswordController(req: Request, res: Response): Promise<void> {
  ok(res, await resetUserPassword(params(req).id, req.body, req));
}

/* --------------------------------- roles ---------------------------------- */

export async function rolesController(_req: Request, res: Response): Promise<void> {
  ok(res, await listRoles());
}

export async function permissionsController(_req: Request, res: Response): Promise<void> {
  ok(res, await listPermissions());
}

export async function rolePermissionsController(req: Request, res: Response): Promise<void> {
  ok(
    res,
    await updateRolePermissions(params(req).key as Role, req.body.permissions as string[], req),
  );
}

/* ----------------------------------- org ---------------------------------- */

export async function departmentsController(req: Request, res: Response): Promise<void> {
  ok(res, await listDepartments(truthy(query(req).includeInactive)));
}

export async function createDepartmentController(req: Request, res: Response): Promise<void> {
  created(res, await createDepartment(req.body, req));
}

export async function updateDepartmentController(req: Request, res: Response): Promise<void> {
  ok(res, await updateDepartment(params(req).id, req.body, req));
}

export async function deactivateDepartmentController(req: Request, res: Response): Promise<void> {
  ok(res, await updateDepartment(params(req).id, { active: false }, req));
}

export async function unitsController(req: Request, res: Response): Promise<void> {
  ok(res, await listUnits(truthy(query(req).includeInactive)));
}

export async function createUnitController(req: Request, res: Response): Promise<void> {
  created(res, await createUnit(req.body, req));
}

export async function updateUnitController(req: Request, res: Response): Promise<void> {
  ok(res, await updateUnit(params(req).id, req.body, req));
}

export async function deactivateUnitController(req: Request, res: Response): Promise<void> {
  ok(res, await updateUnit(params(req).id, { active: false }, req));
}

export async function officesController(req: Request, res: Response): Promise<void> {
  ok(res, await listOffices({ department: query(req).department as string | undefined }, truthy(query(req).includeInactive)));
}

export async function createOfficeController(req: Request, res: Response): Promise<void> {
  created(res, await createOffice(req.body, req));
}

export async function updateOfficeController(req: Request, res: Response): Promise<void> {
  ok(res, await updateOffice(params(req).id, req.body, req));
}

export async function deactivateOfficeController(req: Request, res: Response): Promise<void> {
  ok(res, await updateOffice(params(req).id, { active: false }, req));
}

export async function districtConfigController(_req: Request, res: Response): Promise<void> {
  ok(res, await getDistrictConfig());
}

export async function updateDistrictConfigController(req: Request, res: Response): Promise<void> {
  ok(res, await updateDistrictConfig(req.body, req));
}

/* ------------------------------ applications ------------------------------ */

export async function applicationTypesController(req: Request, res: Response): Promise<void> {
  ok(res, await listApplicationTypes(truthy(query(req).includeInactive)));
}

export async function createApplicationTypeController(req: Request, res: Response): Promise<void> {
  created(res, await createApplicationType(req.body, req));
}

export async function updateApplicationTypeController(req: Request, res: Response): Promise<void> {
  ok(res, await updateApplicationType(params(req).id, req.body, req));
}

export async function deactivateApplicationTypeController(req: Request, res: Response): Promise<void> {
  ok(res, await updateApplicationType(params(req).id, { active: false }, req));
}

/* ---------------------------- grievance config ---------------------------- */

export async function grievanceCategoriesController(req: Request, res: Response): Promise<void> {
  ok(res, await listGrievanceCategories(truthy(query(req).includeInactive)));
}

export async function createGrievanceCategoryController(req: Request, res: Response): Promise<void> {
  created(res, await createGrievanceCategory(req.body, req));
}

export async function updateGrievanceCategoryController(req: Request, res: Response): Promise<void> {
  ok(res, await updateGrievanceCategory(params(req).id, req.body, req));
}

export async function deactivateGrievanceCategoryController(req: Request, res: Response): Promise<void> {
  ok(res, await updateGrievanceCategory(params(req).id, { active: false }, req));
}

export async function routingRulesController(_req: Request, res: Response): Promise<void> {
  ok(res, await listRoutingRules());
}

export async function createRoutingRuleController(req: Request, res: Response): Promise<void> {
  created(res, await saveRoutingRule(req.body, req));
}

export async function updateRoutingRuleController(req: Request, res: Response): Promise<void> {
  ok(res, await saveRoutingRule(req.body, req, params(req).id));
}

export async function slaRulesController(_req: Request, res: Response): Promise<void> {
  ok(res, await listSlaRules());
}

export async function createSlaRuleController(req: Request, res: Response): Promise<void> {
  created(res, await saveSlaRule(req.body, req));
}

export async function updateSlaRuleController(req: Request, res: Response): Promise<void> {
  ok(res, await saveSlaRule(req.body, req, params(req).id));
}

/* ------------------------------ file config ------------------------------- */

export async function fileCategoriesController(req: Request, res: Response): Promise<void> {
  ok(res, await listFileCategories(truthy(query(req).includeInactive)));
}

export async function createFileCategoryController(req: Request, res: Response): Promise<void> {
  created(res, await saveFileCategory(req.body, req));
}

export async function updateFileCategoryController(req: Request, res: Response): Promise<void> {
  ok(res, await saveFileCategory(req.body, req, params(req).id));
}

export async function deactivateFileCategoryController(req: Request, res: Response): Promise<void> {
  ok(res, await saveFileCategory({ ...req.body, active: false }, req, params(req).id));
}

export async function movementRulesController(_req: Request, res: Response): Promise<void> {
  ok(res, await listMovementRules());
}

export async function createMovementRuleController(req: Request, res: Response): Promise<void> {
  created(res, await saveMovementRule(req.body, req));
}

export async function updateMovementRuleController(req: Request, res: Response): Promise<void> {
  ok(res, await saveMovementRule(req.body, req, params(req).id));
}

export async function retentionRulesController(_req: Request, res: Response): Promise<void> {
  ok(res, await listRetentionRules());
}

export async function createRetentionRuleController(req: Request, res: Response): Promise<void> {
  created(res, await saveRetentionRule(req.body, req));
}

export async function updateRetentionRuleController(req: Request, res: Response): Promise<void> {
  ok(res, await saveRetentionRule(req.body, req, params(req).id));
}

/* -------------------------- settings & integrations ----------------------- */

export async function settingsController(_req: Request, res: Response): Promise<void> {
  ok(res, await listSettings());
}

export async function updateSettingController(req: Request, res: Response): Promise<void> {
  ok(res, await upsertSetting(params(req).key, req.body, req));
}

export async function integrationsController(_req: Request, res: Response): Promise<void> {
  ok(res, await listIntegrations());
}

export async function updateIntegrationController(req: Request, res: Response): Promise<void> {
  ok(res, await updateIntegration(params(req).key, req.body, req));
}

export async function testIntegrationController(req: Request, res: Response): Promise<void> {
  ok(res, await testIntegration(params(req).key, req));
}

/* --------------------------------- audit ---------------------------------- */

export async function auditController(req: Request, res: Response): Promise<void> {
  const result = await listAuditLogs(req);
  ok(res, result.items, result.meta);
}

export async function jobRunsController(_req: Request, res: Response): Promise<void> {
  ok(res, await listJobRuns());
}

export async function runJobController(req: Request, res: Response): Promise<void> {
  const { name } = params(req) as { name: JobName };
  ok(res, await runJobManually(name, req));
}

/* ------------------------------- templates -------------------------------- */

export async function templatesController(_req: Request, res: Response): Promise<void> {
  ok(res, await listTemplates());
}

export async function createTemplateController(req: Request, res: Response): Promise<void> {
  created(res, await saveTemplate(req.body, req));
}

export async function updateTemplateController(req: Request, res: Response): Promise<void> {
  ok(res, await saveTemplate(req.body, req, params(req).id));
}

/* ------------------------------ knowledge base ---------------------------- */

export async function knowledgeController(_req: Request, res: Response): Promise<void> {
  ok(res, await listArticles());
}

export async function createKnowledgeController(req: Request, res: Response): Promise<void> {
  created(res, await saveArticle(req.body, req));
}

export async function updateKnowledgeController(req: Request, res: Response): Promise<void> {
  ok(res, await saveArticle(req.body, req, params(req).id));
}

export async function approveKnowledgeController(req: Request, res: Response): Promise<void> {
  ok(res, await approveArticle(params(req).id, req));
}

export async function archiveKnowledgeController(req: Request, res: Response): Promise<void> {
  ok(res, await archiveArticle(params(req).id, req));
}

export async function deleteKnowledgeController(req: Request, res: Response): Promise<void> {
  await deleteArticle(params(req).id, req);
  noContent(res);
}
