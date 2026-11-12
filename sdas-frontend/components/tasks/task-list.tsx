"use client";

import Link from "next/link";
import { CalendarClock, CheckCircle2, ListChecks, PencilLine, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta, MeetingTaskItem } from "@/lib/types";
import { cn, formatDate, relativeTime, titleCase } from "@/lib/utils";

const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "OVERDUE", "CANCELLED"] as const;

const statusOptions = TASK_STATUSES.map((status) => ({ value: status, label: titleCase(status) }));

function toDateInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function TaskList() {
  const { permissions } = useAuth();
  const canManage = permissions.includes("meeting.task.update");
  const canAssign = permissions.includes("meeting.task.assign");
  const [items, setItems] = useState<MeetingTaskItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(true);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ status: "", dueDate: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

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
    if (mine) params.set("mine", "true");
    params.set("sort", "dueDate");

    setLoading(true);
    setError("");
    api
      .list<MeetingTaskItem>(`/tasks?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, status, mine, reloadKey]);

  function startEdit(task: MeetingTaskItem) {
    setEditing(task._id);
    setForm({
      status: task.status,
      dueDate: toDateInput(task.dueDate),
      description: task.description ?? "",
    });
    setFormError("");
    setNotice("");
  }

  function cancelEdit() {
    setEditing(null);
    setFormError("");
  }

  async function saveEdit(id: string) {
    if (!form.description.trim() || form.description.trim().length < 5) {
      setFormError("Describe the action item in at least 5 characters.");
      return;
    }
    if (!form.dueDate) {
      setFormError("Choose a due date for this action item.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await api.patch<MeetingTaskItem>(`/tasks/${id}`, {
        status: form.status,
        description: form.description.trim(),
        dueDate: new Date(`${form.dueDate}T00:00:00.000Z`).toISOString(),
      });
      setNotice("Action item updated.");
      setEditing(null);
      window.dispatchEvent(new CustomEvent("sdas:counters-changed"));
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(task: MeetingTaskItem, next: string) {
    setSaving(true);
    setError("");
    try {
      await api.patch<MeetingTaskItem>(`/tasks/${task._id}`, { status: next });
      setNotice(next === "COMPLETED" ? "Action item marked completed." : `Action item marked ${titleCase(next).toLowerCase()}.`);
      window.dispatchEvent(new CustomEvent("sdas:counters-changed"));
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const statusChoices = canAssign
    ? statusOptions
    : statusOptions.filter((option) => ["OPEN", "IN_PROGRESS", "COMPLETED"].includes(option.value));

  return (
    <div>
      <PageHeader
        title="My tasks"
        description="Action items assigned through department and district review meetings."
        eyebrow="Work queue"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search action items"
          className="w-full sm:w-72"
        />
        <FilterSelect
          label="Status"
          value={status}
          placeholder="All statuses"
          options={statusOptions}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setMine((value) => !value);
            setPage(1);
          }}
          aria-pressed={mine}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
            mine
              ? "border-primary/35 bg-primary-soft text-primary"
              : "border-input bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          <UserRound className="size-3.5" aria-hidden />
          Only mine
        </button>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading tasks…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={appliedQ || status ? "No tasks match these filters" : "No action items assigned"}
            description={
              appliedQ || status
                ? "Clear the filters or search with a different keyword."
                : "Tasks created from meeting minutes will appear here with their due dates."
            }
          />
        ) : (
          <>
            <ul className="space-y-3">
              {items.map((task) => {
                const overdue =
                  task.dueDate &&
                  !["COMPLETED", "CANCELLED"].includes(task.status) &&
                  new Date(task.dueDate).getTime() < Date.now();
                const isEditing = editing === task._id;
                return (
                  <li key={task._id} className="rounded-xl border border-border">
                    <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                            <ListChecks className="size-3.5" aria-hidden />
                          </span>
                          <p className={cn("text-[13px] font-semibold leading-snug text-foreground", task.status === "COMPLETED" && "line-through opacity-70")}>
                            {task.description ?? task.title}
                          </p>
                          <StatusBadge status={task.status} />
                          {task.status === "OVERDUE" || overdue ? (
                            <span className="text-[10.5px] font-semibold text-danger">Overdue</span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-9 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3" aria-hidden />
                            Due{" "}
                            <span className={cn(overdue && "font-semibold text-danger")}>
                              {task.dueDate ? relativeTime(task.dueDate) : "—"}
                            </span>
                            {task.dueDate ? <span className="text-muted-foreground/70">({formatDate(task.dueDate)})</span> : null}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="size-3" aria-hidden />
                            {task.assignedTo?.name ?? "Unassigned"}
                          </span>
                          {task.meeting ? (
                            <Link
                              href={`/meetings/${task.meeting._id}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              {task.meeting.title ?? "Meeting"}
                            </Link>
                          ) : null}
                          {task.taskId ? <span className="font-mono text-[10px]">{task.taskId}</span> : null}
                        </div>
                      </div>
                      {canManage ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                          {task.status !== "COMPLETED" ? (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => void quickStatus(task, "COMPLETED")}
                              disabled={saving}
                            >
                              <CheckCircle2 className="size-3.5" aria-hidden />
                              Complete
                            </Button>
                          ) : null}
                          {task.status === "OPEN" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void quickStatus(task, "IN_PROGRESS")}
                              disabled={saving}
                            >
                              Start
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="sm" onClick={() => (isEditing ? cancelEdit() : startEdit(task))}>
                            <PencilLine className="size-3.5" aria-hidden />
                            {isEditing ? "Close" : "Update"}
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div className="border-t border-border bg-surface-muted/50 p-3.5">
                        {formError ? (
                          <div className="mb-3">
                            <Alert variant="error">{formError}</Alert>
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor={`task-status-${task._id}`}>Status</Label>
                            <select
                              id={`task-status-${task._id}`}
                              value={form.status}
                              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                              className="mt-1 flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
                            >
                              {statusChoices.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label htmlFor={`task-due-${task._id}`}>Due date</Label>
                            <Input
                              id={`task-due-${task._id}`}
                              type="date"
                              value={form.dueDate}
                              onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                              className="mt-1 h-10"
                            />
                          </div>
                        </div>
                        <div className="mt-3">
                          <Label htmlFor={`task-description-${task._id}`}>Action item</Label>
                          <Textarea
                            id={`task-description-${task._id}`}
                            rows={3}
                            value={form.description}
                            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                            className="mt-1"
                          />
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => void saveEdit(task._id)} disabled={saving}>
                            {saving ? "Saving…" : "Save changes"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
