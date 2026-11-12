import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam } from '../validators/common';
import {
  assignTeamSchema,
  closeIncidentSchema,
  createIncidentSchema,
  incidentActionSchema,
  incidentListQuery,
  incidentResourcesSchema,
  updateIncidentSchema,
  weatherAlertListQuery,
  weatherAlertSchema,
} from '../validators/disaster';
import {
  actionController,
  closeController,
  createController,
  createWeatherController,
  detailController,
  listController,
  resourcesController,
  teamController,
  updateController,
  updateWeatherController,
  weatherListController,
} from '../controllers/disaster.controller';

export const incidentRouter = Router();

incidentRouter.use(authenticate, requirePermission('incident.read'));

incidentRouter.get('/', validate({ query: incidentListQuery }), asyncHandler(listController));
incidentRouter.post(
  '/',
  requirePermission('incident.create'),
  validate({ body: createIncidentSchema }),
  asyncHandler(createController),
);
incidentRouter.get('/:id', validate({ params: idParam }), asyncHandler(detailController));
incidentRouter.patch(
  '/:id',
  requirePermission('incident.update'),
  validate({ params: idParam, body: updateIncidentSchema }),
  asyncHandler(updateController),
);
incidentRouter.post(
  '/:id/actions',
  requirePermission('incident.update'),
  validate({ params: idParam, body: incidentActionSchema }),
  asyncHandler(actionController),
);
incidentRouter.post(
  '/:id/resources',
  requirePermission('incident.resources'),
  validate({ params: idParam, body: incidentResourcesSchema }),
  asyncHandler(resourcesController),
);
incidentRouter.post(
  '/:id/teams',
  requirePermission('incident.resources'),
  validate({ params: idParam, body: assignTeamSchema }),
  asyncHandler(teamController),
);
incidentRouter.post(
  '/:id/close',
  requirePermission('incident.close'),
  validate({ params: idParam, body: closeIncidentSchema }),
  asyncHandler(closeController),
);

export const weatherRouter = Router();

weatherRouter.use(authenticate, requirePermission('incident.read'));

weatherRouter.get('/', validate({ query: weatherAlertListQuery }), asyncHandler(weatherListController));
weatherRouter.post(
  '/',
  requirePermission('weather.manage'),
  validate({ body: weatherAlertSchema }),
  asyncHandler(createWeatherController),
);
weatherRouter.patch(
  '/:id',
  requirePermission('weather.manage'),
  validate({ params: idParam, body: weatherAlertSchema.partial() }),
  asyncHandler(updateWeatherController),
);
