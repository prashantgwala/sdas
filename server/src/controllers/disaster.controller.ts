import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import {
  addIncidentAction,
  closeIncident,
  createIncident,
  createWeatherAlert,
  getIncident,
  listIncidents,
  listWeatherAlerts,
  mergeIncidentResources,
  mergeIncidentTeams,
  updateIncident,
  updateWeatherAlert,
} from '../services/disaster.service';

function id(req: Request): string {
  return (req.validatedParams as { id: string }).id;
}

export async function listController(req: Request, res: Response): Promise<void> {
  const result = await listIncidents(req);
  ok(res, result.items, result.meta);
}

export async function detailController(req: Request, res: Response): Promise<void> {
  ok(res, await getIncident(id(req)));
}

export async function createController(req: Request, res: Response): Promise<void> {
  created(res, await createIncident(req.body, req));
}

export async function updateController(req: Request, res: Response): Promise<void> {
  ok(res, await updateIncident(id(req), req.body, req));
}

export async function actionController(req: Request, res: Response): Promise<void> {
  ok(res, await addIncidentAction(id(req), req.body, req));
}

export async function resourcesController(req: Request, res: Response): Promise<void> {
  ok(res, await mergeIncidentResources(id(req), req.body.resources, req));
}

export async function teamController(req: Request, res: Response): Promise<void> {
  ok(res, await mergeIncidentTeams(id(req), req.body, req));
}

export async function closeController(req: Request, res: Response): Promise<void> {
  ok(res, await closeIncident(id(req), req.body, req));
}

export async function weatherListController(req: Request, res: Response): Promise<void> {
  const result = await listWeatherAlerts(req);
  ok(res, result.items, result.meta);
}

export async function createWeatherController(req: Request, res: Response): Promise<void> {
  created(res, await createWeatherAlert(req.body, req));
}

export async function updateWeatherController(req: Request, res: Response): Promise<void> {
  ok(res, await updateWeatherAlert(id(req), req.body, req));
}
