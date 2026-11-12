import type { GrievanceSummary, IdRef, SlaInfo, UserRef } from "@/lib/types";

export interface GrievanceActionItem {
  _id: string;
  type: string;
  text: string;
  visibility?: string;
  actor?: UserRef | null;
  documents?: Array<{ _id: string; title?: string; originalName?: string }>;
  createdAt: string;
}

export interface GrievanceAttachment {
  _id: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  createdAt?: string;
}

export interface GrievanceDetailData extends GrievanceSummary {
  description: string;
  source?: string;
  subcategory?: IdRef | null;
  office?: IdRef | null;
  tehsil?: IdRef | null;
  citizen?: UserRef | null;
  attachments?: GrievanceAttachment[];
  aiSuggestion?: {
    category?: IdRef | null;
    department?: IdRef | null;
    confidence?: number;
    status?: string;
    rationale?: string;
  } | null;
  resolution?: {
    text?: string;
    submittedAt?: string | null;
    documents?: GrievanceAttachment[];
  } | null;
  decision?: {
    outcome?: string;
    reason?: string;
    decidedAt?: string | null;
  } | null;
  reopenRequest?: {
    status?: string;
    reason?: string;
    requestedAt?: string | null;
    decisionNotes?: string;
    reviewedAt?: string | null;
  } | null;
  sla?: SlaInfo & {
    assignedAt?: string | null;
    acknowledgedAt?: string | null;
  };
}
