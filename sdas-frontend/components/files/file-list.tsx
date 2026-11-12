"use client";

import Link from "next/link";
import { AlertTriangle, FilePlus2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PageHeader,
  PriorityBadge,
  StatusBadge,
  Table,
  TableLink,
  TableWrap,
  Td,
  Th,
} from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta, DigitalFileSummary, ReferenceCatalogs } from "@/lib/types";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import { CONFIDENTIALITY_LEVELS, FILE_STATUSES, PRIORITIES, toOptions } from "@/lib/workflow";

export function FileList({
  title,
  description,
  registerHref,
  defaultStatus = "",
  showDepartmentFilter = false,
}: {
  title: string;
  description: string;
  registerHref?: string;
  defaultStatus?: string;
  showDepartmentFilter?: boolean;
}) {
  const { permissions } = useAuth();
  const [items, setItems] = useState<DigitalFileSummary[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(defaultStatus);
  const [priority, setPriority] = useState("");
  const [confidentiality, setConfidentiality] = useState("");
  const [department, setDepartment] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQ(q);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then((data) => {
        if (!cancelled) setCatalogs(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (appliedQ) params.set("q", appliedQ);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (confidentiality) params.set("confidentiality", confidentiality);
    if (department) params.set("department", department);
    if (overdue) params.set("overdue", "true");

    setLoading(true);
    setError("");
    api
      .list<DigitalFileSummary>(`/files?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, status, priority, confidentiality, department, overdue]);

  const hasFilters = Boolean(appliedQ || status || priority || confidentiality || department || overdue);

  const departmentOptions = useMemo(
    () => (catalogs?.departments ?? []).map((item) => ({ value: item._id, label: item.name })),
    [catalogs],
  );

  function reset() {
    setQ("");
    setAppliedQ("");
    setStatus(defaultStatus);
    setPriority("");
    setConfidentiality("");
    setDepartment("");
    setOverdue(false);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        eyebrow="Digital file tracking"
        actions={
          registerHref && permissions.includes("file.register") ? (
            <Link href={registerHref} className={buttonVariants({ size: "sm" })}>
              <FilePlus2 className="size-3.5" aria-hidden />
              Register file
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search file number or subject"
          className="w-full sm:w-72"
        />
        <FilterSelect
          label="Status"
          value={status}
          placeholder="All statuses"
          options={toOptions(FILE_STATUSES)}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Priority"
          value={priority}
          placeholder="All priorities"
          options={toOptions(PRIORITIES)}
          onChange={(value) => {
            setPriority(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Confidentiality"
          value={confidentiality}
          placeholder="All classifications"
          options={toOptions(CONFIDENTIALITY_LEVELS)}
          onChange={(value) => {
            setConfidentiality(value);
            setPage(1);
          }}
        />
        {showDepartmentFilter ? (
          <FilterSelect
            label="Department"
            value={department}
            placeholder="All departments"
            options={departmentOptions}
            onChange={(value) => {
              setDepartment(value);
              setPage(1);
            }}
          />
        ) : null}
        <button
          type="button"
          onClick={() => {
            setOverdue((value) => !value);
            setPage(1);
          }}
          aria-pressed={overdue}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
            overdue
              ? "border-danger/40 bg-danger-soft text-danger"
              : "border-input bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          SLA overdue
        </button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading files…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No files match these filters" : "No files registered yet"}
            description={
              hasFilters
                ? "Try clearing the filters or searching with a different keyword."
                : "Registered files, their current custodian and movement history will appear here."
            }
            action={
              registerHref && permissions.includes("file.register") ? (
                <Link href={registerHref} className={buttonVariants({ size: "sm" })}>
                  <FilePlus2 className="size-3.5" aria-hidden />
                  Register file
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>File</Th>
                    <Th>Department</Th>
                    <Th>Status</Th>
                    <Th>Priority</Th>
                    <Th>Classification</Th>
                    <Th>Custodian</Th>
                    <Th>SLA</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const overdueRow =
                      item.sla?.dueAt &&
                      !["COMPLETED", "ARCHIVED", "RETURNED"].includes(item.status) &&
                      new Date(item.sla.dueAt).getTime() < Date.now();
                    return (
                      <tr key={item._id} className="group">
                        <Td>
                          <div className="max-w-[250px]">
                            <Link
                              href={`/files/${item._id}`}
                              className="line-clamp-1 font-semibold text-foreground group-hover:text-primary"
                            >
                              {item.subject}
                            </Link>
                            <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                              {item.fileNumber ?? item.fileId ?? item._id}
                            </p>
                          </div>
                        </Td>
                        <Td>
                          <span className="text-muted-foreground">{item.department?.name ?? "—"}</span>
                        </Td>
                        <Td>
                          <StatusBadge status={item.status} />
                        </Td>
                        <Td>
                          <PriorityBadge priority={item.priority} />
                        </Td>
                        <Td>
                          <Badge
                            variant={
                              item.confidentiality === "RESTRICTED" || item.confidentiality === "CONFIDENTIAL"
                                ? "danger"
                                : item.confidentiality === "PUBLIC"
                                  ? "success"
                                  : "neutral"
                            }
                          >
                            {item.confidentiality ?? "INTERNAL"}
                          </Badge>
                        </Td>
                        <Td>
                          <span className="text-muted-foreground">{item.currentCustodian?.name ?? "—"}</span>
                        </Td>
                        <Td>
                          <span
                            className={cn(
                              "whitespace-nowrap text-[11.5px]",
                              overdueRow ? "font-semibold text-danger" : "text-muted-foreground",
                            )}
                          >
                            {item.sla?.dueAt
                              ? overdueRow
                                ? `Overdue ${relativeTime(item.sla.dueAt)}`
                                : `Due ${formatDate(item.sla.dueAt)}`
                              : "—"}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <TableLink href={`/files/${item._id}`}>Open</TableLink>
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
    </div>
  );
}
