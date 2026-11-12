import { Schema, model } from 'mongoose';
import { SLA_STATUSES } from '../config/constants';

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, maxlength: 60 },
    action: { type: String, required: true, maxlength: 120, index: true },
    entityType: { type: String, required: true, maxlength: 60, index: true },
    entityId: { type: Schema.Types.ObjectId, default: null, index: true },
    entityLabel: { type: String, maxlength: 250 },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String, maxlength: 80 },
    userAgent: { type: String, maxlength: 500 },
    requestId: { type: String, maxlength: 80 },
    status: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });
export const AuditLog = model('AuditLog', auditLogSchema);

const integrationSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, maxlength: 150 },
    category: {
      type: String,
      enum: ['EMAIL', 'SMS', 'AI', 'OCR', 'WEATHER', 'GOVERNMENT', 'STORAGE'],
      required: true,
    },
    provider: { type: String, maxlength: 120 },
    status: {
      type: String,
      enum: ['NOT_CONFIGURED', 'CONFIGURED', 'TESTED', 'ACTIVE', 'DISABLED'],
      default: 'NOT_CONFIGURED',
      index: true,
    },
    encryptedConfig: { type: String, default: '' },
    lastTestAt: { type: Date, default: null },
    lastError: { type: String, maxlength: 2000 },
    notes: { type: String, maxlength: 2000 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
export const Integration = model('Integration', integrationSchema);

const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    category: { type: String, default: 'general', index: true },
    description: { type: String, maxlength: 500 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
export const SystemSetting = model('SystemSetting', systemSettingSchema);

const jobRunSchema = new Schema(
  {
    jobName: { type: String, required: true, index: true },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    status: { type: String, enum: ['RUNNING', 'SUCCESS', 'FAILED'], default: 'RUNNING', index: true },
    stats: { type: Schema.Types.Mixed },
    error: { type: String, maxlength: 3000 },
    trigger: { type: String, enum: ['SCHEDULE', 'MANUAL'], default: 'SCHEDULE' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
jobRunSchema.index({ jobName: 1, startedAt: -1 });
export const JobRun = model('JobRun', jobRunSchema);

const systemBackupSchema = new Schema(
  {
    filename: { type: String, required: true },
    storagePath: { type: String, required: true },
    checksum: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['CREATING', 'COMPLETED', 'FAILED', 'RESTORED'], default: 'CREATING' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, maxlength: 1000 },
    error: { type: String, maxlength: 3000 },
  },
  { timestamps: true },
);
export const SystemBackup = model('SystemBackup', systemBackupSchema);

const counterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
});
export const Counter = model('Counter', counterSchema);

const knowledgeArticleSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 250 },
    slug: { type: String, required: true, maxlength: 250 },
    locale: { type: String, enum: ['en', 'hi', 'hinglish'], default: 'en', index: true },
    category: { type: String, maxlength: 120, index: true },
    content: { type: String, required: true, maxlength: 20000 },
    tags: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    status: { type: String, enum: ['DRAFT', 'APPROVED', 'ARCHIVED'], default: 'DRAFT', index: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
knowledgeArticleSchema.index({ locale: 1, slug: 1 }, { unique: true });
knowledgeArticleSchema.index({ status: 1, locale: 1 });
knowledgeArticleSchema.index({ title: 'text', content: 'text', keywords: 'text', tags: 'text' });
export const KnowledgeArticle = model('KnowledgeArticle', knowledgeArticleSchema);

const chatMessageSchema = new Schema(
  {
    role: { type: String, enum: ['USER', 'ASSISTANT', 'SYSTEM'], required: true },
    content: { type: String, required: true, maxlength: 5000 },
    language: { type: String, enum: ['en', 'hi', 'hinglish'], default: 'en' },
    sources: { type: [{ type: Schema.Types.ObjectId, ref: 'KnowledgeArticle' }], default: [] },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const chatConversationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    guestId: { type: String, maxlength: 100 },
    language: { type: String, enum: ['en', 'hi', 'hinglish'], default: 'en' },
    status: { type: String, enum: ['ACTIVE', 'ESCALATED', 'CLOSED'], default: 'ACTIVE', index: true },
    messages: { type: [chatMessageSchema], default: [] },
    handoffTicket: { type: Schema.Types.ObjectId, ref: 'HelpdeskTicket', default: null },
  },
  { timestamps: true },
);
chatConversationSchema.index({ user: 1, createdAt: -1 });
export const ChatConversation = model('ChatConversation', chatConversationSchema);

const helpdeskMessageSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: { type: String, maxlength: 120 },
    content: { type: String, required: true, maxlength: 5000 },
    internal: { type: Boolean, default: false },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const helpdeskTicketSchema = new Schema(
  {
    ticketId: { type: String, unique: true, sparse: true, index: true },
    citizen: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, maxlength: 250 },
    category: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 5000 },
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    messages: { type: [helpdeskMessageSchema], default: [] },
    resolution: { type: String, maxlength: 3000 },
    resolvedAt: { type: Date, default: null },
    sla: {
      dueAt: { type: Date, default: null },
      status: { type: String, enum: SLA_STATUSES, default: 'WITHIN_TIME' },
      escalationLevel: { type: Number, default: 0, min: 0, max: 3 },
    },
  },
  { timestamps: true },
);
helpdeskTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
export const HelpdeskTicket = model('HelpdeskTicket', helpdeskTicketSchema);
