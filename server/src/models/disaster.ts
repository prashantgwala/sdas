import { Schema, model } from 'mongoose';
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '../config/constants';

const resourceSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 150 },
    category: { type: String, maxlength: 80 },
    quantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, maxlength: 40 },
    available: { type: Number, default: 0, min: 0 },
    location: { type: String, maxlength: 200 },
  },
  { _id: false },
);

const teamSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 150 },
    contactPerson: { type: String, maxlength: 120 },
    contactPhone: { type: String, maxlength: 30 },
    members: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['STANDBY', 'DEPLOYED', 'RETURNED'], default: 'STANDBY' },
  },
  { _id: false },
);

const incidentActionSchema = new Schema(
  {
    text: { type: String, required: true, maxlength: 3000 },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    documents: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
  },
  { _id: false },
);

const incidentSchema = new Schema(
  {
    incidentId: { type: String, unique: true, sparse: true, index: true },
    type: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, required: true, trim: true, maxlength: 250 },
    description: { type: String, required: true, maxlength: 5000 },
    location: {
      address: { type: String, maxlength: 500 },
      tehsil: { type: Schema.Types.ObjectId, ref: 'AdministrativeUnit', default: null },
      geo: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: undefined },
      },
    },
    severity: { type: String, enum: INCIDENT_SEVERITIES, default: 'MEDIUM', index: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reportedAt: { type: Date, default: Date.now, index: true },
    commander: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedTeams: { type: [teamSchema], default: [] },
    resources: { type: [resourceSchema], default: [] },
    actions: { type: [incidentActionSchema], default: [] },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'REPORTED', index: true },
    closedAt: { type: Date, default: null },
    closureReport: { type: String, maxlength: 5000 },
    weatherAlert: { type: Schema.Types.ObjectId, ref: 'WeatherAlert', default: null },
    documents: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
  },
  { timestamps: true },
);
incidentSchema.index({ status: 1, severity: 1, reportedAt: -1 });
incidentSchema.index({ 'location.geo': '2dsphere' });
export const Incident = model('Incident', incidentSchema);

const weatherAlertSchema = new Schema(
  {
    source: { type: String, default: 'MANUAL', maxlength: 120 },
    type: { type: String, required: true, maxlength: 120 },
    severity: { type: String, enum: INCIDENT_SEVERITIES, required: true },
    area: { type: String, required: true, maxlength: 300 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    advisory: { type: String, required: true, maxlength: 3000 },
    status: { type: String, enum: ['INFO', 'WARNING', 'CRITICAL', 'EXPIRED'], default: 'INFO' },
    issuedAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
weatherAlertSchema.index({ active: 1, validTo: 1 });
export const WeatherAlert = model('WeatherAlert', weatherAlertSchema);
