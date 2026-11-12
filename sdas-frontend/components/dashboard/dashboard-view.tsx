"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileText,
  FolderKanban,
  Gauge,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Star,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BarList,
  EmptyState,
  PageHeader,
  PriorityBadge,
  SectionCard,
  StatCard,
  StatusBadge,
  Table,
  TableLink,
  TableWrap,
  Td,
  Th,
  TrendChart,
} from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { DashboardData, Role } from "@/lib/types";
import { cn, formatDate, formatDateTime, humanize } from "@/lib/utils";

function greeting(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}`;
}

const SLA_TONE: Record<string, string> = {
  OVERDUE: "text-danger",
  DUE_SOON: "text-warning",
  WITHIN_TIME: "text-success",
  COMPLETED: "text-muted-foreground",
};

export function DashboardView({
  role,
  title,
  description,
}: {
  role: Role;
  title: string;
  description: string;
}) {
  const { user, hasPermission } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salutation, setSalutation] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<DashboardData>("/dashboard"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user) setSalutation(greeting(user.name));
  }, [user]);

  if (!user) return null;

  const actions = (
    <>
      {hasPermission("grievance.create") ? (
        <Link href={role === "CLERK" ? "/clerk/grievances/new" : "/citizen/grievances/new"} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          <FilePlus2 aria-hidden />
          New grievance
        </Link>
      ) : null}
      {hasPermission("file.register") ? (
        <Link href="/clerk/files/new" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          <FolderKanban aria-hidden />
          Register file
        </Link>
      ) : null}
      {hasPermission("user.create") ? (
        <Link href="/admin/users/new" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          <Users aria-hidden />
          Create user
        </Link>
      ) : null}
      <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
        {loading ? <Spinner /> : <RefreshCw aria-hidden />}
        Refresh
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader
        eyebrow={title}
        title={salutation || `Welcome back, ${user.name.split(" ")[0]}`}
        description={description}
        actions={actions}
      />

      {error ? (
        <Alert variant="error" className="mb-5" title="Could not load dashboard">
          {error}
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
          <Spinner className="mr-2" />
          Loading live dashboard…
        </div>
      ) : null}

      {data ? (
        <div className="space-y-5">
          {role === "CITIZEN" ? <CitizenStats data={data} /> : null}
          {role === "CLERK" || role === "OFFICER" ? <StaffStats data={data} /> : null}
          {role === "DEPARTMENT_HEAD" ? <HeadStats data={data} /> : null}
          {role === "DISTRICT_ADMIN" ? <DistrictStats data={data} /> : null}
          {role === "SUPER_ADMIN" ? <SystemStats data={data} /> : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <SectionCard
              title="Grievance intake trend"
              description="New grievances recorded over the last 14 days"
              action={
                <Link href={role === "CITIZEN" ? "/citizen/grievances" : role === "OFFICER" ? "/officer/grievances" : role === "CLERK" ? "/clerk/grievances" : role === "DEPARTMENT_HEAD" ? "/dept-head/grievances" : role === "DISTRICT_ADMIN" ? "/district/grievances" : "/admin"} className="text-[11.5px] font-semibold text-primary hover:underline">
                  View all
                </Link>
              }
            >
              <TrendChart data={data.charts.grievanceTrend ?? []} />
            </SectionCard>

            <SectionCard title="Current distribution" description="Records grouped by workflow status">
              <div className="space-y-5">
                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Grievances
                  </p>
                  <BarList items={data.charts.grievancesByStatus ?? []} />
                </div>
                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Applications
                  </p>
                  <BarList items={data.charts.applicationsByStatus ?? []} emptyLabel="No applications yet" />
                </div>
                {role !== "CITIZEN" ? (
                  <div>
                    <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Digital files
                    </p>
                    <BarList items={data.charts.filesByStatus ?? []} emptyLabel="No files registered yet" />
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard
              title="Recent grievances"
              description="Latest cases in your scope"
              contentClassName="p-0 sm:p-0"
              action={
                <Link href={role === "CITIZEN" ? "/citizen/grievances" : role === "OFFICER" ? "/officer/grievances" : role === "CLERK" ? "/clerk/grievances" : role === "DEPARTMENT_HEAD" ? "/dept-head/grievances" : "/district/grievances"} className="text-[11.5px] font-semibold text-primary hover:underline">
                  View all
                </Link>
              }
            >
              {data.recent.grievances?.length ? (
                <TableWrap className="mx-0 sm:mx-0">
                  <Table>
                    <thead>
                      <tr>
                        <Th className="pl-4 sm:pl-5">Reference</Th>
                        <Th>Subject</Th>
                        <Th>Status</Th>
                        <Th>Priority</Th>
                        <Th className="pr-4 sm:pr-5">SLA</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.grievances.slice(0, 6).map((row) => (
                        <tr key={row._id}>
                          <Td className="pl-4 font-mono text-[11px] text-muted-foreground sm:pl-5">
                            <TableLink href={`/grievances/${row._id}`}>{row.grievanceId ?? "View"}</TableLink>
                          </Td>
                          <Td className="max-w-[220px]">
                            <p className="truncate font-medium text-foreground">{row.subject}</p>
                            <p className="truncate text-[10.5px] text-muted-foreground">
                              {row.department?.name ?? "Unassigned"} · {formatDate(row.createdAt)}
                            </p>
                          </Td>
                          <Td><StatusBadge status={row.status} /></Td>
                          <Td><PriorityBadge priority={row.priority} /></Td>
                          <Td className={cn("pr-4 text-[11px] font-semibold sm:pr-5", SLA_TONE[row.sla?.status ?? ""] ?? "text-muted-foreground")}>
                            {row.sla?.dueAt ? formatDate(row.sla.dueAt) : "—"}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              ) : (
                <EmptyState compact title="No grievances yet" description="New cases in your scope will appear here." />
              )}
            </SectionCard>

            <SectionCard
              title="Recent applications"
              description="Latest service applications"
              contentClassName="p-0 sm:p-0"
              action={
                <Link href={role === "CITIZEN" ? "/citizen/applications" : role === "OFFICER" ? "/officer/applications" : role === "CLERK" ? "/clerk/applications" : role === "DEPARTMENT_HEAD" ? "/dept-head/applications" : "/district/applications"} className="text-[11.5px] font-semibold text-primary hover:underline">
                  View all
                </Link>
              }
            >
              {data.recent.applications?.length ? (
                <TableWrap className="mx-0 sm:mx-0">
                  <Table>
                    <thead>
                      <tr>
                        <Th className="pl-4 sm:pl-5">Reference</Th>
                        <Th>Type</Th>
                        <Th>Status</Th>
                        <Th className="pr-4 sm:pr-5">Submitted</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.applications.slice(0, 6).map((row) => (
                        <tr key={row._id}>
                          <Td className="pl-4 font-mono text-[11px] text-muted-foreground sm:pl-5">
                            <TableLink href={`/applications/${row._id}`}>{row.applicationId ?? "View"}</TableLink>
                          </Td>
                          <Td className="max-w-[220px]">
                            <p className="truncate font-medium text-foreground">{row.type?.name ?? "Application"}</p>
                            <p className="truncate text-[10.5px] text-muted-foreground">{row.department?.name ?? "—"}</p>
                          </Td>
                          <Td><StatusBadge status={row.status} /></Td>
                          <Td className="pr-4 text-[11px] text-muted-foreground sm:pr-5">{formatDate(row.createdAt)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              ) : (
                <EmptyState compact title="No applications yet" description="Applications will appear here when submitted." />
              )}
            </SectionCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
            <SectionCard title="My tasks" description="Deadlines assigned to you" action={<Link href="/tasks" className="text-[11.5px] font-semibold text-primary hover:underline">Open</Link>}>
              {data.tasks?.length ? (
                <ul className="space-y-2.5">
                  {data.tasks.slice(0, 5).map((task) => (
                    <li key={task._id} className="rounded-lg border border-border px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] font-semibold leading-snug">{task.description ?? task.title}</p>
                        <StatusBadge status={task.status} />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <CalendarClock className="size-3" aria-hidden />
                        Due {formatDate(task.dueDate)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="No open tasks" description="Tasks assigned through meetings will appear here." />
              )}
            </SectionCard>

            <SectionCard title="Citizen feedback" description="Ratings on resolved services">
              <div className="flex items-center gap-4">
                <div className="grid size-16 place-items-center rounded-2xl bg-warning-soft">
                  <Star className="size-7 text-warning" aria-hidden />
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {(data.feedback?.average ?? 0).toFixed(1)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">/ 5</span>
                  </p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {data.feedback?.count ?? 0} feedback {data.feedback?.count === 1 ? "entry" : "entries"}
                  </p>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Feedback is collected after grievance closure and measured separately for each
                department.
              </p>
            </SectionCard>

            <SectionCard title="SLA watch" description="Cases requiring attention now">
              <div className="space-y-3">
                <SlaRow label="Overdue grievances" value={data.stats.overdueGrievances ?? 0} tone="danger" />
                <SlaRow label="Due within 24 hours" value={data.stats.dueSoonGrievances ?? 0} tone="warning" />
                <SlaRow label="Pending approvals" value={data.stats.pendingApprovals ?? 0} tone="info" />
                <SlaRow label="Overdue tasks" value={data.stats.overdueTasks ?? 0} tone="danger" />
              </div>
            </SectionCard>
          </div>

          {role === "DEPARTMENT_HEAD" && data.officerWorkload?.length ? (
            <SectionCard title="Officer workload" description="Open grievances currently assigned to your officers">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {data.officerWorkload.map((row) => (
                  <div key={String(row._id)} className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
                    <span className="text-[12px] font-medium">{row.user?.[0]?.name ?? "Unassigned"}</span>
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-bold text-primary">
                      {row.count} open
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          {role === "DEPARTMENT_HEAD" && data.inbox?.length ? (
            <SectionCard title="Incoming files" description="Files dispatched to you and awaiting receipt">
              <ul className="divide-y divide-border">
                {data.inbox.map((movement) => (
                  <li key={movement._id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-[12.5px] font-semibold">{movement.file?.subject ?? "File movement"}</p>
                      <p className="font-mono text-[10.5px] text-muted-foreground">{movement.file?.fileId ?? "—"}</p>
                    </div>
                    <span className="text-[10.5px] text-muted-foreground">{formatDateTime(movement.dispatchedAt)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {data.district ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <SectionCard title="Grievances by department" description="District-wide distribution">
                <BarList items={data.district.grievanceByDepartment ?? []} humanize={false} />
              </SectionCard>
              <SectionCard title="Applications by department" description="Service demand across departments">
                <BarList items={data.district.applicationByDepartment ?? []} humanize={false} />
              </SectionCard>
            </div>
          ) : null}

          {data.alerts?.length ? (
            <SectionCard title="Active weather alerts" description="Alerts currently valid for the district">
              <ul className="space-y-2">
                {data.alerts.map((alert) => (
                  <li key={alert._id} className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft/60 px-3.5 py-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    <div>
                      <p className="text-[12px] font-semibold text-foreground">{alert.title ?? "Weather alert"}</p>
                      <p className="text-[11px] text-muted-foreground">{alert.message ?? "Monitor local conditions."}</p>
                      <p className="mt-1 text-[10.5px] font-medium text-warning">
                        {humanize(alert.severity ?? "")} · valid until {formatDateTime(alert.validTo)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {role === "SUPER_ADMIN" && data.system ? (
            <div className="grid gap-5 xl:grid-cols-3">
              <SectionCard title="Users by role" description="Active account distribution">
                <BarList
                  items={data.system.usersByRole.map((row) => ({ label: humanize(row._id), value: row.count }))}
                  humanize={false}
                />
              </SectionCard>
              <SectionCard title="Integration status" description="Configured external services">
                <ul className="space-y-2">
                  {data.system.integrations.map((integration) => (
                    <li key={integration._id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                      <span className="text-[12px] font-medium">{integration.name}</span>
                      <StatusBadge status={integration.status} />
                    </li>
                  ))}
                </ul>
              </SectionCard>
              <SectionCard title="Recent job runs" description="Scheduled maintenance health">
                <ul className="space-y-2">
                  {data.system.jobRuns.length ? (
                    data.system.jobRuns.map((run) => (
                      <li key={run._id} className="flex items-center justify-between gap-2 text-[11.5px]">
                        <span className="truncate font-medium">{run.jobName}</span>
                        <span className="flex items-center gap-2">
                          <StatusBadge status={run.status} />
                          <span className="text-[10px] text-muted-foreground">{formatDateTime(run.startedAt)}</span>
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-[11.5px] text-muted-foreground">No job runs recorded yet.</li>
                  )}
                </ul>
              </SectionCard>
            </div>
          ) : null}

          {role === "SUPER_ADMIN" && data.system?.auditRecent?.length ? (
            <SectionCard
              title="Recent audit activity"
              description="Latest recorded administrative actions"
              action={<Link href="/admin/audit" className="text-[11.5px] font-semibold text-primary hover:underline">Open audit log</Link>}
            >
              <ul className="divide-y divide-border">
                {data.system.auditRecent.map((entry) => (
                  <li key={entry._id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold">{humanize(entry.action)}</p>
                      <p className="truncate text-[10.5px] text-muted-foreground">
                        {entry.entityType ?? "System"} {entry.entityLabel ? `· ${entry.entityLabel}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SlaRow({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "info" }) {
  const styles = { danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", info: "bg-info-soft text-info" };
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cn("min-w-9 rounded-full px-2 py-0.5 text-center text-[11px] font-bold", styles[tone])}>{value}</span>
    </div>
  );
}

function CitizenStats({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
      <StatCard label="Total grievances" value={data.stats.totalGrievances ?? 0} icon={ClipboardList} tone="primary" href="/citizen/grievances" />
      <StatCard label="Open grievances" value={data.stats.openGrievances ?? 0} icon={Clock3} tone="warning" href="/citizen/grievances" />
      <StatCard label="Applications" value={data.stats.totalApplications ?? 0} icon={FileText} tone="info" href="/citizen/applications" />
      <StatCard label="Open applications" value={data.stats.openApplications ?? 0} icon={FileText} tone="neutral" href="/citizen/applications" />
      <StatCard label="Unread notices" value={data.stats.unread ?? 0} icon={BellRing} tone="danger" href="/notifications" />
    </div>
  );
}

function StaffStats({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
      <StatCard label="Grievances in scope" value={data.stats.totalGrievances ?? 0} icon={ClipboardList} tone="primary" />
      <StatCard label="Overdue" value={data.stats.overdueGrievances ?? 0} icon={ShieldAlert} tone="danger" />
      <StatCard label="Due soon" value={data.stats.dueSoonGrievances ?? 0} icon={Clock3} tone="warning" />
      <StatCard label="Open applications" value={data.stats.openApplications ?? 0} icon={FileText} tone="info" />
      <StatCard label="Digital files" value={data.stats.totalFiles ?? 0} icon={FolderKanban} tone="neutral" />
      <StatCard label="Open tasks" value={data.stats.openTasks ?? 0} icon={ListChecks} tone="success" href="/tasks" />
    </div>
  );
}

function HeadStats({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
      <StatCard label="Department grievances" value={data.stats.totalGrievances ?? 0} icon={ClipboardList} tone="primary" href="/dept-head/grievances" />
      <StatCard label="Overdue" value={data.stats.overdueGrievances ?? 0} icon={ShieldAlert} tone="danger" />
      <StatCard label="Pending approvals" value={data.stats.pendingApprovals ?? 0} icon={CheckCircle2} tone="warning" href="/dept-head/files" />
      <StatCard label="Digital files" value={data.stats.totalFiles ?? 0} icon={FolderKanban} tone="info" href="/dept-head/files" />
      <StatCard label="Open applications" value={data.stats.openApplications ?? 0} icon={FileText} tone="neutral" href="/dept-head/applications" />
      <StatCard label="Open tasks" value={data.stats.openTasks ?? 0} icon={ListChecks} tone="success" href="/tasks" />
    </div>
  );
}

function DistrictStats({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-8">
      <StatCard label="District grievances" value={data.stats.totalGrievances ?? 0} icon={ClipboardList} tone="primary" href="/district/grievances" />
      <StatCard label="Overdue" value={data.stats.overdueGrievances ?? 0} icon={ShieldAlert} tone="danger" />
      <StatCard label="Digital files" value={data.stats.totalFiles ?? 0} icon={FolderKanban} tone="info" href="/district/files" />
      <StatCard label="Departments" value={data.district?.departments ?? 0} icon={Building2} tone="neutral" href="/district/departments" />
      <StatCard label="Active staff" value={data.district?.activeStaff ?? 0} icon={Users} tone="success" />
      <StatCard label="Active incidents" value={data.district?.activeIncidents ?? 0} icon={AlertTriangle} tone="danger" />
      <StatCard label="Weather alerts" value={data.district?.activeAlerts ?? 0} icon={Gauge} tone="warning" />
      <StatCard label="Open road reports" value={data.district?.openRoadReports ?? 0} icon={RefreshCw} tone="info" />
    </div>
  );
}

function SystemStats({ data }: { data: DashboardData }) {
  const totalUsers = (data.system?.usersByRole ?? []).reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
      <StatCard label="Total users" value={totalUsers} icon={Users} tone="primary" href="/admin/users" />
      <StatCard label="Active staff" value={data.district?.activeStaff ?? 0} icon={ShieldAlert} tone="success" />
      <StatCard label="Grievances" value={data.stats.totalGrievances ?? 0} icon={ClipboardList} tone="info" />
      <StatCard label="Overdue" value={data.stats.overdueGrievances ?? 0} icon={Clock3} tone="danger" />
      <StatCard label="Digital files" value={data.stats.totalFiles ?? 0} icon={FolderKanban} tone="neutral" />
      <StatCard label="Active incidents" value={data.district?.activeIncidents ?? 0} icon={AlertTriangle} tone="warning" />
    </div>
  );
}
