"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock3, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Pagination } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta, GrievanceSummary } from "@/lib/types";
import { cn, formatDate, relativeTime } from "@/lib/utils";

export interface DeadlineView {
  key: string;
  label: string;
  description: string;
  params: Record<string, string>;
  tone?: "primary" | "warning" | "danger" | "info" | "neutral";
}

const toneStyles: Record<NonNullable<DeadlineView["tone"]>, { active: string; icon: string }> = {
  primary: { active: "border-primary/45 bg-primary-soft text-primary", icon: "bg-primary-soft text-primary" },
  warning: { active: "border-warning/45 bg-warning-soft text-warning", icon: "bg-warning-soft text-warning" },
  danger: { active: "border-danger/45 bg-danger-soft text-danger", icon: "bg-danger-soft text-danger" },
  info: { active: "border-info/45 bg-info-soft text-info", icon: "bg-info-soft text-info" },
  neutral: { active: "border-border bg-muted text-foreground", icon: "bg-muted text-muted-foreground" },
};

const viewIcons = [CalendarClock, Clock3, AlertTriangle, ShieldAlert];

export function GrievanceDeadlineMonitor({
  title,
  description,
  eyebrow,
  views,
  showDepartment = false,
}: {
  title: string;
  description: string;
  eyebrow: string;
  views: DeadlineView[];
  showDepartment?: boolean;
}) {
  const viewsKey = JSON.stringify(views.map((view) => [view.key, view.params]));
  const [activeKey, setActiveKey] = useState(views[0]?.key ?? "");
  const active = views.find((view) => view.key === activeKey) ?? views[0];
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [items, setItems] = useState<GrievanceSummary[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const parsed: Array<[string, Record<string, string>]> = JSON.parse(viewsKey);
    setCounts({});
    Promise.all(
      parsed.map(async ([key, params]) => {
        const search = new URLSearchParams({ ...params, limit: "1" });
        const result = await api.list<GrievanceSummary>(`/grievances?${search.toString()}`, {
          signal: controller.signal,
        });
        return [key, Number(result.meta?.total ?? 0)] as const;
      }),
    )
      .then((entries) => {
        if (!controller.signal.aborted) setCounts(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!controller.signal.aborted) setCounts({});
      });
    return () => controller.abort();
  }, [viewsKey]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ ...active.params, page: String(page), limit: "12", sort: "sla.dueAt" });
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
  }, [active?.key, page]);

  function selectView(key: string) {
    setActiveKey(key);
    setPage(1);
  }

  return (
    <div>
      <PageHeader title={title} description={description} eyebrow={eyebrow} />

      <div className="mb-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {views.map((view, index) => {
          const Icon = viewIcons[index % viewIcons.length];
          const tone = toneStyles[view.tone ?? "neutral"];
          const selected = view.key === active?.key;
          const count = counts[view.key];
          return (
            <button
              key={view.key}
              type="button"
              onClick={() => selectView(view.key)}
              aria-pressed={selected}
              className={cn(
                "card-surface flex items-center gap-3 p-4 text-left transition-colors",
                selected ? cn("border-2", tone.active) : "hover:border-primary/30",
              )}
            >
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tone.icon)}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {view.label}
                </span>
                <span className="mt-0.5 block text-[24px] font-semibold leading-none text-foreground">
                  {count === undefined || count === null ? "—" : count}
                </span>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{view.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">{active?.label ?? "Deadlines"}</p>
            <p className="text-[11px] text-muted-foreground">
              {active?.description ?? "Cases ordered by their SLA deadline."}
            </p>
          </div>
          <Badge variant="warning">Escalation at 24 / 48 / 72 h overdue</Badge>
        </div>

        {loading ? (
          <LoadingBlock label="Loading deadline queue…" />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            title="Nothing in this bucket"
            description="No grievances currently match this deadline bucket."
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Grievance</Th>
                    {showDepartment ? <Th>Department</Th> : null}
                    <Th>Priority</Th>
                    <Th>Status</Th>
                    <Th>Assigned to</Th>
                    <Th>Due</Th>
                    <Th>Escalation</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const overdue =
                      item.sla?.dueAt &&
                      !["RESOLVED", "CLOSED", "REJECTED"].includes(item.status) &&
                      new Date(item.sla.dueAt).getTime() < Date.now();
                    const level = item.sla?.escalationLevel ?? 0;
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
                        {showDepartment ? (
                          <Td>
                            <span className="text-muted-foreground">{item.department?.name ?? "Unassigned"}</span>
                          </Td>
                        ) : null}
                        <Td>
                          <PriorityBadge priority={item.priority} />
                        </Td>
                        <Td>
                          <StatusBadge status={item.status} />
                        </Td>
                        <Td>
                          <span className="text-muted-foreground">{item.assignedOfficer?.name ?? "Unassigned"}</span>
                        </Td>
                        <Td>
                          <span
                            className={cn(
                              "whitespace-nowrap text-[11.5px]",
                              overdue ? "font-semibold text-danger" : "text-muted-foreground",
                            )}
                          >
                            {item.sla?.dueAt
                              ? overdue
                                ? `Overdue ${relativeTime(item.sla.dueAt)}`
                                : `Due ${formatDate(item.sla.dueAt)}`
                              : "—"}
                          </span>
                        </Td>
                        <Td>
                          {level > 0 ? (
                            <Badge variant="danger">Level {level}</Badge>
                          ) : (
                            <span className="text-[11.5px] text-muted-foreground">Not escalated</span>
                          )}
                        </Td>
                        <Td className="text-right">
                          <TableLink href={`/grievances/${item._id}`}>Review</TableLink>
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
