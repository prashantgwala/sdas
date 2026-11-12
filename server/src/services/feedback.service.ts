import { Types } from 'mongoose';
import type { Request } from 'express';
import type { z } from 'zod';
import { Feedback } from '../models/feedback';
import { Grievance } from '../models/grievance';
import { AppError } from '../middleware/error';
import { analyzeFeedback } from './ai.service';
import { recordAudit } from './audit.service';
import { buildPageMeta, buildSort, parsePagination } from '../utils/pagination';
import type { createFeedbackSchema, feedbackListQuery } from '../validators/feedback';

type Input<T> = z.infer<T>;

function scopeFilter(req: Request): Record<string, unknown> {
  const user = req.user!;
  if (user.role === 'CITIZEN') return { citizen: user.id };
  if (user.role === 'DISTRICT_ADMIN' || user.role === 'SUPER_ADMIN') return {};
  return { department: user.department };
}

export async function createFeedback(
  input: Input<typeof createFeedbackSchema>,
  req: Request,
) {
  const user = req.user!;
  let department = input.department ? new Types.ObjectId(input.department) : null;
  let grievanceId: Types.ObjectId | null = null;

  if (input.grievance) {
    const grievance = await Grievance.findById(input.grievance)
      .select('citizen department status feedbackSubmitted')
      .lean();
    if (!grievance) throw new AppError(404, 'Grievance not found', 'NOT_FOUND');
    if (user.role === 'CITIZEN' && String(grievance.citizen ?? '') !== user.id) {
      throw new AppError(403, 'You can only give feedback for your own grievance', 'FORBIDDEN_SCOPE');
    }
    if (!['RESOLVED', 'CLOSED'].includes(String(grievance.status))) {
      throw new AppError(422, 'Feedback can be submitted after the grievance is resolved', 'INVALID_STATE');
    }
    if (grievance.feedbackSubmitted) {
      throw new AppError(409, 'Feedback has already been submitted for this grievance', 'DUPLICATE');
    }
    grievanceId = new Types.ObjectId(input.grievance);
    department = (grievance.department as Types.ObjectId | null) ?? department;
  }

  const feedback = await Feedback.create({
    citizen: new Types.ObjectId(user.id),
    grievance: grievanceId,
    department,
    category: input.category,
    text: input.text,
    rating: input.rating,
    aiTopics: await analyzeFeedback(input.text),
  });

  if (grievanceId) {
    await Grievance.updateOne({ _id: grievanceId }, { $set: { feedbackSubmitted: true } });
  }

  await recordAudit(req, {
    action: 'FEEDBACK_CREATED',
    entityType: 'Feedback',
    entityId: String(feedback._id),
    entityLabel: input.category,
    after: { rating: feedback.rating, topics: feedback.aiTopics, grievance: input.grievance ?? null },
  });

  return feedback.toObject();
}

export async function listFeedback(req: Request) {
  const query = req.validatedQuery as Input<typeof feedbackListQuery>;
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (query.status) filter.status = query.status;
  if (query.department) filter.department = query.department;
  if (query.rating) filter.rating = query.rating;
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.q) {
    filter.text = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const sort = buildSort(query.sort, ['rating', 'createdAt', 'status'], '-createdAt');
  const [items, total] = await Promise.all([
    Feedback.find(filter as never)
      .populate('citizen', 'name email')
      .populate('grievance', 'grievanceId subject')
      .populate('department', 'name code')
      .populate('reviewedBy', 'name')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Feedback.countDocuments(filter as never),
  ]);
  return { items, meta: buildPageMeta(total, pagination) };
}

export async function reviewFeedback(
  id: string,
  input: { reviewNotes?: string },
  req: Request,
) {
  const filter: Record<string, unknown> = { _id: id, ...scopeFilter(req) };
  const feedback = await Feedback.findOne(filter as never);
  if (!feedback) throw new AppError(404, 'Feedback not found', 'NOT_FOUND');
  const before = feedback.status;
  feedback.status = 'REVIEWED';
  feedback.reviewedBy = new Types.ObjectId(req.user!.id);
  feedback.reviewNotes = input.reviewNotes;
  feedback.reviewedAt = new Date();
  await feedback.save();

  await recordAudit(req, {
    action: 'FEEDBACK_REVIEWED',
    entityType: 'Feedback',
    entityId: id,
    entityLabel: feedback.category,
    before: { status: before },
    after: { status: feedback.status, reviewNotes: input.reviewNotes },
  });
  return feedback.toObject();
}

export async function feedbackAnalytics(req: Request) {
  const user = req.user!;
  const match: Record<string, unknown> = {};
  if (user.role !== 'DISTRICT_ADMIN' && user.role !== 'SUPER_ADMIN') {
    if (user.department) match.department = new Types.ObjectId(user.department);
  }

  const [summary, ratings, topics, byCategory, trend, byDepartment] = await Promise.all([
    Feedback.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING_REVIEW'] }, 1, 0] } },
          reviewed: { $sum: { $cond: [{ $eq: ['$status', 'REVIEWED'] }, 1, 0] } },
        },
      },
    ]),
    Feedback.aggregate([
      { $match: match },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Feedback.aggregate([
      { $match: match },
      { $unwind: '$aiTopics' },
      { $group: { _id: '$aiTopics', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    Feedback.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          averageRating: { $avg: '$rating' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    Feedback.aggregate([
      {
        $match: {
          ...match,
          createdAt: { $gte: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          count: { $sum: 1 },
          averageRating: { $avg: '$rating' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    user.role === 'DISTRICT_ADMIN'
      ? Feedback.aggregate([
          { $match: match },
          { $group: { _id: '$department', count: { $sum: 1 }, averageRating: { $avg: '$rating' } } },
          { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
          { $sort: { count: -1 } },
          { $limit: 15 },
        ])
      : Promise.resolve([]),
  ]);

  return {
    summary: (summary as Array<Record<string, unknown>>)[0] ?? {
      total: 0,
      averageRating: 0,
      pending: 0,
      reviewed: 0,
    },
    ratingDistribution: ratings,
    topTopics: topics,
    byCategory,
    trend,
    byDepartment,
  };
}
