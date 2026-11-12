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
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta, GrievanceSummary, ReferenceCatalogs } from "@/lib/types";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import { GRIEVANCE_STATUSES, PRIORITIES, toOptions } from "@/lib/workflow";

export function GrievanceList({
  title,
  description,
  createHref,
  defaultStatus,
  defaultOverdue = false,
  showDepartmentFilter = false,
}: {
  title: string;
  description: string;
  createHref?: string;
  defaultStatus?: string;
  defaultOverdue?: boolean;
  showDepartmentFilter?: boolean;
}) {
  const { permissions } = useAuth();
  const [items, setItems] = useState<GrievanceSummary[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(defaultStatus ?? "");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [overdue, setOverdue] = useState(defaultOverdue);
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const categoryOptions = useMemo(() => {
    const categories = catalogs?.grievanceCategories ?? [];
    return categories
      .filter((item) => !item.parent)
      .map((item) => ({ value: item._id, label: item.name }));
  }, [catalogs]);

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
    if (category) params.set("category", category);
    if (department) params.set("department", department);
    if (overdue) params.set("overdue", "true");

    setLoading(true);
    setError("");
    api
      .list<GrievanceSummary>(`/grievances?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, status, priority, category, department, overdue, reloadKey]);

  const hasFilters = Boolean(appliedQ || status || priority || category || department || overdue);

  function reset() {
    setQ("");
    setAppliedQ("");
    setStatus(defaultStatus ?? "");
    setPriority("");
    setCategory("");
    setDepartment("");
    setOverdue(defaultOverdue);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        eyebrow="Grievance management"
        actions={
          createHref && permissions.includes("grievance.create") ? (
            <Link href={createHref} className={buttonVariants({ size: "sm" })}>
              <FilePlus2 className="size-3.5" aria-hidden />
              Register grievance
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search subject, description or ID"
          className="w-full sm:w-72"
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          placeholder="All statuses"
          options={toOptions(GRIEVANCE_STATUSES)}
        />
        <FilterSelect
          label="Priority"
          value={priority}
          onChange={(value) => {
            setPriority(value);
            setPage(1);
          }}
          placeholder="All priorities"
          options={toOptions(PRIORITIES)}
        />
        <FilterSelect
          label="Category"
          value={category}
          onChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
          placeholder="All categories"
          options={categoryOptions}
        />
        {showDepartmentFilter ? (
          <FilterSelect
            label="Department"
            value={department}
            onChange={(value) => {
              setDepartment(value);
              setPage(1);
            }}
            placeholder="All departments"
            options={(catalogs?.departments ?? []).map((item) => ({ value: item._id, label: item.name }))}
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
          <LoadingBlock label="Loading grievances…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No grievances match these filters" : "No grievances yet"}
            description={
              hasFilters
                ? "Try clearing the filters or searching with a different keyword."
                : "Grievances registered with the district will appear here with their current status and deadline."
            }
            action={
              createHref && permissions.includes("grievance.create") ? (
                <Link href={createHref} className={buttonVariants({ size: "sm" })}>
                  <FilePlus2 className="size-3.5" aria-hidden />
                  Register grievance
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
                    <Th>Grievance</Th>
                    <Th>Category</Th>
                    <Th>Status</Th>
                    <Th>Priority</Th>
                    <Th>Assigned to</Th>
                    <Th>SLA</Th>
                    <Th>Filed</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const overdueRow =
                      item.sla?.dueAt &&
                      !["RESOLVED", "CLOSED", "REJECTED"].includes(item.status) &&
                      new Date(item.sla.dueAt).getTime() < Date.now();
                    return (
                      <tr key={item._id} className="group">
                        <Td>
                          <div className="max-w-[260px]">
                            <Link
                              href={`/grievances/${item._id}`}
                              className="line-clamp-1 font-semibold text-foreground group-hover:text-primary"
                            >
                              {item.subject}
                            </Link>
                            <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                              {item.grievanceId ?? item._id}
                            </p>
                          </div>
                        </Td>
                        <Td>
                          <span className="text-muted-foreground">{item.category?.name ?? "Unclassified"}</span>
                        </Td>
                        <Td>
                          <StatusBadge status={item.status} />
                        </Td>
                        <Td>
                          <PriorityBadge priority={item.priority} />
                        </Td>
                        <Td>
                          <span className="text-muted-foreground">
                            {item.assignedOfficer?.name ?? "Unassigned"}
                          </span>
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
                        <Td>
                          <span className="whitespace-nowrap text-muted-foreground">
                            {formatDate(item.createdAt)}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <TableLink href={`/grievances/${item._id}`}>View</TableLink>
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
