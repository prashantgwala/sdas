"use client";

import { Activity, CircleAlert, Clock, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, PageHeader, SectionCard, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface JobRunRow {
  _id: string;
  jobName: string;
  startedAt: string;
  finishedAt?: string | null;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  stats?: Record<string, number> | null;
  error?: string | null;
  trigger: "SCHEDULE" | "MANUAL";
}

const JOBS = [
  {
    name: "sla-monitor",
    label: "SLA monitor",
    schedule: "Every 15 minutes",
    description: "Flags due-soon and overdue grievances, files and applications, then escalates them.",
  },
  {
    name: "task-deadline",
    label: "Task deadlines",
    schedule: "Hourly",
    description: "Reminds assignees about upcoming task deadlines and marks missed deadlines.",
  },
  {
    name: "weather-expiry",
    label: "Weather alert expiry",
    schedule: "Every 30 minutes",
    description: "Expires weather alerts past their validity and refreshes active alert state.",
  },
  {
    name: "retention-archival",
    label: "Retention & archival",
    schedule: "Daily at 02:15",
    description: "Archives records that reached their retention limit under the configured retention rules.",
  },
] as const;

function duration(run: JobRunRow): string {
  if (!run.finishedAt) return run.status === "RUNNING" ? "Running…" : "—";
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function JobRunsView() {
  const [runs, setRuns] = useState<JobRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedJob, setSelectedJob] = useState<string>(JOBS[0].name);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<JobRunRow[]>("/admin/job-runs", { signal });
      setRuns(data);
    } catch (cause) {
      if (!signal?.aborted) setError(errorMessage(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function run(name: string) {
    setRunning(name);
    setError("");
    setNotice("");
    try {
      await api.post(`/admin/jobs/${name}/run`);
      setNotice(`${JOBS.find((job) => job.name === name)?.label ?? name} completed.`);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRunning(null);
    }
  }

  const latest = new Map<string, JobRunRow>();
  for (const run of runs) {
    if (!latest.has(run.jobName)) latest.set(run.jobName, run);
  }

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Scheduled jobs"
        description="Background maintenance jobs enforce SLA clocks, task deadlines, weather alert expiry and retention rules. Runs are recorded for audit."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        }
      />

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {JOBS.map((job) => {
          const last = latest.get(job.name);
          const busy = running === job.name;
          return (
            <div key={job.name} className="card-surface flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground">{job.label}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                    <Clock className="size-3" aria-hidden />
                    {job.schedule}
                  </p>
                </div>
                {last ? <StatusBadge status={last.status} /> : null}
              </div>
              <p className="mt-2 line-clamp-3 flex-1 text-[11px] leading-relaxed text-muted-foreground">{job.description}</p>
              <p className="mt-2 text-[10.5px] text-muted-foreground">
                {last ? `Last run ${formatDateTime(last.startedAt)} · ${duration(last)}` : "No runs recorded yet"}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => void run(job.name)}
                disabled={busy}
              >
                <Play className="size-3" aria-hidden />
                {busy ? "Running…" : "Run now"}
              </Button>
            </div>
          );
        })}
      </div>

      <SectionCard
        title="Recent runs"
        description="The last 50 executions across all maintenance jobs."
        action={
          <Select
            value={selectedJob}
            onChange={(event) => setSelectedJob(event.target.value)}
            aria-label="Filter runs by job"
            className="h-8 w-44 text-[12px]"
          >
            <option value="">All jobs</option>
            {JOBS.map((job) => (
              <option key={job.name} value={job.name}>{job.label}</option>
            ))}
          </Select>
        }
      >
        {loading ? (
          <LoadingBlock label="Loading job runs…" />
        ) : (
          (() => {
            const filtered = selectedJob ? runs.filter((item) => item.jobName === selectedJob) : runs;
            if (!filtered.length) {
              return <EmptyState title="No job runs" description="Scheduled jobs run automatically once the scheduler is enabled, or you can trigger one manually." />;
            }
            return (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Job</Th>
                      <Th>Trigger</Th>
                      <Th>Started</Th>
                      <Th>Duration</Th>
                      <Th>Status</Th>
                      <Th>Result</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item._id}>
                        <Td>
                          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                            <Activity className="size-3.5 text-muted-foreground" aria-hidden />
                            {item.jobName}
                          </span>
                        </Td>
                        <Td><span className="text-[11.5px] text-muted-foreground">{item.trigger === "MANUAL" ? "Manual" : "Schedule"}</span></Td>
                        <Td><span className="whitespace-nowrap text-[11.5px] text-muted-foreground">{formatDateTime(item.startedAt)}</span></Td>
                        <Td><span className="whitespace-nowrap text-[11.5px] text-muted-foreground">{duration(item)}</span></Td>
                        <Td><StatusBadge status={item.status} /></Td>
                        <Td>
                          {item.error ? (
                            <span className="inline-flex max-w-[320px] items-start gap-1.5 text-[11px] text-danger">
                              <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                              <span className="line-clamp-2">{item.error}</span>
                            </span>
                          ) : item.stats && Object.keys(item.stats).length ? (
                            <div className="flex max-w-[360px] flex-wrap gap-1">
                              {Object.entries(item.stats).map(([key, value]) => (
                                <span key={key} className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                                  {key}: <span className="font-semibold text-foreground">{value}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            );
          })()
        )}
      </SectionCard>
    </div>
  );
}
