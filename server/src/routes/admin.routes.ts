import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam, keyParam } from '../validators/common';
import {
  administrativeUnitSchema,
  applicationTypeSchema,
  auditListQuery,
  createUserSchema,
  departmentSchema,
  districtConfigSchema,
  fileCategorySchema,
  grievanceCategorySchema,
  integrationSchema,
  jobNameParam,
  knowledgeArticleSchema,
  movementRuleSchema,
  notificationTemplateSchema,
  officeSchema,
  orgListQuery,
  retentionRuleSchema,
  roleKeyParam,
  rolePermissionsSchema,
  routingRuleSchema,
  settingSchema,
  slaRuleSchema,
  updateUserSchema,
  userListQuery,
  userRoleSchema,
  userStatusSchema,
  adminResetPasswordSchema,
} from '../validators/admin';
import {
  applicationTypesController,
  approveKnowledgeController,
  archiveKnowledgeController,
  auditController,
  createApplicationTypeController,
  createDepartmentController,
  createFileCategoryController,
  createGrievanceCategoryController,
  createKnowledgeController,
  createMovementRuleController,
  createOfficeController,
  createRetentionRuleController,
  createRoutingRuleController,
  createSlaRuleController,
  createTemplateController,
  createUnitController,
  createUserController,
  deactivateApplicationTypeController,
  deactivateDepartmentController,
  deactivateFileCategoryController,
  deactivateGrievanceCategoryController,
  deactivateOfficeController,
  deactivateUnitController,
  deleteKnowledgeController,
  departmentsController,
  districtConfigController,
  fileCategoriesController,
  grievanceCategoriesController,
  integrationsController,
  jobRunsController,
  knowledgeController,
  movementRulesController,
  officesController,
  permissionsController,
  retentionRulesController,
  rolePermissionsController,
  rolesController,
  routingRulesController,
  runJobController,
  settingsController,
  slaRulesController,
  templatesController,
  testIntegrationController,
  unitsController,
  updateApplicationTypeController,
  updateDepartmentController,
  updateDistrictConfigController,
  updateFileCategoryController,
  updateGrievanceCategoryController,
  updateIntegrationController,
  updateKnowledgeController,
  updateMovementRuleController,
  updateOfficeController,
  updateRetentionRuleController,
  updateRoutingRuleController,
  updateSettingController,
  updateSlaRuleController,
  updateTemplateController,
  updateUnitController,
  updateUserController,
  userDetailController,
  userResetPasswordController,
  userRoleController,
  usersController,
  userStatusController,
} from '../controllers/admin.controller';

export const adminRouter = Router();

adminRouter.use(authenticate);

/* ---------------------------------- users --------------------------------- */
adminRouter.get(
  '/users',
  requirePermission('user.read'),
  validate({ query: userListQuery }),
  asyncHandler(usersController),
);
adminRouter.post(
  '/users',
  requirePermission('user.create'),
  validate({ body: createUserSchema }),
  asyncHandler(createUserController),
);
adminRouter.get(
  '/users/:id',
  requirePermission('user.read'),
  validate({ params: idParam }),
  asyncHandler(userDetailController),
);
adminRouter.patch(
  '/users/:id',
  requirePermission('user.update'),
  validate({ params: idParam, body: updateUserSchema }),
  asyncHandler(updateUserController),
);
adminRouter.post(
  '/users/:id/status',
  requirePermission('user.activate'),
  validate({ params: idParam, body: userStatusSchema }),
  asyncHandler(userStatusController),
);
adminRouter.post(
  '/users/:id/role',
  requirePermission('user.role.assign'),
  validate({ params: idParam, body: userRoleSchema }),
  asyncHandler(userRoleController),
);
adminRouter.post(
  '/users/:id/reset-password',
  requirePermission('user.update'),
  validate({ params: idParam, body: adminResetPasswordSchema }),
  asyncHandler(userResetPasswordController),
);

/* ---------------------------------- roles --------------------------------- */
adminRouter.get('/roles', requirePermission('role.read'), asyncHandler(rolesController));
adminRouter.get('/permissions', requirePermission('role.read'), asyncHandler(permissionsController));
adminRouter.patch(
  '/roles/:key/permissions',
  requirePermission('role.permission.manage'),
  validate({ params: roleKeyParam, body: rolePermissionsSchema }),
  asyncHandler(rolePermissionsController),
);

/* ----------------------------------- org ---------------------------------- */
adminRouter.get(
  '/departments',
  requirePermission('org.manage'),
  validate({ query: orgListQuery }),
  asyncHandler(departmentsController),
);
adminRouter.post(
  '/departments',
  requirePermission('org.manage'),
  validate({ body: departmentSchema }),
  asyncHandler(createDepartmentController),
);
adminRouter.patch(
  '/departments/:id',
  requirePermission('org.manage'),
  validate({ params: idParam, body: departmentSchema.partial() }),
  asyncHandler(updateDepartmentController),
);
adminRouter.delete(
  '/departments/:id',
  requirePermission('org.manage'),
  validate({ params: idParam }),
  asyncHandler(deactivateDepartmentController),
);

adminRouter.get(
  '/units',
  requirePermission('org.manage'),
  validate({ query: orgListQuery }),
  asyncHandler(unitsController),
);
adminRouter.post(
  '/units',
  requirePermission('org.manage'),
  validate({ body: administrativeUnitSchema }),
  asyncHandler(createUnitController),
);
adminRouter.patch(
  '/units/:id',
  requirePermission('org.manage'),
  validate({ params: idParam, body: administrativeUnitSchema.partial() }),
  asyncHandler(updateUnitController),
);
adminRouter.delete(
  '/units/:id',
  requirePermission('org.manage'),
  validate({ params: idParam }),
  asyncHandler(deactivateUnitController),
);

adminRouter.get(
  '/offices',
  requirePermission('org.manage'),
  validate({ query: orgListQuery }),
  asyncHandler(officesController),
);
adminRouter.post(
  '/offices',
  requirePermission('org.manage'),
  validate({ body: officeSchema }),
  asyncHandler(createOfficeController),
);
adminRouter.patch(
  '/offices/:id',
  requirePermission('org.manage'),
  validate({ params: idParam, body: officeSchema.partial() }),
  asyncHandler(updateOfficeController),
);
adminRouter.delete(
  '/offices/:id',
  requirePermission('org.manage'),
  validate({ params: idParam }),
  asyncHandler(deactivateOfficeController),
);

adminRouter.get('/district-config', requirePermission('org.manage'), asyncHandler(districtConfigController));
adminRouter.put(
  '/district-config',
  requirePermission('org.manage'),
  validate({ body: districtConfigSchema }),
  asyncHandler(updateDistrictConfigController),
);

/* ------------------------------ applications ------------------------------ */
adminRouter.get(
  '/application-types',
  requirePermission('application.config'),
  validate({ query: orgListQuery }),
  asyncHandler(applicationTypesController),
);
adminRouter.post(
  '/application-types',
  requirePermission('application.config'),
  validate({ body: applicationTypeSchema }),
  asyncHandler(createApplicationTypeController),
);
adminRouter.patch(
  '/application-types/:id',
  requirePermission('application.config'),
  validate({ params: idParam, body: applicationTypeSchema.partial() }),
  asyncHandler(updateApplicationTypeController),
);
adminRouter.delete(
  '/application-types/:id',
  requirePermission('application.config'),
  validate({ params: idParam }),
  asyncHandler(deactivateApplicationTypeController),
);

/* ---------------------------- grievance config ---------------------------- */
adminRouter.get(
  '/grievance-categories',
  requirePermission('config.grievance'),
  validate({ query: orgListQuery }),
  asyncHandler(grievanceCategoriesController),
);
adminRouter.post(
  '/grievance-categories',
  requirePermission('config.grievance'),
  validate({ body: grievanceCategorySchema }),
  asyncHandler(createGrievanceCategoryController),
);
adminRouter.patch(
  '/grievance-categories/:id',
  requirePermission('config.grievance'),
  validate({ params: idParam, body: grievanceCategorySchema.partial() }),
  asyncHandler(updateGrievanceCategoryController),
);
adminRouter.delete(
  '/grievance-categories/:id',
  requirePermission('config.grievance'),
  validate({ params: idParam }),
  asyncHandler(deactivateGrievanceCategoryController),
);

adminRouter.get('/routing-rules', requirePermission('config.grievance'), asyncHandler(routingRulesController));
adminRouter.post(
  '/routing-rules',
  requirePermission('config.grievance'),
  validate({ body: routingRuleSchema }),
  asyncHandler(createRoutingRuleController),
);
adminRouter.patch(
  '/routing-rules/:id',
  requirePermission('config.grievance'),
  validate({ params: idParam, body: routingRuleSchema }),
  asyncHandler(updateRoutingRuleController),
);

adminRouter.get('/sla-rules', requirePermission('config.grievance'), asyncHandler(slaRulesController));
adminRouter.post(
  '/sla-rules',
  requirePermission('config.grievance'),
  validate({ body: slaRuleSchema }),
  asyncHandler(createSlaRuleController),
);
adminRouter.patch(
  '/sla-rules/:id',
  requirePermission('config.grievance'),
  validate({ params: idParam, body: slaRuleSchema }),
  asyncHandler(updateSlaRuleController),
);

/* ------------------------------ file config ------------------------------- */
adminRouter.get(
  '/file-categories',
  requirePermission('config.file'),
  validate({ query: orgListQuery }),
  asyncHandler(fileCategoriesController),
);
adminRouter.post(
  '/file-categories',
  requirePermission('config.file'),
  validate({ body: fileCategorySchema }),
  asyncHandler(createFileCategoryController),
);
adminRouter.patch(
  '/file-categories/:id',
  requirePermission('config.file'),
  validate({ params: idParam, body: fileCategorySchema.partial() }),
  asyncHandler(updateFileCategoryController),
);
adminRouter.delete(
  '/file-categories/:id',
  requirePermission('config.file'),
  validate({ params: idParam }),
  asyncHandler(deactivateFileCategoryController),
);

adminRouter.get('/movement-rules', requirePermission('config.file'), asyncHandler(movementRulesController));
adminRouter.post(
  '/movement-rules',
  requirePermission('config.file'),
  validate({ body: movementRuleSchema }),
  asyncHandler(createMovementRuleController),
);
adminRouter.patch(
  '/movement-rules/:id',
  requirePermission('config.file'),
  validate({ params: idParam, body: movementRuleSchema }),
  asyncHandler(updateMovementRuleController),
);

adminRouter.get('/retention-rules', requirePermission('config.file'), asyncHandler(retentionRulesController));
adminRouter.post(
  '/retention-rules',
  requirePermission('config.file'),
  validate({ body: retentionRuleSchema }),
  asyncHandler(createRetentionRuleController),
);
adminRouter.patch(
  '/retention-rules/:id',
  requirePermission('config.file'),
  validate({ params: idParam, body: retentionRuleSchema }),
  asyncHandler(updateRetentionRuleController),
);

/* -------------------------- settings & integrations ----------------------- */
adminRouter.get('/settings', requirePermission('settings.manage'), asyncHandler(settingsController));
adminRouter.put(
  '/settings/:key',
  requirePermission('settings.manage'),
  validate({ params: keyParam, body: settingSchema }),
  asyncHandler(updateSettingController),
);

adminRouter.get('/integrations', requirePermission('integration.manage'), asyncHandler(integrationsController));
adminRouter.patch(
  '/integrations/:key',
  requirePermission('integration.manage'),
  validate({ params: keyParam, body: integrationSchema }),
  asyncHandler(updateIntegrationController),
);
adminRouter.post(
  '/integrations/:key/test',
  requirePermission('integration.manage'),
  validate({ params: keyParam }),
  asyncHandler(testIntegrationController),
);

/* --------------------------------- audit ---------------------------------- */
adminRouter.get(
  '/audit-logs',
  requirePermission('audit.read'),
  validate({ query: auditListQuery }),
  asyncHandler(auditController),
);
adminRouter.get('/job-runs', requirePermission('system.monitor'), asyncHandler(jobRunsController));
adminRouter.post(
  '/jobs/:name/run',
  requirePermission('system.monitor'),
  validate({ params: jobNameParam }),
  asyncHandler(runJobController),
);

/* ------------------------------- templates -------------------------------- */
adminRouter.get('/notification-templates', requirePermission('config.notification'), asyncHandler(templatesController));
adminRouter.post(
  '/notification-templates',
  requirePermission('config.notification'),
  validate({ body: notificationTemplateSchema }),
  asyncHandler(createTemplateController),
);
adminRouter.patch(
  '/notification-templates/:id',
  requirePermission('config.notification'),
  validate({ params: idParam, body: notificationTemplateSchema }),
  asyncHandler(updateTemplateController),
);

/* ------------------------------ knowledge base ---------------------------- */
adminRouter.get('/knowledge', requirePermission('chatbot.knowledge'), asyncHandler(knowledgeController));
adminRouter.post(
  '/knowledge',
  requirePermission('chatbot.knowledge'),
  validate({ body: knowledgeArticleSchema }),
  asyncHandler(createKnowledgeController),
);
adminRouter.patch(
  '/knowledge/:id',
  requirePermission('chatbot.knowledge'),
  validate({ params: idParam, body: knowledgeArticleSchema }),
  asyncHandler(updateKnowledgeController),
);
adminRouter.post(
  '/knowledge/:id/approve',
  requirePermission('chatbot.knowledge'),
  validate({ params: idParam }),
  asyncHandler(approveKnowledgeController),
);
adminRouter.post(
  '/knowledge/:id/archive',
  requirePermission('chatbot.knowledge'),
  validate({ params: idParam }),
  asyncHandler(archiveKnowledgeController),
);
adminRouter.delete(
  '/knowledge/:id',
  requirePermission('chatbot.knowledge'),
  validate({ params: idParam }),
  asyncHandler(deleteKnowledgeController),
);
