"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  Download,
  FileText,
  History,
  QrCode,
  Upload,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PriorityBadge,
  SectionCard,
  StatusBadge,
} from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { Role } from "@/lib/types";
import { cn, formatDate, formatDateTime, relativeTime, titleCase } from "@/lib/utils";
import { OcrActions } from "@/components/documents/ocr-actions";
import { FileWorkflow } from "./file-workflow";
import type { FileDetailData, FileDocument, QrPayload } from "./types";

const BACK_LINKS: Record<Role, string> = {
  CITIZEN: "/citizen/documents",
  CLERK: "/clerk/files",
  OFFICER: "/officer/files",
  DEPARTMENT_HEAD: "/dept-head/files",
  DISTRICT_ADMIN: "/district/files",
  SUPER_ADMIN: "/admin",
};

export function FileDetail({ id }: { id: string }) {
  const { user, permissions } = useAuth();
  const [file, setFile] = useState<FileDetailData | null>(null);
  const [documents, setDocuments] = useState<FileDocument[]>([]);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [qrError, setQrError] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const detail = await api.get<FileDetailData>(`/files/${id}`);
      setFile(detail);
      const docs = await api.list<FileDocument>(`/documents?entityType=FILE&entityId=${id}&limit=100`);
      setDocuments(docs.items);
      if (detail.qrVersion) {
        try {
          setQr(await api.get<QrPayload>(`/files/${id}/qr`));
        } catch {
          setQr(null);
        }
      } else {
        setQr(null);
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

  async function generateQr() {
    setQrBusy(true);
    setQrError("");
    try {
      const payload = await api.post<QrPayload>(`/files/${id}/qr`);
      setQr(payload);
      await load();
    } catch (cause) {
      setQrError(errorMessage(cause));
    } finally {
      setQrBusy(false);
    }
  }

  async function uploadDocuments() {
    const files = inputRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setDocumentError("");
    try {
      const form = new FormData();
      form.append("entityType", "FILE");
      form.append("entityId", id);
      form.append("category", "FILE");
      Array.from(files).forEach((item) => form.append("files", item));
      await api.upload<FileDocument[]>("/documents", form);
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (cause) {
      setDocumentError(errorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading file" />;

  if (error || !file) {
    return (
      <div>
        <Link
          href={user ? BACK_LINKS[user.role] : "/login"}
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to files
        </Link>
        <Alert variant="error" title="Unable to load this file">
          {error || "The file could not be found."}
        </Alert>
      </div>
    );
  }

  const overdue =
    file.sla?.dueAt &&
    !["COMPLETED", "ARCHIVED", "RETURNED"].includes(file.status) &&
    new Date(file.sla.dueAt).getTime() < Date.now();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={user ? BACK_LINKS[user.role] : "/login"}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to files
        </Link>
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11.5px] font-semibold text-primary">
              {file.fileNumber ?? file.fileId ?? file._id}
            </span>
            <StatusBadge status={file.status} />
            <PriorityBadge priority={file.priority} />
            <Badge
              variant={
                file.confidentiality === "RESTRICTED" || file.confidentiality === "CONFIDENTIAL"
                  ? "danger"
                  : file.confidentiality === "PUBLIC"
                    ? "success"
                    : "neutral"
              }
            >
              {file.confidentiality ?? "INTERNAL"}
            </Badge>
            {overdue ? (
              <Badge variant="danger">
                <AlertTriangle className="mr-1 size-3" aria-hidden />
                SLA overdue
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{file.subject}</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Registered {formatDateTime(file.createdAt)}
            {file.currentLocation ? ` · Currently at ${file.currentLocation}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <SectionCard title="File details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail icon={Building2} label="Department" value={file.department?.name ?? "—"} />
              <Detail icon={FileText} label="Category" value={file.category?.name ?? "Uncategorised"} />
              <Detail icon={UserRound} label="Current custodian" value={file.currentCustodian?.name ?? "—"} />
              <Detail icon={History} label="Registered by" value={file.createdBy?.name ?? "—"} />
            </div>
            {file.description ? (
              <p className="mt-4 whitespace-pre-line border-t border-border pt-4 text-[13px] leading-relaxed text-foreground">
                {file.description}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Movements"
            description="Dispatch and receipt history of this file"
          >
            {!file.movements || file.movements.length === 0 ? (
              <EmptyState compact title="No movements yet" description="Dispatch the file to start the movement trail." />
            ) : (
              <div className="scrollbar-slim -mx-4 overflow-x-auto sm:-mx-5">
                <div className="inline-block min-w-full px-4 sm:px-5">
                  <table className="w-full min-w-[560px] text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="py-2 pr-3 font-semibold">Movement</th>
                        <th className="py-2 pr-3 font-semibold">From → To</th>
                        <th className="py-2 pr-3 font-semibold">Action</th>
                        <th className="py-2 pr-3 font-semibold">Dispatched</th>
                        <th className="py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {file.movements.map((movement) => (
                        <tr key={movement._id} className="border-b border-border/70 align-top">
                          <td className="py-2.5 pr-3 font-mono text-[10.5px] text-muted-foreground">
                            {movement.movementNumber}
                          </td>
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-foreground">
                              {movement.fromUser?.name ?? "—"} → {movement.toUser?.name ?? "—"}
                            </p>
                            <p className="text-[10.5px] text-muted-foreground">
                              {movement.fromDepartment?.name ?? ""} → {movement.toDepartment?.name ?? ""}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{titleCase(movement.actionRequired ?? "—")}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{formatDate(movement.dispatchedAt)}</td>
                          <td className="py-2.5">
                            <StatusBadge status={movement.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Notes & decisions" description="Internal noting trail">
            {!file.notes || file.notes.length === 0 ? (
              <EmptyState compact title="No notes recorded" />
            ) : (
              <ul className="space-y-3">
                {file.notes.map((note) => (
                  <li key={note._id} className="rounded-lg border border-border bg-surface-muted/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {note.decision && note.decision !== "NONE" ? (
                        <Badge variant={note.decision === "APPROVED" ? "success" : note.decision === "RETURNED" ? "danger" : "info"}>
                          {titleCase(note.decision)}
                        </Badge>
                      ) : null}
                      {note.visibility && note.visibility !== "INTERNAL" ? (
                        <Badge variant="outline">{titleCase(note.visibility)}</Badge>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">
                        {note.author?.name ? `${note.author.name} · ` : ""}
                        {formatDateTime(note.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-foreground">{note.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Documents"
            description="PDF and image scans attached to this file"
            action={
              permissions.includes("file.upload") ? (
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
            {documentError ? (
              <div className="mb-3">
                <Alert variant="error">{documentError}</Alert>
              </div>
            ) : null}
            {documents.length === 0 ? (
              <EmptyState compact title="No documents attached" description="Upload a PDF or image scan to link it with this file." />
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((document) => (
                  <li key={document._id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-foreground">{document.originalName}</p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {document.mimeType ?? "Document"}
                          {document.size ? ` · ${Math.max(1, Math.round(document.size / 1024))} KB` : ""}
                          {document.createdAt ? ` · ${formatDate(document.createdAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <OcrActions
                        documentId={document._id}
                        documentName={document.originalName}
                        ocrStatus={document.ocrStatus}
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
                  {file.sla?.dueAt ? formatDate(file.sla.dueAt) : "Not scheduled"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {file.sla?.dueAt
                    ? overdue
                      ? `Overdue since ${relativeTime(file.sla.dueAt)}`
                      : `Due ${relativeTime(file.sla.dueAt)}`
                    : "A deadline is set when the file is registered."}
                </p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-border pt-3 text-[11.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">SLA status</dt>
                <dd className="font-medium text-foreground">{titleCase(file.sla?.status ?? "—")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Retention</dt>
                <dd className="font-medium text-foreground">
                  {file.retentionDays ? `${file.retentionDays} days` : "Category default"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Completed</dt>
                <dd className="font-medium text-foreground">
                  {file.completedAt ? formatDate(file.completedAt) : "—"}
                </dd>
              </div>
            </dl>
          </SectionCard>

          <section className="card-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13.5px] font-semibold text-foreground">QR receipt</h2>
              {permissions.includes("file.qr.generate") && file.status !== "COMPLETED" && file.status !== "ARCHIVED" ? (
                <Button size="sm" variant="secondary" onClick={generateQr} disabled={qrBusy}>
                  <QrCode className="size-3.5" aria-hidden />
                  {qr ? "Regenerate" : "Generate"}
                </Button>
              ) : null}
            </div>
            {qrError ? (
              <div className="mt-3">
                <Alert variant="error">{qrError}</Alert>
              </div>
            ) : null}
            {qr ? (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr.dataUrl}
                  alt={`QR code for file ${file.fileNumber ?? file.fileId}`}
                  className="mx-auto size-44 rounded-lg border border-border bg-white p-2"
                />
                <p className="mt-2 text-center text-[10.5px] text-muted-foreground">
                  Version {qr.version}
                  {qr.generatedAt ? ` · ${formatDate(qr.generatedAt)}` : ""}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                Generate a signed QR receipt to verify file handover physically.
              </p>
            )}
          </section>

          <FileWorkflow file={file} onUpdated={load} />
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
