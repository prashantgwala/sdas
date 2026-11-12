"use client";

import { Download, FileBarChart2, RotateCcw, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BarList,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  Table,
  TableWrap,
  Td,
  Th,
  humanizeStatus,
} from "@/components/dashboard/ui";
import { FilterSelect } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { NamedCount, ReferenceCatalogs } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

interface StatusCount {
  _id: string;
  count: number;
}

interface ReportSummary {
  range: { from: string | null; to: string | null };
  scope: { department: string | null; districtWide: boolean };
  generatedAt: string;
  grievances: {
    total: number;
    open: number;
    resolved: number;
    overdue: number;
    resolutionRate: number;
    averageResolutionDays: number;
    byStatus: StatusCount[];
    byPriority: StatusCount[];
    byDepartment: Array<{
      _id: string;
      total: number;
      resolved: number;
      department?: Array<{ name?: string; code?: string }>;
    }>;
  };
  applications: { total: number; byStatus: StatusCount[] };
  files: { total: number; byStatus: StatusCount[] };
  helpdesk: { total: number; byStatus: StatusCount[] };
  roads: { total: number; byStatus: StatusCount[] };
  feedback: {
    total: number;
    averageRating: number;
    pending: number;
    byRating: Array<{ _id: number; count: number }>;
  };
  incidents: { total: number; byStatus: StatusCount[] } | null;
}

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

const EXPORT_TYPES = [
  { value: "grievances", label: "Grievances" },
  { value: "applications", label: "Applications" },
  { value: "files", label: "Digital files" },
  { value: "feedback", label: "Feedback" },
  { value: "helpdesk", label: "Helpdesk" },
];

const FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (XLSX)" },
  { value: "pdf", label: "PDF" },
];

function toNamed(counts: StatusCount[] | undefined, humanize = true): NamedCount[] {
  return (counts ?? []).map((item) => ({
    label: humanize ? humanizeStatus(item._id) : String(item._id),
    value: item.count,
  }));
}

function dateInputOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function ReportView() {
  const { permissions, user } = useAuth();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [departments, setDepartments] = useState<DepartmentPerformance[]>([]);
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [from, setFrom] = useState(dateInputOffset(29));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState("");
  const [applied, setApplied] = useState({ from, to, department });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportType, setExportType] = useState("grievances");
  const [exportFormat, setExportFormat] = useState("csv");

  const isDistrict = permissions.includes("report.read.district");
  const canViewPerformance = isDistrict || user?.role === "DEPARTMENT_HEAD";
  const canExport = permissions.includes("export");

  useEffect(() => {
    if (!isDistrict) return;
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then(setCatalogs)
      .catch(() => undefined);
  }, [isDistrict]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (applied.from) params.set("from", new Date(`${applied.from}T00:00:00`).toISOString());
    if (applied.to) params.set("to", new Date(`${applied.to}T23:59:59`).toISOString());
    if (applied.department) params.set("department", applied.department);

    setLoading(true);
    setError("");
    const requests: Array<Promise<unknown>> = [
      api.get<ReportSummary>(`/reports?${params.toString()}`, { signal: controller.signal }).then((data) => {
        if (!controller.signal.aborted) setSummary(data);
      }),
    ];
    if (canViewPerformance) {
      requests.push(
        api
          .get<DepartmentPerformance[]>(`/reports/departments?${params.toString()}`, {
            signal: controller.signal,
          })
          .then((data) => {
            if (!controller.signal.aborted) setDepartments(data);
          }),
      );
    } else {
      setDepartments([]);
    }

    Promise.all(requests)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applied, canViewPerformance]);

  const departmentOptions = useMemo(
    () => (catalogs?.departments ?? []).map((item) => ({ value: item._id, label: item.name })),
    [catalogs],
  );

  const visibleDepartments = departments;

  function apply() {
    setApplied({ from, to, department });
  }

  function reset() {
    const defaults = { from: dateInputOffset(29), to: new Date().toISOString().slice(0, 10), department: "" };
    setFrom(defaults.from);
    setTo(defaults.to);
    setDepartment("");
    setApplied(defaults);
  }

  function exportReport() {
    const params = new URLSearchParams({ type: exportType, format: exportFormat });
    if (applied.from) params.set("from", new Date(`${applied.from}T00:00:00`).toISOString());
    if (applied.to) params.set("to", new Date(`${applied.to}T23:59:59`).toISOString());
    if (applied.department) params.set("department", applied.department);
    window.location.assign(`/api/v1/reports/export?${params.toString()}`);
  }

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        description={
          isDistrict
            ? "District-wide service delivery, open workload, compliance and citizen feedback."
            : "Department service delivery, open workload, compliance and citizen feedback."
        }
        eyebrow="Insights"
        actions={
          summary ? (
            <span className="text-[11px] text-muted-foreground">Refreshed {formatDateTime(summary.generatedAt)}</span>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-2.5">
        <div>
          <label htmlFor="report-from" className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            From
          </label>
          <Input
            id="report-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 w-[150px] text-[12px]"
          />
        </div>
        <div>
          <label htmlFor="report-to" className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            To
          </label>
          <Input
            id="report-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 w-[150px] text-[12px]"
          />
        </div>
        {isDistrict ? (
          <FilterSelect
            label="Department"
            value={department}
            placeholder="All departments"
            options={departmentOptions}
            onChange={setDepartment}
          />
        ) : null}
        <Button variant="secondary" size="sm" onClick={apply}>
          Apply
        </Button>
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="size-3.5" aria-hidden />
          Reset
        </Button>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      {loading || !summary ? (
        <div className="card-surface p-5">
          <LoadingBlock label="Building report…" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Grievances"
              value={summary.grievances.total}
              hint={`${summary.grievances.open} open · ${summary.grievances.overdue} overdue`}
              tone="primary"
              icon={FileBarChart2}
            />
            <StatCard
              label="Resolution rate"
              value={`${summary.grievances.resolutionRate}%`}
              hint={`${summary.grievances.resolved} resolved`}
              tone="success"
              icon={TrendingUp}
            />
            <StatCard
              label="Avg. resolution"
              value={`${summary.grievances.averageResolutionDays}d`}
              hint="From filing to resolution"
              tone="info"
            />
            <StatCard
              label="Citizen feedback"
              value={summary.feedback.averageRating ? `${summary.feedback.averageRating}/5` : "—"}
              hint={`${summary.feedback.total} responses · ${summary.feedback.pending} awaiting review`}
              tone="warning"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Applications" value={summary.applications.total} hint="Filed in this period" tone="info" />
            <StatCard label="Digital files" value={summary.files.total} hint="Registered in this period" tone="primary" />
            <StatCard label="Helpdesk tickets" value={summary.helpdesk.total} hint="Raised in this period" tone="neutral" />
            <StatCard
              label={summary.incidents ? "Incidents" : "Road reports"}
              value={summary.incidents ? summary.incidents.total : summary.roads.total}
              hint={summary.incidents ? "District incident log" : "Damage reports in this period"}
              tone="danger"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Grievances by status" description="Current pipeline for the selected period">
              <BarList items={toNamed(summary.grievances.byStatus)} emptyLabel="No grievances in this period" />
            </SectionCard>
            <SectionCard title="Grievances by priority" description="Urgency distribution">
              <BarList items={toNamed(summary.grievances.byPriority)} emptyLabel="No grievances in this period" />
            </SectionCard>
            <SectionCard title="Applications by status" description="Service request pipeline">
              <BarList items={toNamed(summary.applications.byStatus)} emptyLabel="No applications in this period" />
            </SectionCard>
            <SectionCard title="Digital files by status" description="Movement and custody status">
              <BarList items={toNamed(summary.files.byStatus)} emptyLabel="No files in this period" />
            </SectionCard>
            <SectionCard title="Feedback ratings" description="Distribution of citizen ratings">
              <BarList
                items={(summary.feedback.byRating ?? []).map((item) => ({
                  label: `${item._id} star`,
                  value: item.count,
                }))}
                emptyLabel="No feedback in this period"
                humanize={false}
              />
            </SectionCard>
            <SectionCard title="Other services" description="Helpdesk, road reports and incidents">
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Helpdesk tickets
                  </p>
                  <BarList items={toNamed(summary.helpdesk.byStatus)} emptyLabel="No helpdesk tickets in this period" />
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Road damage reports
                  </p>
                  <BarList items={toNamed(summary.roads.byStatus)} emptyLabel="No road reports in this period" />
                </div>
                {summary.incidents ? (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Incidents
                    </p>
                    <BarList items={toNamed(summary.incidents.byStatus)} emptyLabel="No incidents in this period" />
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </div>

          {isDistrict && summary.grievances.byDepartment.length > 0 ? (
            <SectionCard title="Grievances by department" description="Volume across district departments">
              <BarList
                items={summary.grievances.byDepartment.map((row) => ({
                  label: row.department?.[0]?.name ?? "Unassigned",
                  value: row.total,
                }))}
                humanize={false}
              />
            </SectionCard>
          ) : null}

          {canViewPerformance ? (
            <SectionCard
              title="Department performance"
              description={
                isDistrict
                  ? "Resolution, overdue workload and citizen satisfaction by department"
                  : "Resolution, overdue workload and citizen satisfaction for your department"
              }
            >
              {departments.length === 0 ? (
                <EmptyState compact title="No department activity" description="Department metrics will appear once cases are recorded." />
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Department</Th>
                        <Th>Grievances</Th>
                        <Th>Resolved</Th>
                        <Th>Overdue</Th>
                        <Th>Avg. days</Th>
                        <Th>Applications</Th>
                        <Th>Feedback</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDepartments.map((row) => {
                        const rate = row.grievances ? Math.round((row.resolved / row.grievances) * 100) : 0;
                        return (
                          <tr key={row.departmentId}>
                            <Td>
                              <div>
                                <p className="font-semibold text-foreground">{row.department}</p>
                                {row.code ? (
                                  <p className="font-mono text-[10px] text-muted-foreground">{row.code}</p>
                                ) : null}
                              </div>
                            </Td>
                            <Td>
                              <span className="font-semibold text-foreground">{row.grievances}</span>
                              <span className="ml-1.5 text-[10.5px] text-muted-foreground">({rate}% resolved)</span>
                            </Td>
                            <Td className="text-muted-foreground">{row.resolved}</Td>
                            <Td>
                              <span className={cn(row.overdue > 0 ? "font-semibold text-danger" : "text-muted-foreground")}>
                                {row.overdue}
                              </span>
                            </Td>
                            <Td className="text-muted-foreground">{row.averageResolutionDays}d</Td>
                            <Td className="text-muted-foreground">{row.applications}</Td>
                            <Td>
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">{row.feedbackCount}</span>
                                {row.averageRating > 0 ? (
                                  <Badge variant={row.averageRating >= 4 ? "success" : row.averageRating >= 3 ? "warning" : "danger"}>
                                    {row.averageRating}/5
                                  </Badge>
                                ) : null}
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
          ) : null}

          {canExport ? (
            <SectionCard title="Export data" description="Download registers for the selected period as CSV, Excel or PDF">
              <div className="flex flex-wrap items-end gap-2.5">
                <FilterSelect label="Dataset" value={exportType} placeholder="Select" options={EXPORT_TYPES} onChange={setExportType} />
                <FilterSelect label="Format" value={exportFormat} placeholder="Select" options={FORMATS} onChange={setExportFormat} />
                <Button size="sm" onClick={exportReport}>
                  <Download className="size-3.5" aria-hidden />
                  Export
                </Button>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Exports follow the same access scope as this report and are recorded in the audit trail.
              </p>
            </SectionCard>
          ) : null}
        </div>
      )}
    </div>
  );
}
