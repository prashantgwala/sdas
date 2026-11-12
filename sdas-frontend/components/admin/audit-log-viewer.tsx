"use client";

import { ChevronDown, ChevronRight, RefreshCw, ScrollText } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { EmptyState, PageHeader, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface AuditRow {
  _id: string;
  actor?: { _id?: string; name?: string; email?: string; role?: string } | null;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  status: "SUCCESS" | "FAILURE";
  createdAt: string;
}

const ENTITY_TYPES = [
  "APPLICATION",
  "AdministrativeUnit",
  "Application",
  "ApplicationType",
  "ChatConversation",
  "Department",
  "DigitalFile",
  "DistrictConfig",
  "FILE",
  "Feedback",
  "File",
  "FileCategory",
  "GRIEVANCE",
  "Grievance",
  "GrievanceCategory",
  "HelpdeskTicket",
  "INCIDENT",
  "Incident",
  "Integration",
  "JobRun",
  "KnowledgeArticle",
  "MEETING",
  "Meeting",
  "MeetingTask",
  "MovementRule",
  "NotificationTemplate",
  "Office",
  "Report",
  "RetentionRule",
  "RoadDamageReport",
  "Role",
  "RoutingRule",
  "SLARule",
  "SystemSetting",
  "TASK",
  "User",
  "WeatherAlert",
].sort();

function preview(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return JSON.stringify(value, null, 2);
}

export function AuditLogViewer() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQ(q);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (appliedQ) params.set("q", appliedQ);
    if (entityType) params.set("entityType", entityType);
    if (status) params.set("status", status);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());

    setLoading(true);
    setError("");
    api
      .list<AuditRow>(`/admin/audit-logs?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, entityType, status, from, to, reloadKey]);

  const entityOptions = useMemo(
    () => ENTITY_TYPES.map((value) => ({ value, label: value })),
    [],
  );

  const hasFilters = Boolean(appliedQ || entityType || status || from || to);

  function resetFilters() {
    setQ("");
    setEntityType("");
    setStatus("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Audit logs"
        description="Append-only record of sensitive actions across access control, organisation configuration and case workflows."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}>
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        }
      />

      <div className="card-surface mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={q} onChange={setQ} placeholder="Search action, entity or label…" className="w-full sm:w-64" />
          <FilterSelect value={entityType} onChange={(value) => { setEntityType(value); setPage(1); }} options={entityOptions} placeholder="All entities" label="Filter by entity type" />
          <FilterSelect
            value={status}
            onChange={(value) => { setStatus(value); setPage(1); }}
            options={[{ value: "SUCCESS", label: "Success" }, { value: "FAILURE", label: "Failure" }]}
            placeholder="All outcomes"
            label="Filter by outcome"
          />
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            From
            <Input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="h-9 w-36" aria-label="From date" />
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            To
            <Input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="h-9 w-36" aria-label="To date" />
          </label>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading audit trail…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description={hasFilters ? "No entries match the current filters." : "Sensitive actions will be recorded here as they happen."}
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-8">
                      <span className="sr-only">Details</span>
                    </Th>
                    <Th>Time</Th>
                    <Th>Actor</Th>
                    <Th>Action</Th>
                    <Th>Entity</Th>
                    <Th>Outcome</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const open = expanded === item._id;
                    const Icon = open ? ChevronDown : ChevronRight;
                    return (
                      <Fragment key={item._id}>
                        <tr className="align-top">
                          <Td>
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : item._id)}
                              aria-label={open ? "Hide details" : "Show details"}
                              aria-expanded={open}
                              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Icon className="size-3.5" aria-hidden />
                            </button>
                          </Td>
                          <Td>
                            <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                          </Td>
                          <Td>
                            <p className="font-semibold text-foreground">{item.actor?.name ?? "System"}</p>
                            <p className="text-[10.5px] text-muted-foreground">{item.actor?.role ?? item.actorRole ?? "automation"}</p>
                          </Td>
                          <Td>
                            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-foreground">
                              <ScrollText className="size-3 text-muted-foreground" aria-hidden />
                              {item.action}
                            </span>
                          </Td>
                          <Td>
                            <p className="text-[11.5px] text-foreground">{item.entityLabel || item.entityType}</p>
                            <p className="text-[10.5px] text-muted-foreground">{item.entityType}</p>
                          </Td>
                          <Td><StatusBadge status={item.status} /></Td>
                        </tr>
                        {open ? (
                          <tr>
                            <td colSpan={6} className="border-b border-border/70 bg-muted/30 px-4 py-4">
                              <div className="grid gap-4 lg:grid-cols-3">
                                <div className="lg:col-span-2">
                                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Change</p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div>
                                      <p className="mb-1 text-[10.5px] text-muted-foreground">Before</p>
                                      <pre className="max-h-52 overflow-auto rounded-lg border border-border bg-surface p-2.5 text-[10.5px] leading-relaxed text-foreground">{preview(item.before)}</pre>
                                    </div>
                                    <div>
                                      <p className="mb-1 text-[10.5px] text-muted-foreground">After</p>
                                      <pre className="max-h-52 overflow-auto rounded-lg border border-border bg-surface p-2.5 text-[10.5px] leading-relaxed text-foreground">{preview(item.after)}</pre>
                                    </div>
                                  </div>
                                </div>
                                <dl className="space-y-2 text-[11px]">
                                  <div>
                                    <dt className="text-muted-foreground">Entity ID</dt>
                                    <dd className="break-all font-mono text-foreground">{item.entityId ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted-foreground">IP address</dt>
                                    <dd className="font-mono text-foreground">{item.ip ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted-foreground">Request ID</dt>
                                    <dd className="break-all font-mono text-foreground">{item.requestId ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted-foreground">User agent</dt>
                                    <dd className="line-clamp-3 break-all text-foreground">{item.userAgent ?? "—"}</dd>
                                  </div>
                                </dl>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
