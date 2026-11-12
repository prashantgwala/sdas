"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  Upload,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { EmptyState, PriorityBadge, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { Role } from "@/lib/types";
import type { FileDocument } from "@/components/files/types";
import { OcrActions } from "@/components/documents/ocr-actions";
import { cn, formatDate, formatDateTime, relativeTime, titleCase } from "@/lib/utils";
import { ApplicationWorkflow } from "./application-workflow";
import {
  applicationFields,
  fieldLabel,
  type ApplicationDetailData,
  type CompletenessData,
} from "./types";

const BACK_LINKS: Record<Role, string> = {
  CITIZEN: "/citizen/applications",
  CLERK: "/clerk/applications",
  OFFICER: "/officer/applications",
  DEPARTMENT_HEAD: "/dept-head/applications",
  DISTRICT_ADMIN: "/district/applications",
  SUPER_ADMIN: "/admin",
};

export function ApplicationDetail({ id }: { id: string }) {
  const { user, permissions } = useAuth();
  const [application, setApplication] = useState<ApplicationDetailData | null>(null);
  const [completeness, setCompleteness] = useState<CompletenessData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const detail = await api.get<ApplicationDetailData>(`/applications/${id}`);
      setApplication(detail);
      try {
        setCompleteness(await api.get<CompletenessData>(`/applications/${id}/completeness`));
      } catch {
        setCompleteness(null);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadDocuments() {
    const files = inputRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("entityType", "APPLICATION");
      form.append("entityId", id);
      form.append("category", "APPLICATION");
      Array.from(files).forEach((item) => form.append("files", item));
      await api.upload<FileDocument[]>("/documents", form);
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (cause) {
      setUploadError(errorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading application" />;

  if (error || !application) {
    return (
      <div>
        <Link
          href={user ? BACK_LINKS[user.role] : "/login"}
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to applications
        </Link>
        <Alert variant="error" title="Unable to load this application">
          {error || "The application could not be found."}
        </Alert>
      </div>
    );
  }

  const fields = applicationFields(application.type?.formFieldSchema);
  const formEntries: Array<{ label: string; value: string }> =
    fields.length > 0
      ? fields.map((field) => ({ label: field.label, value: fieldLabel(application.formData?.[field.key]) }))
      : Object.entries(application.formData ?? {}).map(([key, value]) => ({
          label: titleCase(key),
          value: fieldLabel(value),
        }));

  const overdue =
    application.sla?.dueAt &&
    !["APPROVED", "REJECTED", "CLOSED"].includes(application.status) &&
    new Date(application.sla.dueAt).getTime() < Date.now();

  const isOwner = String(application.citizen?._id ?? "") === user?.id;
  const canUpload = isOwner || permissions.includes("application.verify");

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={user ? BACK_LINKS[user.role] : "/login"}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to applications
        </Link>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11.5px] font-semibold text-primary">
              {application.applicationId ?? application._id}
            </span>
            <StatusBadge status={application.status} />
            <PriorityBadge priority={application.priority} />
            {application.duplicateWarning ? <Badge variant="warning">Possible duplicate</Badge> : null}
            {overdue ? <Badge variant="danger">SLA overdue</Badge> : null}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {application.type?.name ?? "Service application"}
          </h1>
          <p className="text-[12px] text-muted-foreground">
            Submitted {application.submittedAt ? formatDateTime(application.submittedAt) : formatDateTime(application.createdAt)}
            {application.department?.name ? ` · ${application.department.name}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <SectionCard title="Application details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail icon={UserRound} label="Applicant" value={application.citizen?.name ?? "—"} />
              <Detail icon={Building2} label="Department" value={application.department?.name ?? "—"} />
              <Detail icon={UserRound} label="Assigned officer" value={application.assignedOfficer?.name ?? "Not assigned"} />
              <Detail icon={FileText} label="Service" value={application.type?.name ?? "—"} />
            </div>
            {formEntries.length > 0 ? (
              <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                {formEntries.map((entry) => (
                  <div key={entry.label}>
                    <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {entry.label}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-line text-[12.5px] font-medium text-foreground">
                      {entry.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </SectionCard>

          {completeness ? (
            <SectionCard
              title="Completeness"
              description="Required form fields and documents"
              action={
                <Badge variant={completeness.completeness === 100 ? "success" : "warning"}>
                  {completeness.completeness}% complete
                </Badge>
              }
            >
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    completeness.completeness === 100 ? "bg-success" : "bg-warning",
                  )}
                  style={{ width: `${completeness.completeness}%` }}
                />
              </div>
              {completeness.missingFields.length === 0 &&
              completeness.missingDocuments.length === 0 ? (
                <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-success">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  All required information and documents are present.
                </p>
              ) : (
                <div className="mt-3 space-y-2 text-[12px]">
                  {completeness.missingFields.length > 0 ? (
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">Missing fields:</span>{" "}
                      {completeness.missingFields.join(", ")}
                    </p>
                  ) : null}
                  {completeness.missingDocuments.length > 0 ? (
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">Missing documents:</span>{" "}
                      {completeness.missingDocuments.map((document) => document.label).join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title="Document checklist" description="Verified by the receiving clerk">
            {!application.checklist || application.checklist.length === 0 ? (
              <EmptyState compact title="No checklist items" />
            ) : (
              <ul className="divide-y divide-border">
                {application.checklist.map((item) => (
                  <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-full text-[10px] font-bold",
                          item.verified
                            ? "bg-success-soft text-success"
                            : item.provided
                              ? "bg-warning-soft text-warning"
                              : "bg-muted text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        {item.verified ? "✓" : item.provided ? "•" : "—"}
                      </span>
                      <span className="text-[12.5px] font-medium text-foreground">{item.label}</span>
                      {item.required ? <Badge variant="outline">Required</Badge> : null}
                    </div>
                    <Badge variant={item.verified ? "success" : item.provided ? "warning" : "neutral"}>
                      {item.verified ? "Verified" : item.provided ? "Provided" : "Pending"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Documents"
            description="Supporting documents uploaded for this application"
            action={
              canUpload ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="block max-w-[190px] text-[11px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary-soft file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-primary"
                  />
                  <Button size="sm" variant="secondary" onClick={uploadDocuments} disabled={uploading}>
                    <Upload className="size-3.5" aria-hidden />
                    {uploading ? "Uploading…" : "Upload"}
                  </Button>
                </div>
              ) : undefined
            }
          >
            {uploadError ? (
              <div className="mb-3">
                <Alert variant="error">{uploadError}</Alert>
              </div>
            ) : null}
            {!application.documents || application.documents.length === 0 ? (
              <EmptyState
                compact
                title="No documents uploaded"
                description="Upload PDF or image copies of the required documents."
              />
            ) : (
              <ul className="divide-y divide-border">
                {application.documents.map((document) => (
                  <li key={document._id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-foreground">{document.originalName}</p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {document.mimeType ?? "Document"}
                          {document.size ? ` · ${Math.max(1, Math.round(document.size / 1024))} KB` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <OcrActions
                        documentId={document._id}
                        documentName={document.originalName}
                        onUpdated={() => void load()}
                      />
                      <a
                        href={`/api/v1/documents/${document._id}/download`}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
                      >
                        <Download className="size-3" aria-hidden />
                        Download
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {application.reviewNotes ? (
            <SectionCard
              title="Review notes"
              description={application.reviewedAt ? `Reviewed ${formatDateTime(application.reviewedAt)}` : undefined}
            >
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">
                {application.reviewNotes}
              </p>
            </SectionCard>
          ) : null}

          {application.decision?.outcome ? (
            <SectionCard title="Decision">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={application.decision.outcome} />
                {application.decision.decidedAt ? (
                  <span className="text-[11.5px] text-muted-foreground">
                    {formatDateTime(application.decision.decidedAt)}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-foreground">{application.decision.reason}</p>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-5">
          <SectionCard title="Service deadline">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg",
                  overdue ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary",
                )}
              >
                <CalendarClock className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {application.sla?.dueAt ? formatDate(application.sla.dueAt) : "Not scheduled"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {application.sla?.dueAt
                    ? overdue
                      ? `Overdue since ${relativeTime(application.sla.dueAt)}`
                      : `Due ${relativeTime(application.sla.dueAt)}`
                    : "A deadline is set when the application is submitted."}
                </p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-border pt-3 text-[11.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">SLA status</dt>
                <dd className="font-medium text-foreground">{titleCase(application.sla?.status ?? "—")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Applicant</dt>
                <dd className="max-w-[180px] truncate font-medium text-foreground">
                  {application.citizen?.name ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Assigned officer</dt>
                <dd className="max-w-[180px] truncate font-medium text-foreground">
                  {application.assignedOfficer?.name ?? "Not assigned"}
                </dd>
              </div>
            </dl>
          </SectionCard>

          <ApplicationWorkflow application={application} onUpdated={load} />
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[12.5px] font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
