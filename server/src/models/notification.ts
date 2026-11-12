import { Schema, model } from 'mongoose';
import { NOTIFICATION_TYPES } from '../config/constants';

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    title: { type: String, required: true, maxlength: 250 },
    body: { type: String, required: true, maxlength: 2000 },
    entityType: { type: String, maxlength: 60 },
    entityId: { type: Schema.Types.ObjectId, default: null },
    link: { type: String, maxlength: 500 },
    channels: { type: [String], default: ['IN_APP'] },
    readAt: { type: Date, default: null, index: true },
    emailStatus: { type: String, enum: ['NOT_APPLICABLE', 'PENDING', 'SENT', 'FAILED'], default: 'NOT_APPLICABLE' },
    smsStatus: { type: String, enum: ['NOT_APPLICABLE', 'PENDING', 'SENT', 'FAILED'], default: 'NOT_APPLICABLE' },
    dedupeKey: { type: String, unique: true, sparse: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });
export const Notification = model('Notification', notificationSchema);

const notificationTemplateSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, maxlength: 150 },
    channel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS'], required: true },
    locale: { type: String, enum: ['en', 'hi', 'hinglish'], default: 'en' },
    subject: { type: String, maxlength: 250 },
    body: { type: String, required: true, maxlength: 5000 },
    variables: { type: [String], default: [] },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
notificationTemplateSchema.index({ key: 1, channel: 1, locale: 1 }, { unique: true });
export const NotificationTemplate = model('NotificationTemplate', notificationTemplateSchema);
