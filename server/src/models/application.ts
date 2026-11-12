import { Schema, model } from 'mongoose';
import { APPLICATION_STATUSES, PRIORITIES } from '../config/constants';

const applicationTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    description: { type: String, trim: true, maxlength: 2000 },
    requiredDocuments: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            label: { type: String, required: true },
            required: { type: Boolean, default: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    formFieldSchema: { type: Schema.Types.Mixed, default: {} },
    slaRule: { type: Schema.Types.ObjectId, ref: 'SLARule', default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export const ApplicationType = model('ApplicationType', applicationTypeSchema);

const checklistItemSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: true },
    provided: { type: Boolean, default: false },
    document: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    verified: { type: Boolean, default: false },
    remarks: { type: String, maxlength: 500 },
  },
  { _id: false },
);

const applicationSchema = new Schema(
  {
    applicationId: { type: String, unique: true, sparse: true, index: true },
    type: { type: Schema.Types.ObjectId, ref: 'ApplicationType', required: true, index: true },
    citizen: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    formData: { type: Schema.Types.Mixed, default: {} },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'DRAFT', index: true },
    assignedClerk: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedOfficer: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reviewNotes: { type: String, maxlength: 5000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    documents: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
    checklist: { type: [checklistItemSchema], default: [] },
    missingDocuments: { type: [String], default: [] },
    duplicateOf: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
    duplicateWarning: { type: Boolean, default: false },
    decision: {
      type: new Schema(
        {
          outcome: { type: String, enum: ['APPROVED', 'REJECTED', 'CLOSED'] },
          reason: { type: String, maxlength: 2000 },
          decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          decidedAt: { type: Date },
        },
        { _id: false },
      ),
      default: null,
    },
    priority: { type: String, enum: PRIORITIES, default: 'NORMAL' },
    sla: {
      type: new Schema(
        {
          assignedAt: { type: Date, default: null },
          dueAt: { type: Date, default: null, index: true },
          completedAt: { type: Date, default: null },
          status: {
            type: String,
            enum: ['WITHIN_TIME', 'DUE_SOON', 'OVERDUE', 'PAUSED', 'COMPLETED'],
            default: 'WITHIN_TIME',
            index: true,
          },
          pauseReason: { type: String, maxlength: 500 },
          pausedAt: { type: Date, default: null },
          escalationLevel: { type: Number, default: 0, min: 0, max: 3 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
applicationSchema.index({ citizen: 1, createdAt: -1 });
applicationSchema.index({ department: 1, status: 1, createdAt: -1 });
applicationSchema.index({ assignedOfficer: 1, status: 1 });
applicationSchema.index({ formData: 'text' });
export const Application = model('Application', applicationSchema);
