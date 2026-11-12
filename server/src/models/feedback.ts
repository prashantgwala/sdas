import { Schema, model } from 'mongoose';

const feedbackSchema = new Schema(
  {
    feedbackId: { type: String, unique: true, sparse: true, index: true },
    citizen: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    grievance: { type: Schema.Types.ObjectId, ref: 'Grievance', default: null, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    category: { type: String, required: true, trim: true, maxlength: 120 },
    text: { type: String, required: true, trim: true, minlength: 5, maxlength: 3000 },
    rating: { type: Number, required: true, min: 1, max: 5, index: true },
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'REVIEWED'],
      default: 'PENDING_REVIEW',
      index: true,
    },
    aiTopics: { type: [String], default: [] },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNotes: { type: String, maxlength: 2000 },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
feedbackSchema.index({ department: 1, createdAt: -1 });
feedbackSchema.index({ createdAt: -1 });
export const Feedback = model('Feedback', feedbackSchema);
