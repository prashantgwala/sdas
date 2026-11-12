import { Types } from 'mongoose';
import type { Request } from 'express';
import type { z } from 'zod';
import { Incident, WeatherAlert } from '../models/disaster';
import { AppError } from '../middleware/error';
import { addTimeline } from './timeline.service';
import { recordAudit } from './audit.service';
import { notifyRole } from './notification.service';
import { nextSequence } from '../utils/ids';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type {
  assignTeamSchema,
  closeIncidentSchema,
  createIncidentSchema,
  incidentActionSchema,
  incidentListQuery,
  resourceSchema,
  updateIncidentSchema,
  weatherAlertListQuery,
  weatherAlertSchema,
} from '../validators/disaster';

type Input<T> = z.infer<T>;

function oid(value?: string | null): Types.ObjectId | null {
  return value ? new Types.ObjectId(value) : null;
}

function buildLocation(location?: Input<typeof createIncidentSchema>['location']) {
  if (!location) return undefined;
  return {
    address: location.address,
    tehsil: oid(location.tehsil),
    ...(location.coordinates
      ? { geo: { type: 'Point' as const, coordinates: location.coordinates } }
      : {}),
  };
}

export async function listIncidents(req: Request) {
  const query = req.validatedQuery as Input<typeof incidentListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.severity) filter.severity = query.severity;
  if (query.type) filter.type = query.type;
  if (query.from || query.to) {
    filter.reportedAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.q) {
    const pattern = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }, { incidentId: pattern }, { type: pattern }];
  }

  const sort = buildSort(query.sort, ['reportedAt', 'severity', 'status', 'createdAt'], '-reportedAt');
  const [items, total] = await Promise.all([
    Incident.find(filter as never)
      .populate('reportedBy', 'name designation')
      .populate('commander', 'name designation')
      .populate('weatherAlert', 'type severity area status')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Incident.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function getIncident(id: string) {
  const incident = await Incident.findById(id)
    .populate('reportedBy', 'name designation email')
    .populate('commander', 'name designation email')
    .populate('weatherAlert', 'type severity area validFrom validTo status')
    .lean();
  if (!incident) throw new AppError(404, 'Incident not found', 'NOT_FOUND');
  return incident;
}

export async function createIncident(
  input: Input<typeof createIncidentSchema>,
  req: Request,
) {
  const incident = await Incident.create({
    incidentId: await nextSequence('INC'),
    type: input.type,
    title: input.title,
    description: input.description,
    severity: input.severity ?? 'MEDIUM',
    location: buildLocation(input.location),
    reportedBy: new Types.ObjectId(req.user!.id),
    reportedAt: new Date(),
    commander: oid(input.commander),
    weatherAlert: oid(input.weatherAlert),
    status: 'REPORTED',
  });

  const payload = {
    type: incident.severity === 'CRITICAL' ? ('ESCALATION_ALERT' as const) : ('SYSTEM' as const),
    title: `${incident.severity} incident: ${incident.title}`,
    body: incident.description.slice(0, 300),
    entityType: 'Incident',
    entityId: String(incident._id),
    link: `/incidents/${incident._id}`,
  };
  await notifyRole('DISTRICT_ADMIN', payload);
  await notifyRole('DEPARTMENT_HEAD', payload);

  await addTimeline({
    entityType: 'INCIDENT',
    entityId: String(incident._id),
    action: 'INCIDENT_REPORTED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `${incident.severity} ${incident.type} incident reported`,
  });
  await recordAudit(req, {
    action: 'INCIDENT_CREATED',
    entityType: 'Incident',
    entityId: String(incident._id),
    entityLabel: incident.incidentId ?? incident.title,
    after: { type: incident.type, severity: incident.severity, title: incident.title },
  });
  return incident.toObject();
}

export async function updateIncident(
  id: string,
  input: Input<typeof updateIncidentSchema>,
  req: Request,
) {
  const incident = await Incident.findById(id);
  if (!incident) throw new AppError(404, 'Incident not found', 'NOT_FOUND');
  if (input.status === 'CLOSED') {
    throw new AppError(422, 'Use the close endpoint with a closure report', 'INVALID_OPERATION');
  }
  const before = {
    status: incident.status,
    severity: incident.severity,
    commander: incident.commander,
    title: incident.title,
  };

  if (input.type !== undefined) incident.type = input.type;
  if (input.title !== undefined) incident.title = input.title;
  if (input.description !== undefined) incident.description = input.description;
  if (input.severity !== undefined) incident.severity = input.severity;
  if (input.location !== undefined) incident.location = buildLocation(input.location) as never;
  if ('commander' in input) incident.commander = oid(input.commander);
  if ('weatherAlert' in input) incident.weatherAlert = oid(input.weatherAlert);
  if (input.status !== undefined) {
    incident.status = input.status;
    if (input.status === 'CONTAINED' && !incident.closedAt) incident.closedAt = null;
  }
  await incident.save();

  await addTimeline({
    entityType: 'INCIDENT',
    entityId: id,
    action: 'INCIDENT_UPDATED',
    fromStatus: before.status,
    toStatus: incident.status,
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: `Incident updated to ${incident.status}`,
  });
  await recordAudit(req, {
    action: 'INCIDENT_UPDATED',
    entityType: 'Incident',
    entityId: id,
    entityLabel: incident.incidentId ?? incident.title,
    before,
    after: { status: incident.status, severity: incident.severity, commander: incident.commander, title: incident.title },
  });
  return incident.toObject();
}

export async function addIncidentAction(
  id: string,
  input: Input<typeof incidentActionSchema>,
  req: Request,
) {
  const incident = await Incident.findById(id);
  if (!incident) throw new AppError(404, 'Incident not found', 'NOT_FOUND');
  if (incident.status === 'CLOSED') {
    throw new AppError(422, 'This incident is closed', 'INVALID_STATE');
  }
  if (input.status === 'CLOSED') {
    throw new AppError(422, 'Use the close endpoint with a closure report', 'INVALID_OPERATION');
  }

  const beforeStatus = incident.status;
  incident.actions.push({
    text: input.text,
    actor: new Types.ObjectId(req.user!.id),
    at: new Date(),
    documents: (input.documentIds ?? []).map((docId) => new Types.ObjectId(docId)),
  });
  if (input.status) incident.status = input.status;
  await incident.save();

  await addTimeline({
    entityType: 'INCIDENT',
    entityId: id,
    action: 'INCIDENT_ACTION_ADDED',
    fromStatus: beforeStatus,
    toStatus: incident.status,
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: input.text.slice(0, 500),
  });
  await recordAudit(req, {
    action: 'INCIDENT_ACTION_ADDED',
    entityType: 'Incident',
    entityId: id,
    entityLabel: incident.incidentId ?? incident.title,
    after: { status: incident.status, text: input.text },
  });
  return incident.toObject();
}

export async function mergeIncidentResources(
  id: string,
  resources: Array<Input<typeof resourceSchema>>,
  req: Request,
) {
  const incident = await Incident.findById(id);
  if (!incident) throw new AppError(404, 'Incident not found', 'NOT_FOUND');

  const existing = incident.resources as unknown as Array<Record<string, unknown>>;
  for (const resource of resources) {
    if (resource.available !== undefined && resource.quantity !== undefined && resource.available > resource.quantity) {
      throw new AppError(422, `Available quantity cannot exceed total for ${resource.name}`, 'VALIDATION_ERROR');
    }
    const match = existing.find(
      (item) => String(item.name).toLowerCase() === resource.name.toLowerCase(),
    );
    if (match) {
      Object.assign(match, resource);
    } else {
      existing.push({ ...resource, quantity: resource.quantity ?? 0, available: resource.available ?? 0 });
    }
  }
  incident.resources = existing as never;
  incident.markModified('resources');
  await incident.save();

  await recordAudit(req, {
    action: 'INCIDENT_RESOURCES_UPDATED',
    entityType: 'Incident',
    entityId: id,
    entityLabel: incident.incidentId ?? incident.title,
    after: { resources },
  });
  return incident.toObject();
}

export async function mergeIncidentTeams(
  id: string,
  team: Input<typeof assignTeamSchema>,
  req: Request,
) {
  const incident = await Incident.findById(id);
  if (!incident) throw new AppError(404, 'Incident not found', 'NOT_FOUND');
  const teams = incident.assignedTeams as unknown as Array<Record<string, unknown>>;
  const match = teams.find((item) => String(item.name).toLowerCase() === team.name.toLowerCase());
  if (match) Object.assign(match, team);
  else teams.push({ ...team, members: team.members ?? 0, status: team.status ?? 'STANDBY' });
  incident.assignedTeams = teams as never;
  incident.markModified('assignedTeams');
  await incident.save();

  await recordAudit(req, {
    action: 'INCIDENT_TEAM_ASSIGNED',
    entityType: 'Incident',
    entityId: id,
    entityLabel: incident.incidentId ?? incident.title,
    after: team,
  });
  return incident.toObject();
}

export async function closeIncident(
  id: string,
  input: Input<typeof closeIncidentSchema>,
  req: Request,
) {
  const incident = await Incident.findById(id);
  if (!incident) throw new AppError(404, 'Incident not found', 'NOT_FOUND');
  if (incident.status === 'CLOSED') {
    throw new AppError(409, 'Incident is already closed', 'INVALID_STATE');
  }
  incident.status = 'CLOSED';
  incident.closedAt = new Date();
  incident.closureReport = input.closureReport;
  await incident.save();

  await notifyRole('DISTRICT_ADMIN', {
    type: 'SYSTEM',
    title: `Incident closed: ${incident.title}`,
    body: input.closureReport.slice(0, 300),
    entityType: 'Incident',
    entityId: id,
    link: `/incidents/${id}`,
  });
  await addTimeline({
    entityType: 'INCIDENT',
    entityId: id,
    action: 'INCIDENT_CLOSED',
    fromStatus: 'CONTAINED',
    toStatus: 'CLOSED',
    actor: req.user!.id,
    visibility: 'INTERNAL',
    message: input.closureReport.slice(0, 500),
  });
  await recordAudit(req, {
    action: 'INCIDENT_CLOSED',
    entityType: 'Incident',
    entityId: id,
    entityLabel: incident.incidentId ?? incident.title,
    after: { closureReport: input.closureReport },
  });
  return incident.toObject();
}

/* ------------------------------ weather alerts ---------------------------- */

export async function listWeatherAlerts(req: Request) {
  const query = req.validatedQuery as Input<typeof weatherAlertListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.active === 'true') {
    filter.active = true;
    filter.validTo = { $gt: new Date() };
  }
  if (query.active === 'false') filter.active = false;
  if (query.severity) filter.severity = query.severity;

  const [items, total] = await Promise.all([
    WeatherAlert.find(filter as never)
      .sort({ issuedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    WeatherAlert.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function createWeatherAlert(
  input: Input<typeof weatherAlertSchema>,
  req: Request,
) {
  if (input.validTo <= input.validFrom) {
    throw new AppError(422, 'Valid-to must be after valid-from', 'VALIDATION_ERROR');
  }
  const alert = await WeatherAlert.create({
    ...input,
    active: input.active ?? true,
    issuedAt: new Date(),
    createdBy: new Types.ObjectId(req.user!.id),
  });

  const payload = {
    type: alert.severity === 'CRITICAL' ? ('ESCALATION_ALERT' as const) : ('SYSTEM' as const),
    title: `${alert.severity} weather alert: ${alert.type}`,
    body: `${alert.area} · ${alert.advisory.slice(0, 250)}`,
    entityType: 'WeatherAlert',
    entityId: String(alert._id),
    link: '/weather-alerts',
  };
  await notifyRole('DISTRICT_ADMIN', payload);
  await notifyRole('DEPARTMENT_HEAD', payload);

  await recordAudit(req, {
    action: 'WEATHER_ALERT_CREATED',
    entityType: 'WeatherAlert',
    entityId: String(alert._id),
    entityLabel: alert.type,
    after: { area: alert.area, severity: alert.severity, validFrom: alert.validFrom, validTo: alert.validTo },
  });
  return alert.toObject();
}

export async function updateWeatherAlert(
  id: string,
  input: Partial<Input<typeof weatherAlertSchema>>,
  req: Request,
) {
  const alert = await WeatherAlert.findById(id);
  if (!alert) throw new AppError(404, 'Weather alert not found', 'NOT_FOUND');
  const before = { ...alert.toObject() };
  Object.assign(alert, input);
  if (alert.validTo <= alert.validFrom) {
    throw new AppError(422, 'Valid-to must be after valid-from', 'VALIDATION_ERROR');
  }
  if (alert.validTo.getTime() < Date.now()) {
    alert.active = false;
    alert.status = 'EXPIRED';
  }
  await alert.save();
  await recordAudit(req, {
    action: 'WEATHER_ALERT_UPDATED',
    entityType: 'WeatherAlert',
    entityId: id,
    entityLabel: alert.type,
    before,
    after: alert.toObject(),
  });
  return alert.toObject();
}
