export const GRIEVANCE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "RECEIVED",
  "UNDER_VERIFICATION",
  "ASSIGNED",
  "UNDER_INVESTIGATION",
  "ACTION_TAKEN",
  "PENDING_APPROVAL",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "REJECTED",
] as const;

export const FILE_STATUSES = [
  "REGISTERED",
  "DOCUMENTS_UPLOADED",
  "QR_GENERATED",
  "DISPATCHED",
  "RECEIVED",
  "UNDER_REVIEW",
  "NOTING_ADDED",
  "FORWARDED",
  "APPROVAL_PENDING",
  "APPROVED",
  "RETURNED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_VERIFICATION",
  "DOCUMENT_PENDING",
  "UNDER_REVIEW",
  "PENDING_DECISION",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const CONFIDENTIALITY_LEVELS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;
export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "OVERDUE", "CANCELLED"] as const;

export const GRIEVANCE_ACTIONS = ["INTERNAL_NOTE", "EVIDENCE", "ATR"] as const;

export function toOptions(items: readonly string[], labels?: Record<string, string>) {
  return items.map((value) => ({
    value,
    label: labels?.[value] ?? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
}
