import { z } from 'zod';
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '../config/constants';
import { objectId, optionalObjectId, paginationQuery } from './common';

const geo = z.object({
  address: z.string().trim().max(500).optional(),
  tehsil: optionalObjectId,
  coordinates: z.array(z.coerce.number()).length(2).optional(),
});

export const createIncidentSchema = z.object({
  type: z.string().trim().min(2).max(120),
  title: z.string().trim().min(5).max(250),
  description: z.string().trim().min(20).max(5000),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  location: geo.optional(),
  commander: optionalObjectId,
  weatherAlert: optionalObjectId,
});

export const updateIncidentSchema = createIncidentSchema.partial().extend({
  status: z.enum(INCIDENT_STATUSES).optional(),
});

export const incidentListQuery = paginationQuery.extend({
  status: z.enum(INCIDENT_STATUSES).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  type: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const incidentActionSchema = z.object({
  text: z.string().trim().min(5).max(3000),
  documentIds: z.array(objectId).max(20).optional(),
  status: z.enum(INCIDENT_STATUSES).optional(),
});

export const resourceSchema = z.object({
  name: z.string().trim().min(2).max(150),
  category: z.string().trim().max(80).optional(),
  quantity: z.coerce.number().min(0).optional(),
  unit: z.string().trim().max(40).optional(),
  available: z.coerce.number().min(0).optional(),
  location: z.string().trim().max(200).optional(),
});

export const assignTeamSchema = z.object({
  name: z.string().trim().min(2).max(150),
  contactPerson: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  members: z.coerce.number().min(0).optional(),
  status: z.enum(['STANDBY', 'DEPLOYED', 'RETURNED']).optional(),
});

export const incidentResourcesSchema = z.object({
  resources: z.array(resourceSchema).min(1).max(50),
});

export const closeIncidentSchema = z.object({
  closureReport: z.string().trim().min(20).max(5000),
});

export const weatherAlertSchema = z.object({
  type: z.string().trim().min(2).max(120),
  severity: z.enum(INCIDENT_SEVERITIES),
  area: z.string().trim().min(2).max(300),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  advisory: z.string().trim().min(10).max(3000),
  status: z.enum(['INFO', 'WARNING', 'CRITICAL', 'EXPIRED']).optional(),
  active: z.boolean().optional(),
  source: z.string().trim().max(120).optional(),
});

export const weatherAlertListQuery = paginationQuery.extend({
  active: z.enum(['true', 'false']).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
});
