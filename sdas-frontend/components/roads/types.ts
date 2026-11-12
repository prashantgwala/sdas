import type { IdRef, UserRef } from "@/lib/types";

export interface RoadReportSummary {
  _id: string;
  reportId?: string;
  roadName: string;
  damageCategory: string;
  description?: string;
  repairStatus: string;
  location?: {
    address?: string;
    tehsil?: IdRef | string | null;
  };
  assignedDepartment?: IdRef | string | null;
  createdBy?: UserRef | null;
  createdAt?: string;
  aiSuggestion?: {
    category?: string;
    confidence?: number;
    rationale?: string;
    status?: string;
    reviewedAt?: string | null;
  };
  inspection?: {
    officer?: UserRef | null;
    status?: string;
    findings?: string;
    verified?: boolean;
    inspectedAt?: string | null;
  };
  repairUpdates?: Array<{
    text: string;
    status: string;
    actor?: UserRef | null;
    at?: string;
  }>;
  closedAt?: string | null;
}
