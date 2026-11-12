import type { ApplicationSummary, IdRef, UserRef } from "@/lib/types";
import type { FileDocument } from "@/components/files/types";

export interface FormField {
  key: string;
  label: string;
  type: "text" | "number" | "textarea" | "select" | "date" | string;
  required?: boolean;
  options?: string[];
}

export interface ApplicationTypeOption {
  _id: string;
  name: string;
  code: string;
  description?: string;
  department?: IdRef | string | null;
  requiredDocuments?: Array<{ key: string; label: string; required: boolean }>;
  formFieldSchema?: { fields?: FormField[] } | Record<string, unknown>;
  active?: boolean;
}

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  provided: boolean;
  verified: boolean;
  document?: FileDocument | null;
  remarks?: string;
}

export interface ApplicationDetailData extends ApplicationSummary {
  formData: Record<string, unknown>;
  type?: (IdRef & { description?: string; requiredDocuments?: Array<{ key: string; label: string; required: boolean }>; formFieldSchema?: { fields?: FormField[] } | Record<string, unknown> }) | null;
  citizen?: UserRef | null;
  assignedClerk?: UserRef | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: UserRef | null;
  checklist?: ChecklistItem[];
  missingDocuments?: string[];
  documents?: FileDocument[];
  duplicateWarning?: boolean;
  decision?: {
    outcome?: string;
    reason?: string;
    decidedAt?: string | null;
    decidedBy?: UserRef | null;
  } | null;
}

export interface CompletenessData {
  completeness: number;
  missingFields: string[];
  missingDocuments: Array<{ key: string; label: string }>;
  totalRequired: number;
}

export function applicationFields(
  schema?: { fields?: FormField[] } | Record<string, unknown> | null,
): FormField[] {
  if (!schema || typeof schema !== "object") return [];
  const fields = (schema as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (field): field is FormField =>
      typeof field === "object" && field !== null && typeof (field as FormField).key === "string",
  );
}

export function fieldLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(fieldLabel).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
