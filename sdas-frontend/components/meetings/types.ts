import type { IdRef, MeetingTaskItem, UserRef } from "@/lib/types";

export interface MeetingParticipant {
  user?: (IdRef & { email?: string; designation?: string; role?: string }) | string | null;
  name: string;
  role?: string;
  attendance?: "INVITED" | "PRESENT" | "ABSENT";
}

export interface MeetingSummary {
  _id: string;
  meetingId?: string;
  title: string;
  agenda?: string;
  type: string;
  scheduledAt: string;
  durationMinutes?: number;
  mode?: string;
  location?: string | null;
  visibility?: string;
  status: string;
  organizer?: UserRef | null;
  department?: IdRef | string | null;
  createdAt?: string;
}

export interface MeetingDetailData extends MeetingSummary {
  participants?: MeetingParticipant[];
  minutes?: {
    content?: string;
    status?: string;
    draftedBy?: UserRef | string | null;
    approvedBy?: UserRef | string | null;
    approvedAt?: string | null;
    aiSummary?: string;
    aiGeneratedAt?: string | null;
  };
  tasks?: MeetingTaskItem[];
}

export function participantName(participant: MeetingParticipant): string {
  if (participant.name) return participant.name;
  if (participant.user && typeof participant.user === "object") return participant.user.name;
  return "Guest";
}

export function participantUserId(participant: MeetingParticipant): string | null {
  if (!participant.user) return null;
  return typeof participant.user === "string" ? participant.user : participant.user._id ?? participant.user.id ?? null;
}
