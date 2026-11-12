import type { DigitalFileSummary, IdRef, UserRef } from "@/lib/types";

export interface FileDocument {
  _id: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  ocrStatus?: string | null;
  createdAt?: string;
}

export interface FileMovementItem {
  _id: string;
  movementNumber: string;
  fromUser?: UserRef | null;
  toUser?: UserRef | null;
  fromDepartment?: IdRef | null;
  toDepartment?: IdRef | null;
  dispatchedAt: string;
  receivedAt?: string | null;
  actionRequired?: string;
  remarks?: string;
  status: string;
  receivedVia?: string | null;
}

export interface FileNoteItem {
  _id: string;
  text: string;
  visibility?: string;
  decision?: string;
  author?: UserRef | null;
  documents?: FileDocument[];
  createdAt: string;
}

export interface FileDetailData extends DigitalFileSummary {
  description?: string;
  originatingOffice?: IdRef | null;
  createdBy?: UserRef | null;
  attachments?: FileDocument[];
  movements?: FileMovementItem[];
  notes?: FileNoteItem[];
  qrVersion?: number;
  qrGeneratedAt?: string | null;
  retentionDays?: number | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  finalAction?: string | null;
}

export interface QrPayload {
  token: string;
  dataUrl: string;
  version: number;
  generatedAt?: string | null;
}
