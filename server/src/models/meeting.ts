import { Schema, model } from 'mongoose';
import { MEETING_STATUSES, MINUTES_STATUSES, TASK_STATUSES } from '../config/constants';

const participantSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true, maxlength: 120 },
    role: { type: String, maxlength: 120 },
    attendance: { type: String, enum: ['INVITED', 'PRESENT', 'ABSENT'], default: 'INVITED' },
  },
  { _id: false },
);

const minutesSchema = new Schema(
  {
    content: { type: String, default: '', maxlength: 30000 },
    status: { type: String, enum: MINUTES_STATUSES, default: 'DRAFT' },
    draftedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    aiSummary: { type: String, default: '', maxlength: 10000 },
    aiGeneratedAt: { type: Date, default: null },
  },
  { _id: false },
);

const meetingSchema = new Schema(
  {
    meetingId: { type: String, unique: true, sparse: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 250 },
    agenda: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: ['DISTRICT', 'DEPARTMENT', 'REVIEW', 'EMERGENCY'], default: 'DEPARTMENT' },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 60, min: 15, max: 1440 },
    mode: { type: String, enum: ['PHYSICAL', 'ONLINE', 'HYBRID'], default: 'PHYSICAL' },
    location: { type: String, trim: true, maxlength: 300 },
    organizer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    participants: { type: [participantSchema], default: [] },
    visibility: { type: String, enum: ['PUBLIC', 'INTERNAL'], default: 'INTERNAL', index: true },
    recordingDocument: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    minutes: { type: minutesSchema, default: () => ({}) },
    status: { type: String, enum: MEETING_STATUSES, default: 'SCHEDULED', index: true },
  },
  { timestamps: true },
);
meetingSchema.index({ scheduledAt: 1, status: 1 });
meetingSchema.index({ 'participants.user': 1 });
export const Meeting = model('Meeting', meetingSchema);

const meetingTaskSchema = new Schema(
  {
    taskId: { type: String, unique: true, sparse: true, index: true },
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
    description: { type: String, required: true, maxlength: 3000 },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    dueDate: { type: Date, required: true, index: true },
    status: { type: String, enum: TASK_STATUSES, default: 'OPEN', index: true },
    completedAt: { type: Date, default: null },
    completionEvidence: { type: [{ type: Schema.Types.ObjectId, ref: 'Document' }], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
meetingTaskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
export const MeetingTask = model('MeetingTask', meetingTaskSchema);
