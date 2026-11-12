"use client";

import { AlertTriangle, CheckCircle2, ClipboardList, ListChecks, RotateCcw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/dashboard/ui";
import { SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface OfficerWorkloadRow {
  officerId: string;
  name: string;
  designation?: string | null;
  role: string;
  roleLabel: string;
  department?: { id: string; name: string; code: string } | null;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  grievanceAssigned: number;
  grievanceCompleted: number;
  applicationAssigned: number;
  applicationCompleted: number;
  openTasks: number;
  overdueTasks: number;
  workload: number;
}

function dateInputOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function OfficerWorkloadView() {
  const [rows, setRows] = useState<OfficerWorkloadRow[]>([]);
  const [from, setFrom] = useState(dateInputOffset(29));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [applied, setApplied] = useState({ from, to });
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (applied.from) params.set("from", new Date(`${applied.from}T00:00:00`).toISOString());
    if (applied.to) params.set("to", new Date(`${applied.to}T23:59:59`).toISOString());

    setLoading(true);
    setError("");
    api
      .get<OfficerWorkloadRow[]>(`/reports/officers?${params.toString()}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setRows(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applied]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (accumulator, row) => ({
          assigned: accumulator.assigned + row.assigned,
          completed: accumulator.completed + row.completed,
          pending: accumulator.pending + row.pending,
          overdue: accumulator.overdue + row.overdue,
          openTasks: accumulator.openTasks + row.openTasks,
          overdueTasks: accumulator.overdueTasks + row.overdueTasks,
          workload: accumulator.workload + row.workload,
        }),
        { assigned: 0, completed: 0, pending: 0, overdue: 0, openTasks: 0, overdueTasks: 0, workload: 0 },
      ),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((row) =>
          [row.name, row.designation, row.roleLabel].filter(Boolean).join(" ").toLowerCase().includes(needle),
        )
      : rows;
    return [...filtered].sort((a, b) => b.workload - a.workload || b.overdue - a.overdue);
  }, [rows, q]);

  const maxWorkload = Math.max(1, ...rows.map((row) => row.workload));

  function apply() {
    setApplied({ from, to });
  }

  function reset() {
    const defaults = { from: dateInputOffset(29), to: new Date().toISOString().slice(0, 10) };
    setFrom(defaults.from);
    setTo(defaults.to);
    setApplied(defaults);
  }

  return (
    <div>
      <PageHeader
        title="Department officers"
        description="Officer allocation and workload across grievances, applications and meeting tasks for the selected period."
        eyebrow="Team"
        actions={
          <span className="text-[11px] text-muted-foreground">
            {rows.length} active {rows.length === 1 ? "member" : "members"}
          </span>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-2.5">
        <div>
          <label
            htmlFor="officer-from"
            className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            From
          </label>
          <Input
            id="officer-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 w-[150px] text-[12px]"
          />
        </div>
        <div>
          <label
            htmlFor="officer-to"
            className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            To
          </label>
          <Input
            id="officer-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 w-[150px] text-[12px]"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={apply}>
          Apply
        </Button>
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="size-3.5" aria-hidden />
          Reset
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Active officers" value={rows.length} icon={Users} tone="info" />
        <StatCard label="Cases assigned" value={totals.assigned} icon={ClipboardList} tone="neutral" />
        <StatCard
          label="Completed"
          value={totals.completed}
          hint={totals.assigned > 0 ? `${Math.round((totals.completed / totals.assigned) * 100)}% of assigned` : "No cases"}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Pending"
          value={totals.pending}
          hint={`${totals.openTasks} open meeting tasks`}
          icon={ListChecks}
          tone="warning"
        />
        <StatCard
          label="Overdue"
          value={totals.overdue}
          hint={totals.overdueTasks > 0 ? `${totals.overdueTasks} overdue tasks` : "No overdue tasks"}
          icon={AlertTriangle}
          tone={totals.overdue > 0 || totals.overdueTasks > 0 ? "danger" : "neutral"}
        />
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      <SectionCard
        title="Officer workload"
        description="Counts include grievances and applications assigned to each person, plus open meeting tasks."
        action={
          <SearchField value={q} onChange={setQ} placeholder="Search officers…" className="w-full sm:w-56" />
        }
        contentClassName="p-0"
      >
        {loading ? (
          <div className="p-5">
            <LoadingBlock label="Loading officer workload…" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No officers found"
              description={
                q ? "No officers match your search." : "Active clerks and officers in your department will appear here."
              }
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Officer</Th>
                  <Th>Assigned</Th>
                  <Th>Completed</Th>
                  <Th>Pending</Th>
                  <Th>Overdue</Th>
                  <Th>Meeting tasks</Th>
                  <Th>Workload</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.officerId}>
                    <Td>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{row.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.designation || row.roleLabel}
                          {row.department?.name ? ` · ${row.department.name}` : ""}
                        </p>
                      </div>
                      <Badge variant={row.role === "OFFICER" ? "info" : "neutral"} className="mt-1">
                        {row.roleLabel}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="font-semibold text-foreground">{row.assigned}</span>
                      <p className="text-[10.5px] text-muted-foreground">
                        {row.grievanceAssigned} grievances · {row.applicationAssigned} applications
                      </p>
                    </Td>
                    <Td>
                      <span className="font-semibold text-foreground">{row.completed}</span>
                      <p className="text-[10.5px] text-muted-foreground">
                        {row.grievanceCompleted} grievances · {row.applicationCompleted} applications
                      </p>
                    </Td>
                    <Td>
                      <span
                        className={cn(
                          "font-semibold",
                          row.pending > 0 ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {row.pending}
                      </span>
                    </Td>
                    <Td>
                      {row.overdue > 0 ? (
                        <Badge variant="danger">{row.overdue}</Badge>
                      ) : (
                        <span className="text-[11.5px] text-muted-foreground">0</span>
                      )}
                    </Td>
                    <Td>
                      <span className="font-semibold text-foreground">{row.openTasks}</span>
                      <p className="text-[10.5px] text-muted-foreground">
                        {row.overdueTasks > 0 ? `${row.overdueTasks} overdue` : "on schedule"}
                      </p>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="w-4 text-right font-semibold text-foreground">{row.workload}</span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              row.overdue > 0 ? "bg-danger" : row.workload >= maxWorkload * 0.75 ? "bg-warning" : "bg-info",
                            )}
                            style={{ width: `${Math.max(4, Math.round((row.workload / maxWorkload) * 100))}%` }}
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-[10.5px] text-muted-foreground">open cases + tasks</p>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </SectionCard>
    </div>
  );
}
