import { Schema, model } from 'mongoose';
import {
  CONFIDENTIALITY_LEVELS,
  FILE_STATUSES,
  OCR_STATUSES,
  PRIORITIES,
  TIMELINE_VISIBILITY,
} from '../config/constants';

const documentSchema = new Schema(
  {
    originalName: { type: String, required: true, maxlength: 300 },
    storedName: { type: String, required: true, unique: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
    checksum: { type: String, required: true, index: true },
    category: { type: String, trim: true, maxlength: 80 },
    confidentiality: {
      type: String,
      enum: CONFIDENTIALITY_LEVELS,
      default: 'INTERNAL',
      index: true,
    },
    entityType: {
      type: String,
      enum: ['GRIEVANCE', 'FILE', 'APPLICATION', 'MEETING', 'INCIDENT', 'ROAD_REPORT', 'USER', 'OTHER'],
      required: true,
      index: true,
    },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    ocrStatus: { type: String, enum: OCR_STATUSES, default: 'PENDING', index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
documentSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
export const Document = model('Document', documentSchema);

const ocrResultSchema = new Schema(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      unique: true,
      index: true,
    },
    extractedText: { type: String, default: '' },
    fields: {
      name: { type: String, default: '' },
      referenceNumber: { type: String, default: '' },
      date: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    engine: { type: String, default: 'local' },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'VERIFIED'],
      default: 'PENDING',
      index: true,
    },
    error: { type: String, maxlength: 1000 },
    corrections: { type: Schema.Types.Mixed },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
ocrResultSchema.index({ status: 1, createdAt: 1 });
export const OcrResult = model('OcrResult', ocrResultSchema);

const fileCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    defaultDepartment: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    defaultConfidentiality: {
      type: String,
      enum: CONFIDENTIALITY_LEVELS,
      default: 'INTERNAL',
    },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export const FileCategory = model('FileCategory', fileCategorySchema);

const movementRuleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    fromRole: { type: String, required: true },
    toRole: { type: String, required: true },
    requiresApproval: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export const MovementRule = model('MovementRule', movementRuleSchema);

const retentionRuleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    entityType: { type: String, enum: ['FILE', 'GRIEVANCE', 'APPLICATION'], required: true },
    confidentiality: { type: String, enum: CONFIDENTIALITY_LEVELS, default: 'INTERNAL' },
    retentionDays: { type: Number, required: true, min: 1, max: 36500 },
    archiveAfterDays: { type: Number, min: 1, max: 36500 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export const RetentionRule = model('RetentionRule', retentionRuleSchema);

const slaSchema = new Schema(
  {
    assignedAt: { type: Date, default: null },
    acknowledgedAt: { type: Date, default: null },
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
    resumedAt: { type: Date, default: null },
    escalationLevel: { type: Number, default: 0, min: 0, max: 3, index: true },
    escalatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const digitalFileSchema = new Schema(
  {
    fileId: { type: String, unique: true, sparse: true, index: true },
    fileNumber: { type: String, unique: true, sparse: true, index: true },
    subject: { type: String, required: true, trim: true, minlength: 3, maxlength: 250 },
    description: { type: String, trim: true, maxlength: 5000 },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    originatingOffice: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: Schema.Types.ObjectId, ref: 'FileCategory', default: null, index: true },
    priority: { type: String, enum: PRIORITIES, default: 'NORMAL', index: true },
    confidentiality: {
      type: String,
      enum: CONFIDENTIALITY_LEVELS,
      default: 'INTERNAL',
      index: true,
    },
    status: { type: String, enum: FILE_STATUSES, default: 'REGISTERED', index: true },
    currentCustodian: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    currentLocation: { type: String, trim: true, maxlength: 200 },
    qrTokenHash: { type: String, unique: true, sparse: true, index: true },
    qrGeneratedAt: { type: Date, default: null },
    qrVersion: { type: Number, default: 0 },
    attachments: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
    sla: { type: slaSchema, default: () => ({}) },
    retentionDays: { type: Number, default: null },
    archivedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    finalAction: { type: String, maxlength: 2000 },
  },
  { timestamps: true },
);
digitalFileSchema.index({ department: 1, status: 1, createdAt: -1 });
digitalFileSchema.index({ currentCustodian: 1, status: 1 });
digitalFileSchema.index({ subject: 'text', fileNumber: 'text', fileId: 'text' });
export const DigitalFile = model('DigitalFile', digitalFileSchema);

const fileMovementSchema = new Schema(
  {
    file: { type: Schema.Types.ObjectId, ref: 'DigitalFile', required: true, index: true },
    movementNumber: { type: String, required: true },
    fromUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    toUser: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromDepartment: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    toDepartment: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    dispatchedAt: { type: Date, default: Date.now },
    receivedAt: { type: Date, default: null },
    actionRequired: { type: String, enum: ['REVIEW', 'APPROVAL', 'INFORMATION', 'ACTION'], default: 'REVIEW' },
    remarks: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ['DISPATCHED', 'RECEIVED', 'CANCELLED'],
      default: 'DISPATCHED',
      index: true,
    },
    receivedVia: { type: String, enum: ['QR', 'MANUAL'], default: null },
    qrScanAt: { type: Date, default: null },
  },
  { timestamps: true },
);
fileMovementSchema.index({ file: 1, dispatchedAt: -1 });
fileMovementSchema.index({ toUser: 1, status: 1 });
export const FileMovement = model('FileMovement', fileMovementSchema);

const fileNoteSchema = new Schema(
  {
    file: { type: Schema.Types.ObjectId, ref: 'DigitalFile', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 5000 },
    visibility: { type: String, enum: TIMELINE_VISIBILITY, default: 'INTERNAL', index: true },
    decision: {
      type: String,
      enum: ['NONE', 'RECOMMEND_APPROVAL', 'RECOMMEND_RETURN', 'APPROVED', 'RETURNED'],
      default: 'NONE',
    },
    documents: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
  },
  { timestamps: true },
);
fileNoteSchema.index({ file: 1, createdAt: -1 });
export const FileNote = model('FileNote', fileNoteSchema);
