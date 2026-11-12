import type { IdRef, UserRef } from "@/lib/types";

export interface FeedbackItem {
  _id: string;
  feedbackId?: string;
  citizen?: UserRef | null;
  grievance?: { _id?: string; grievanceId?: string; subject?: string } | null;
  department?: IdRef | null;
  category: string;
  text: string;
  rating: number;
  status: "PENDING_REVIEW" | "REVIEWED";
  aiTopics?: string[];
  reviewedBy?: UserRef | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface FeedbackAnalytics {
  summary: {
    total: number;
    averageRating: number;
    pending: number;
    reviewed: number;
  };
  ratingDistribution: Array<{ _id: number; count: number }>;
  topTopics: Array<{ _id: string; count: number }>;
  byCategory: Array<{ _id: string; count: number; averageRating: number }>;
  trend: Array<{ _id: string; count: number; averageRating: number }>;
  byDepartment: Array<{
    _id: string | null;
    count: number;
    averageRating: number;
    department?: Array<{ name?: string; code?: string }>;
  }>;
}
