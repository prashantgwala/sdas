"use client";

import Link from "next/link";
import { Download, FileText, FolderKanban, Paperclip, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, PageHeader, Table, TableLink, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta, UserRef } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/utils";

interface MyDocumentItem {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category?: string;
  entityType: string;
  entityId: string;
  confidentiality?: string;
  ocrStatus?: string;
  createdAt: string;
  uploadedBy?: UserRef | null;
}

const ENTITY_OPTIONS = [
  { value: "GRIEVANCE", label: "Grievance attachment" },
  { value: "APPLICATION", label: "Application document" },
  { value: "OTHER", label: "Other document" },
];

function recordHref(document: MyDocumentItem): string | null {
  if (document.entityType === "GRIEVANCE") return `/grievances/${document.entityId}`;
  if (document.entityType === "APPLICATION") return `/applications/${document.entityId}`;
  return null;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentLibrary() {
  const [items, setItems] = useState<MyDocumentItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQ(q);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "15" });
    if (appliedQ) params.set("q", appliedQ);
    if (entityType) params.set("entityType", entityType);

    setLoading(true);
    setError("");
    api
      .list<MyDocumentItem>(`/documents/mine?${params.toString()}`, { signal: controller.signal })
      .then((result) => {
        setItems(result.items);
        setMeta(result.meta);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, appliedQ, entityType, reloadKey]);

  async function remove(document: MyDocumentItem) {
    if (!window.confirm(`Remove "${document.originalName}" from your documents?`)) return;
    setDeleting(document._id);
    setError("");
    setNotice("");
    try {
      await api.delete<{ deleted: boolean }>(`/documents/${document._id}`);
      setNotice("Document removed.");
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="My documents"
        description="Every document you have uploaded with your grievances and applications, in one place."
        eyebrow="Records"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search document name or category"
          className="w-full sm:w-72"
        />
        <FilterSelect
          label="Linked to"
          value={entityType}
          placeholder="All documents"
          options={ENTITY_OPTIONS}
          onChange={(value) => {
            setEntityType(value);
            setPage(1);
          }}
        />
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading your documents…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={appliedQ || entityType ? "No documents match these filters" : "No documents uploaded yet"}
            description={
              appliedQ || entityType
                ? "Clear the filters to see your full document library."
                : "Attach supporting documents while submitting a grievance or application and they will appear here."
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Document</Th>
                    <Th>Linked record</Th>
                    <Th>Category</Th>
                    <Th>Size</Th>
                    <Th>Uploaded</Th>
                    <Th>OCR</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((document) => {
                    const href = recordHref(document);
                    return (
                      <tr key={document._id} className="group">
                        <Td>
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                              {document.entityType === "APPLICATION" ? (
                                <FileText className="size-3.5" aria-hidden />
                              ) : document.entityType === "GRIEVANCE" ? (
                                <Paperclip className="size-3.5" aria-hidden />
                              ) : (
                                <FolderKanban className="size-3.5" aria-hidden />
                              )}
                            </span>
                            <div className="min-w-0 max-w-[260px]">
                              <p className="truncate text-[12.5px] font-semibold text-foreground">
                                {document.originalName}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                {document.mimeType}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          {href ? (
                            <TableLink href={href}>{titleCase(document.entityType)}</TableLink>
                          ) : (
                            <span className="text-muted-foreground">{titleCase(document.entityType)}</span>
                          )}
                        </Td>
                        <Td>
                          <span className="text-muted-foreground">{document.category ? titleCase(document.category) : "—"}</span>
                        </Td>
                        <Td>
                          <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                            {formatSize(document.size)}
                          </span>
                        </Td>
                        <Td>
                          <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                            {formatDate(document.createdAt)}
                          </span>
                        </Td>
                        <Td>
                          <Badge
                            variant={
                              document.ocrStatus === "VERIFIED" || document.ocrStatus === "PROCESSED"
                                ? "success"
                                : document.ocrStatus === "FAILED"
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {document.ocrStatus ? titleCase(document.ocrStatus) : "Pending"}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={`/api/v1/documents/${document._id}/download`}
                              className="inline-flex size-8 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary-soft"
                              title="Download document"
                              aria-label={`Download ${document.originalName}`}
                            >
                              <Download className="size-3.5" aria-hidden />
                            </a>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void remove(document)}
                              disabled={deleting === document._id}
                              title="Remove document"
                              aria-label={`Remove ${document.originalName}`}
                              className="text-muted-foreground hover:text-danger"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <div className="mt-4">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          </>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Accepted formats: PDF, JPEG, PNG and WebP. Each file can be up to the configured upload limit.{" "}
        <Link href="/citizen/grievances/new" className="font-semibold text-primary hover:underline">
          Submit a grievance
        </Link>{" "}
        or{" "}
        <Link href="/citizen/applications/new" className="font-semibold text-primary hover:underline">
          start an application
        </Link>{" "}
        to add more documents.
      </p>
    </div>
  );
}
