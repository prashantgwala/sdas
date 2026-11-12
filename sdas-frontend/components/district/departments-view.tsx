"use client";

import Link from "next/link";
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, FileText, RotateCcw, Star, Users } from "lucide-react";
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
import type { ReferenceCatalogs } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DepartmentPerformance {
  departmentId: string;
  department: string;
  code: string;
  grievances: number;
  resolved: number;
  overdue: number;
  averageResolutionDays: number;
  applications: number;
  feedbackCount: number;
  averageRating: number;
}

interface DepartmentRow extends DepartmentPerformance {
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
}

function dateInputOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function DistrictDepartmentsView() {
  const [performance, setPerformance] = useState<DepartmentPerformance[]>([]);
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [from, setFrom] = useState(dateInputOffset(29));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [applied, setApplied] = useState({ from, to });
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then(setCatalogs)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (applied.from) params.set("from", new Date(`${applied.from}T00:00:00`).toISOString());
    if (applied.to) params.set("to", new Date(`${applied.to}T23:59:59`).toISOString());

    setLoading(true);
    setError("");
    api
      .get<DepartmentPerformance[]>(`/reports/departments?${params.toString()}`, {
        signal: controller.signal,
      })
      .then((data) => {
        if (!controller.signal.aborted) setPerformance(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applied]);

  const rows = useMemo<DepartmentRow[]>(() => {
    const performanceMap = new Map(performance.map((item) => [item.departmentId, item]));
    const listed = (catalogs?.departments ?? []).map((department) => {
      const stats = performanceMap.get(department._id);
      performanceMap.delete(department._id);
      return {
        departmentId: department._id,
        department: department.name,
        code: department.code,
        description: department.description,
        contactEmail: department.contactEmail,
        contactPhone: department.contactPhone,
        grievances: stats?.grievances ?? 0,
        resolved: stats?.resolved ?? 0,
        overdue: stats?.overdue ?? 0,
        averageResolutionDays: stats?.averageResolutionDays ?? 0,
        applications: stats?.applications ?? 0,
        feedbackCount: stats?.feedbackCount ?? 0,
        averageRating: stats?.averageRating ?? 0,
      };
    });
    const unlisted = Array.from(performanceMap.values());
    return [...listed, ...unlisted].sort((a, b) => b.grievances - a.grievances);
  }, [catalogs, performance]);

  const visibleRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.department, row.code, row.description].filter(Boolean).join(" ").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (accumulator, row) => ({
          grievances: accumulator.grievances + row.grievances,
          resolved: accumulator.resolved + row.resolved,
          overdue: accumulator.overdue + row.overdue,
          applications: accumulator.applications + row.applications,
          feedbackCount: accumulator.feedbackCount + row.feedbackCount,
          ratingSum: accumulator.ratingSum + row.averageRating * row.feedbackCount,
          resolutionDaysSum: accumulator.resolutionDaysSum + row.averageResolutionDays * row.resolved,
        }),
        {
          grievances: 0,
          resolved: 0,
          overdue: 0,
          applications: 0,
          feedbackCount: 0,
          ratingSum: 0,
          resolutionDaysSum: 0,
        },
      ),
    [rows],
  );

  const resolutionRate = totals.grievances > 0 ? Math.round((totals.resolved / totals.grievances) * 100) : 0;
  const averageRating = totals.feedbackCount > 0 ? totals.ratingSum / totals.feedbackCount : 0;
  const averageDays = totals.resolved > 0 ? totals.resolutionDaysSum / totals.resolved : 0;

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
        title="Departments"
        description="District-wide department performance: grievance load, resolution, SLA overdue position, applications and citizen feedback."
        eyebrow="Administration"
        actions={
          <Link
            href="/district/grievances"
            className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Open district grievances
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-2.5">
        <div>
          <label
            htmlFor="dept-from"
            className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            From
          </label>
          <Input
            id="dept-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 w-[150px] text-[12px]"
          />
        </div>
        <div>
          <label
            htmlFor="dept-to"
            className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            To
          </label>
          <Input
            id="dept-to"
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
        <StatCard label="Departments" value={rows.length} icon={Building2} tone="neutral" />
        <StatCard
          label="Grievances"
          value={totals.grievances}
          hint={`${totals.applications} applications`}
          icon={ClipboardList}
          tone="info"
        />
        <StatCard
          label="Resolved"
          value={`${resolutionRate}%`}
          hint={`${totals.resolved} closed or resolved`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="SLA overdue"
          value={totals.overdue}
          hint={averageDays > 0 ? `${averageDays.toFixed(1)} days average disposal` : "No disposal data"}
          icon={AlertTriangle}
          tone={totals.overdue > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="Citizen rating"
          value={averageRating > 0 ? averageRating.toFixed(1) : "—"}
          hint={`${totals.feedbackCount} feedback responses`}
          icon={Star}
          tone="warning"
        />
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      <SectionCard
        title="Department performance"
        description="Counts respect the selected date range. Departments without activity in the period show as zero."
        action={
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search departments…"
            className="w-full sm:w-56"
          />
        }
        contentClassName="p-0"
      >
        {loading ? (
          <div className="p-5">
            <LoadingBlock label="Loading department performance…" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No departments"
              description={q ? "No departments match your search." : "Active departments will appear here."}
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Department</Th>
                  <Th>Contact</Th>
                  <Th>Grievances</Th>
                  <Th>Resolved</Th>
                  <Th>Overdue</Th>
                  <Th>Avg disposal</Th>
                  <Th>Applications</Th>
                  <Th>Feedback</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const rowRate = row.grievances > 0 ? Math.round((row.resolved / row.grievances) * 100) : 0;
                  return (
                    <tr key={row.departmentId}>
                      <Td>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{row.department}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.code || "—"}
                            {row.description ? ` · ${row.description}` : ""}
                          </p>
                        </div>
                      </Td>
                      <Td>
                        <div className="text-[11.5px] text-muted-foreground">
                          {row.contactEmail ? <p className="truncate">{row.contactEmail}</p> : null}
                          {row.contactPhone ? <p>{row.contactPhone}</p> : null}
                          {!row.contactEmail && !row.contactPhone ? <p>—</p> : null}
                        </div>
                      </Td>
                      <Td>
                        <span className="font-semibold text-foreground">{row.grievances}</span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{row.resolved}</span>
                          <span className="text-[11px] text-muted-foreground">{rowRate}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              rowRate >= 75 ? "bg-success" : rowRate >= 40 ? "bg-warning" : "bg-danger",
                            )}
                            style={{ width: `${rowRate}%` }}
                          />
                        </div>
                      </Td>
                      <Td>
                        {row.overdue > 0 ? (
                          <Badge variant="danger">{row.overdue}</Badge>
                        ) : (
                          <span className="text-[11.5px] text-muted-foreground">0</span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-[11.5px] text-muted-foreground">
                          {row.resolved > 0 ? `${row.averageResolutionDays.toFixed(1)} days` : "—"}
                        </span>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                          <FileText className="size-3.5" aria-hidden />
                          {row.applications}
                        </span>
                      </Td>
                      <Td>
                        <div className="text-[11.5px] text-muted-foreground">
                          {row.feedbackCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Star className="size-3.5 fill-warning text-warning" aria-hidden />
                              {row.averageRating.toFixed(1)}
                              <span className="text-[10.5px]">({row.feedbackCount})</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </SectionCard>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Users className="size-3.5" aria-hidden />
        Department heads manage officer allocation from their own dashboard.
      </p>
    </div>
  );
}
