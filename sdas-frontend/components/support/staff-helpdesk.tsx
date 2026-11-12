"use client";

import Link from "next/link";
import { CheckCircle2, Clock3, Headset, LifeBuoy, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, PageHeader, PriorityBadge, SectionCard, StatCard, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import type { HelpdeskStats, HelpdeskTicketSummary } from "./types";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status) => ({
  value: status,
  label: status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()),
}));

const PRIORITY_OPTIONS = ["URGENT", "HIGH", "NORMAL", "LOW"].map((priority) => ({
  value: priority,
  label: priority.charAt(0) + priority.slice(1).toLowerCase(),
}));

export function StaffHelpdesk() {
  const [tickets, setTickets] = useState<HelpdeskTicketSummary[]>([]);
  const [stats, setStats] = useState<HelpdeskStats | null>(null);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
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
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (appliedQ) params.set("q", appliedQ);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (appliedQ || status || priority) params.set("sort", "-createdAt");

    setLoading(true);
    setError("");
    api
      .list<HelpdeskTicketSummary>(`/helpdesk?${params.toString()}`, { signal: controller.signal })
      .then((result) => {
        setTickets(result.items);
        setMeta(result.meta);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, appliedQ, status, priority, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<HelpdeskStats>("/helpdesk/stats")
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const count = (key: string) => stats?.byStatus.find((entry) => entry._id === key)?.count ?? 0;
  const avgHours = stats?.resolution.averageHours;

  return (
    <div>
      <PageHeader
        title="Helpdesk queue"
        description="Citizen support tickets assigned to your department, with SLA tracking and conversation history."
        eyebrow="Support"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={count("OPEN")} hint="Awaiting first response" icon={LifeBuoy} tone="info" />
        <StatCard label="In progress" value={count("IN_PROGRESS")} hint="Being worked on" icon={Headset} tone="primary" />
        <StatCard label="Resolved" value={count("RESOLVED")} hint="Resolution shared with citizen" icon={CheckCircle2} tone="success" />
        <StatCard
          label="Avg. resolution"
          value={avgHours ? `${avgHours.toFixed(1)}h` : "—"}
          hint={`${stats?.resolution.resolved ?? 0} tickets resolved`}
          icon={Timer}
          tone="warning"
        />
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      <SectionCard title="Tickets" description="Search by ticket number, subject or description.">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search tickets"
            className="w-full sm:w-72"
          />
          <FilterSelect
            label="Status"
            value={status}
            placeholder="All statuses"
            options={STATUS_OPTIONS}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <FilterSelect
            label="Priority"
            value={priority}
            placeholder="All priorities"
            options={PRIORITY_OPTIONS}
            onChange={(value) => {
              setPriority(value);
              setPage(1);
            }}
          />
        </div>

        {loading ? (
          <LoadingBlock label="Loading helpdesk…" />
        ) : tickets.length === 0 ? (
          <EmptyState
            title={appliedQ || status || priority ? "No tickets match these filters" : "No support tickets yet"}
            description={
              appliedQ || status || priority
                ? "Clear the filters or search with a different keyword."
                : "Citizen support tickets routed to your department will appear here."
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Ticket</Th>
                    <Th>Citizen</Th>
                    <Th>Priority</Th>
                    <Th>Assignee</Th>
                    <Th>Raised</Th>
                    <Th>SLA due</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const overdue =
                      ticket.sla?.dueAt &&
                      !["RESOLVED", "CLOSED"].includes(ticket.status) &&
                      new Date(ticket.sla.dueAt).getTime() < Date.now();
                    return (
                      <tr key={ticket._id}>
                        <Td>
                          <Link href={`/helpdesk/${ticket._id}`} className="group block min-w-0">
                            <p className="truncate font-semibold text-primary group-hover:underline">
                              {ticket.ticketId ?? "Ticket"}
                            </p>
                            <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-muted-foreground">
                              {ticket.subject}
                            </p>
                          </Link>
                        </Td>
                        <Td>
                          <p className="truncate text-foreground">{ticket.citizen?.name ?? "Citizen"}</p>
                          <p className="text-[10.5px] text-muted-foreground">{ticket.category}</p>
                        </Td>
                        <Td>
                          <PriorityBadge priority={ticket.priority} />
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground">
                          {ticket.assignedTo?.name ?? "Unassigned"}
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground">{relativeTime(ticket.createdAt)}</Td>
                        <Td className="whitespace-nowrap">
                          {ticket.sla?.dueAt ? (
                            <span className={overdue ? "font-semibold text-danger" : "text-muted-foreground"}>
                              {formatDate(ticket.sla.dueAt)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </Td>
                        <Td>
                          <StatusBadge status={ticket.status} />
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
      </SectionCard>

      <p className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <Clock3 className="size-3" aria-hidden />
        Replying to an open ticket automatically assigns it to you and updates SLA tracking.
      </p>
    </div>
  );
}
