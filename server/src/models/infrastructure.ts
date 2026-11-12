import { Schema, model } from 'mongoose';
import { ROAD_REPAIR_STATUSES } from '../config/constants';

const repairUpdateSchema = new Schema(
  {
    text: { type: String, required: true, maxlength: 3000 },
    status: { type: String, enum: ROAD_REPAIR_STATUSES, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    evidence: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
  },
  { _id: false },
);

const roadDamageReportSchema = new Schema(
  {
    reportId: { type: String, unique: true, sparse: true, index: true },
    roadName: { type: String, required: true, trim: true, maxlength: 250 },
    location: {
      address: { type: String, maxlength: 500 },
      tehsil: { type: Schema.Types.ObjectId, ref: 'AdministrativeUnit', default: null },
      geo: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: undefined },
      },
    },
    documents: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
    damageCategory: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 5000 },
    aiSuggestion: {
      type: new Schema(
        {
          category: { type: String, maxlength: 120 },
          confidence: { type: Number, min: 0, max: 1, default: 0 },
          rationale: { type: String, maxlength: 1000 },
          status: {
            type: String,
            enum: ['SUGGESTED', 'ACCEPTED', 'REJECTED'],
            default: 'SUGGESTED',
          },
          reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          reviewedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    inspection: {
      type: new Schema(
        {
          officer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          status: {
            type: String,
            enum: ['PENDING', 'SCHEDULED', 'COMPLETED'],
            default: 'PENDING',
          },
          findings: { type: String, maxlength: 3000 },
          verified: { type: Boolean, default: false },
          inspectedAt: { type: Date, default: null },
          documents: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    assignedDepartment: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    repairStatus: { type: String, enum: ROAD_REPAIR_STATUSES, default: 'REPORTED', index: true },
    repairUpdates: { type: [repairUpdateSchema], default: [] },
    closureEvidence: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
    closedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
roadDamageReportSchema.index({ 'location.geo': '2dsphere' });
roadDamageReportSchema.index({ assignedDepartment: 1, repairStatus: 1 });
export const RoadDamageReport = model('RoadDamageReport', roadDamageReportSchema);
