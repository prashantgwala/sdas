import { Schema, model } from 'mongoose';
import {
  GRIEVANCE_STATUSES,
  PRIORITIES,
  SLA_STATUSES,
  TIMELINE_VISIBILITY,
} from '../config/constants';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'GrievanceCategory', default: null, index: true },
    defaultDepartment: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    defaultPriority: { type: String, enum: PRIORITIES, default: 'NORMAL' },
    aiKeywords: { type: [String], default: [] },
    requiredEvidence: { type: [String], default: [] },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
categorySchema.index({ parent: 1, active: 1 });
export const GrievanceCategory = model('GrievanceCategory', categorySchema);

const slaRuleSchema = new Schema(
  {
    entityType: {
      type: String,
      enum: ['GRIEVANCE', 'FILE', 'APPLICATION', 'TASK'],
      required: true,
      index: true,
    },
    category: { type: Schema.Types.ObjectId, ref: 'GrievanceCategory', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    priority: { type: String, enum: PRIORITIES, required: true },
    responseHours: { type: Number, required: true, min: 1, max: 8760 },
    resolutionHours: { type: Number, required: true, min: 1, max: 8760 },
    dueSoonHours: { type: Number, default: 24, min: 1, max: 720 },
    escalationHours: {
      type: [Number],
      default: [24, 48, 72],
      validate: [(value: number[]) => value.length === 3, 'Three escalation intervals are required'],
    },
    pauseAllowed: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
slaRuleSchema.index({ entityType: 1, category: 1, priority: 1, active: 1 });
export const SLARule = model('SLARule', slaRuleSchema);

const routingRuleSchema = new Schema(
  {
    category: { type: Schema.Types.ObjectId, ref: 'GrievanceCategory', required: true, index: true },
    subcategory: { type: Schema.Types.ObjectId, ref: 'GrievanceCategory', default: null },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    office: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    priority: { type: String, enum: PRIORITIES, default: 'NORMAL' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
routingRuleSchema.index({ category: 1, subcategory: 1, active: 1 });
export const RoutingRule = model('RoutingRule', routingRuleSchema);

const aiSuggestionSchema = new Schema(
  {
    category: { type: Schema.Types.ObjectId, ref: 'GrievanceCategory', default: null },
    subcategory: { type: Schema.Types.ObjectId, ref: 'GrievanceCategory', default: null },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    status: {
      type: String,
      enum: ['SUGGESTED', 'ACCEPTED', 'EDITED', 'REJECTED'],
      default: 'SUGGESTED',
    },
    rationale: { type: String, maxlength: 1000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { _id: false },
);

const slaSchema = new Schema(
  {
    assignedAt: { type: Date, default: null },
    acknowledgedAt: { type: Date, default: null },
    dueAt: { type: Date, default: null, index: true },
    completedAt: { type: Date, default: null },
    status: { type: String, enum: SLA_STATUSES, default: 'WITHIN_TIME', index: true },
    pauseReason: { type: String, maxlength: 500 },
    pausedAt: { type: Date, default: null },
    resumedAt: { type: Date, default: null },
    escalationLevel: { type: Number, default: 0, min: 0, max: 3, index: true },
    escalatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const resolutionSchema = new Schema(
  {
    text: { type: String, maxlength: 5000 },
    documents: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null },
  },
  { _id: false },
);

const reopenRequestSchema = new Schema(
  {
    reason: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'NONE',
      index: true,
    },
    requestedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    decisionNotes: { type: String, maxlength: 2000 },
  },
  { _id: false },
);

const grievanceSchema = new Schema(
  {
    grievanceId: { type: String, unique: true, sparse: true, index: true },
    citizen: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    contact: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      mobile: { type: String, required: true, trim: true },
      email: { type: String, lowercase: true, trim: true },
    },
    subject: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 5000 },
    category: { type: Schema.Types.ObjectId, ref: 'GrievanceCategory', default: null, index: true },
    subcategory: { type: Schema.Types.ObjectId, ref: 'GrievanceCategory', default: null },
    location: { type: String, trim: true, maxlength: 500 },
    tehsil: { type: Schema.Types.ObjectId, ref: 'AdministrativeUnit', default: null, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    office: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    priority: { type: String, enum: PRIORITIES, default: 'NORMAL', index: true },
    status: {
      type: String,
      enum: GRIEVANCE_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    source: { type: String, enum: ['CITIZEN', 'ASSISTED'], default: 'CITIZEN' },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    routedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    routedAt: { type: Date, default: null },
    attachments: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
    aiSuggestion: { type: aiSuggestionSchema, default: () => ({}) },
    assignedOfficer: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date, default: null },
    acknowledgedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    resolution: { type: resolutionSchema, default: () => ({}) },
    decision: {
      type: new Schema(
        {
          outcome: { type: String, enum: ['RESOLVED', 'REJECTED', 'RETURNED', 'CLOSED'] },
          reason: { type: String, maxlength: 2000 },
          decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          decidedAt: { type: Date },
        },
        { _id: false },
      ),
      default: null,
    },
    reopenRequest: { type: reopenRequestSchema, default: () => ({}) },
    feedbackSubmitted: { type: Boolean, default: false },
    sla: { type: slaSchema, default: () => ({}) },
    submittedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

grievanceSchema.index({ citizen: 1, createdAt: -1 });
grievanceSchema.index({ department: 1, status: 1, priority: 1, createdAt: -1 });
grievanceSchema.index({ assignedOfficer: 1, status: 1, 'sla.dueAt': 1 });
grievanceSchema.index({ status: 1, 'sla.dueAt': 1 });
grievanceSchema.index({ subject: 'text', description: 'text', grievanceId: 'text' });
export const Grievance = model('Grievance', grievanceSchema);

const grievanceActionSchema = new Schema(
  {
    grievance: { type: Schema.Types.ObjectId, ref: 'Grievance', required: true, index: true },
    type: {
      type: String,
      enum: ['INTERNAL_NOTE', 'EVIDENCE', 'ATR', 'RESOLUTION', 'REVIEW', 'RETURN_REASON'],
      required: true,
    },
    text: { type: String, maxlength: 5000 },
    documents: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: { type: String, enum: TIMELINE_VISIBILITY, default: 'INTERNAL' },
  },
  { timestamps: true },
);
grievanceActionSchema.index({ grievance: 1, createdAt: -1 });
export const GrievanceAction = model('GrievanceAction', grievanceActionSchema);

const timelineEventSchema = new Schema(
  {
    entityType: {
      type: String,
      enum: ['GRIEVANCE', 'FILE', 'APPLICATION', 'MEETING', 'INCIDENT', 'ROAD_REPORT', 'TASK'],
      required: true,
      index: true,
    },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true, maxlength: 120 },
    fromStatus: { type: String },
    toStatus: { type: String },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    visibility: { type: String, enum: TIMELINE_VISIBILITY, default: 'INTERNAL', index: true },
    message: { type: String, maxlength: 2000 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
timelineEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
export const TimelineEvent = model('TimelineEvent', timelineEventSchema);
