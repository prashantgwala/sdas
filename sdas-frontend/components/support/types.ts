import type { IdRef, SlaInfo, UserRef } from "@/lib/types";

export type ChatLanguage = "en" | "hi" | "hinglish";

export interface ChatMessage {
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  language?: ChatLanguage;
  sources?: string[];
  confidence?: number;
  at?: string;
}

export interface ChatConversation {
  _id: string;
  language: ChatLanguage;
  status: "ACTIVE" | "ESCALATED" | "CLOSED";
  messages: ChatMessage[];
  handoffTicket?:
    | string
    | { _id?: string; ticketId?: string; status?: string; subject?: string }
    | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatAnswer {
  answer: string;
  sources: Array<{ id: string; title: string; slug: string }>;
  confidence: number;
  escalated: boolean;
}

export interface ChatSendResult {
  conversation: ChatConversation;
  answer: ChatAnswer;
}

export interface HelpdeskMessage {
  author?: string | null;
  authorName?: string;
  content: string;
  internal?: boolean;
  at: string;
}

export interface HelpdeskTicketSummary {
  _id: string;
  ticketId?: string;
  subject: string;
  category: string;
  description: string;
  priority: string;
  status: string;
  citizen?: UserRef | null;
  assignedTo?: UserRef | null;
  department?: IdRef | null;
  resolution?: string | null;
  resolvedAt?: string | null;
  sla?: SlaInfo;
  createdAt: string;
  updatedAt?: string;
}

export interface HelpdeskTicketDetail extends HelpdeskTicketSummary {
  messages: HelpdeskMessage[];
}

export interface HelpdeskStats {
  byStatus: Array<{ _id: string; count: number }>;
  byPriority: Array<{ _id: string; count: number }>;
  byCategory: Array<{ _id: string; count: number }>;
  resolution: { averageHours?: number; resolved?: number };
}
