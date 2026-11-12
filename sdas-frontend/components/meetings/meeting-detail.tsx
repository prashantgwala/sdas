"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, ListChecks, MapPin, Sparkles, UserRound, Video } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate, formatDateTime, titleCase } from "@/lib/utils";
import type { MeetingTaskItem } from "@/lib/types";
import { participantName, participantUserId, type MeetingDetailData, type MeetingParticipant } from "./types";

interface OfficerOption {
  id: string;
  name: string;
  designation?: string | null;
}

interface AiSummaryResult {
  summary: string;
  actionPoints: string[];
  generatedAt?: string;
  requiresReview?: boolean;
}

export function MeetingDetail({ id }: { id: string }) {
  const { permissions } = useAuth();
  const canDraft = permissions.includes("meeting.minutes.draft");
  const canApprove = permissions.includes("meeting.minutes.approve");
  const canAssignTask = permissions.includes("meeting.task.assign");
  const canUpdateTask = permissions.includes("meeting.task.update");

  const [meeting, setMeeting] = useState<MeetingDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [minutesDraft, setMinutesDraft] = useState("");
  const [attendance, setAttendance] = useState<Record<string, "INVITED" | "PRESENT" | "ABSENT">>({});
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [minutesError, setMinutesError] = useState("");
  const [aiResult, setAiResult] = useState<AiSummaryResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [taskForm, setTaskForm] = useState({ description: "", assignedTo: "", dueDate: "" });
  const [taskError, setTaskError] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskSaving, setTaskSaving] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api
      .get<MeetingDetailData>(`/meetings/${id}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setMeeting(data);
        setMinutesDraft(data.minutes?.content ?? "");
        const nextAttendance: Record<string, "INVITED" | "PRESENT" | "ABSENT"> = {};
        for (const participant of data.participants ?? []) {
          nextAttendance[participantKey(participant)] = participant.attendance ?? "INVITED";
        }
        setAttendance(nextAttendance);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  useEffect(() => {
    if (!canAssignTask) return;
    api
      .get<OfficerOption[]>("/reference/officers")
      .then(setOfficers)
      .catch(() => setOfficers([]));
  }, [canAssignTask]);

  const tasks = meeting?.tasks ?? [];
  const approved = meeting?.minutes?.status === "APPROVED";
  const openTasks = tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)).length;
  const attendanceSummary = useMemo(() => {
    const values = Object.values(attendance);
    return {
      present: values.filter((value) => value === "PRESENT").length,
      absent: values.filter((value) => value === "ABSENT").length,
      invited: values.filter((value) => value === "INVITED").length,
    };
  }, [attendance]);

  function refresh(message?: string) {
    if (message) setNotice(message);
    setReloadKey((value) => value + 1);
  }

  async function saveMinutes(event: FormEvent) {
    event.preventDefault();
    setMinutesError("");
    if (minutesDraft.trim().length < 20) {
      setMinutesError("Minutes must contain at least 20 characters.");
      return;
    }
    setSavingMinutes(true);
    try {
      const attendancePayload = (meeting?.participants ?? []).map((participant) => ({
        user: participantUserId(participant) ?? undefined,
        name: participantName(participant),
        attendance: attendance[participantKey(participant)] ?? "INVITED",
      }));
      await api.post(`/meetings/${id}/minutes`, {
        content: minutesDraft.trim(),
        attendance: attendancePayload,
      });
      refresh("Minutes saved as a draft.");
    } catch (cause) {
      setMinutesError(errorMessage(cause));
    } finally {
      setSavingMinutes(false);
    }
  }

  async function generateSummary() {
    setAiLoading(true);
    setError("");
    setAiResult(null);
    try {
      const result = await api.post<AiSummaryResult>(`/meetings/${id}/minutes/summarize`, {
        content: minutesDraft.trim().length >= 20 ? minutesDraft.trim() : undefined,
      });
      setAiResult(result);
      setNotice("AI-assisted summary generated. Review it before relying on it.");
      refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAiLoading(false);
    }
  }

  async function approveMinutes() {
    if (!window.confirm("Approve these minutes? The meeting will be marked completed.")) return;
    setError("");
    try {
      await api.post(`/meetings/${id}/minutes/approve`, {});
      refresh("Minutes approved and the meeting marked completed.");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    setTaskError("");
    if (taskForm.description.trim().length < 5) {
      setTaskError("Describe the action item in at least 5 characters.");
      return;
    }
    if (!taskForm.assignedTo) {
      setTaskError("Select the officer responsible for this action.");
      return;
    }
    if (!taskForm.dueDate) {
      setTaskError("Choose a due date for the action item.");
      return;
    }
    setCreatingTask(true);
    try {
      await api.post(`/meetings/${id}/tasks`, {
        description: taskForm.description.trim(),
        assignedTo: taskForm.assignedTo,
        dueDate: new Date(`${taskForm.dueDate}T23:59:59`).toISOString(),
      });
      setTaskForm({ description: "", assignedTo: "", dueDate: "" });
      refresh("Action item assigned.");
    } catch (cause) {
      setTaskError(errorMessage(cause));
    } finally {
      setCreatingTask(false);
    }
  }

  async function updateTaskStatus(task: MeetingTaskItem, status: string) {
    setTaskSaving(task._id);
    setError("");
    try {
      await api.patch(`/tasks/${task._id}`, { status });
      refresh(status === "COMPLETED" ? "Action item completed." : `Action item moved to ${titleCase(status)}.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setTaskSaving(null);
    }
  }

  if (loading) return <LoadingBlock label="Loading meeting" />;
  if (!meeting) {
    return (
      <div>
        <Link href="/meetings" className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to meetings
        </Link>
        <Alert variant="error">{error || "Meeting not found."}</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={meeting.title}
        description={meeting.agenda}
        eyebrow={meeting.meetingId ? `Meeting · ${meeting.meetingId}` : "Meeting"}
        actions={
          <Link href="/meetings" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            All meetings
          </Link>
        }
      />

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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={meeting.status} />
        <Badge variant={meeting.type === "EMERGENCY" ? "danger" : "neutral"}>{titleCase(meeting.type)}</Badge>
        <Badge variant="outline">{titleCase(meeting.mode ?? "PHYSICAL")}</Badge>
        {meeting.visibility === "PUBLIC" ? <Badge variant="info">Public</Badge> : null}
        <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden />
          {formatDateTime(meeting.scheduledAt)}
        </span>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {meeting.durationMinutes ?? 60} minutes
        </span>
        {meeting.location ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
            {meeting.mode === "ONLINE" ? <Video className="size-3.5" aria-hidden /> : <MapPin className="size-3.5" aria-hidden />}
            {meeting.location}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <SectionCard
            title="Minutes"
            description={
              approved
                ? `Approved${meeting.minutes?.approvedAt ? ` on ${formatDate(meeting.minutes.approvedAt)}` : ""}.`
                : "Draft the record of discussion. Minutes require approval to finalize the meeting."
            }
            action={
              <Badge variant={approved ? "success" : meeting.minutes?.content ? "warning" : "neutral"}>
                {titleCase(meeting.minutes?.status ?? "DRAFT")}
              </Badge>
            }
          >
            {canDraft && !approved ? (
              <form onSubmit={saveMinutes} className="space-y-3">
                {minutesError ? <Alert variant="error">{minutesError}</Alert> : null}
                <Field label="Minutes content" htmlFor="meeting-minutes" required>
                  <Textarea
                    id="meeting-minutes"
                    rows={10}
                    value={minutesDraft}
                    onChange={(event) => setMinutesDraft(event.target.value)}
                    placeholder="Record attendance, discussion points, decisions taken and follow-up actions."
                    maxLength={30000}
                  />
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    {attendanceSummary.present} present · {attendanceSummary.absent} absent ·{" "}
                    {attendanceSummary.invited} invited
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void generateSummary()}
                      disabled={aiLoading || minutesDraft.trim().length < 20}
                    >
                      <Sparkles className="size-3.5" aria-hidden />
                      {aiLoading ? "Generating…" : "AI summary"}
                    </Button>
                    <Button type="submit" size="sm" disabled={savingMinutes}>
                      {savingMinutes ? "Saving…" : "Save draft"}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-muted/50 p-3 text-[12.5px] leading-relaxed text-foreground">
                  {meeting.minutes?.content || "No minutes recorded yet."}
                </pre>
                {canDraft && approved ? (
                  <p className="text-[11px] text-muted-foreground">Approved minutes are read-only.</p>
                ) : null}
              </div>
            )}

            {meeting.minutes?.aiSummary ? (
              <div className="mt-4 rounded-xl border border-info/25 bg-info-soft/40 p-3.5">
                <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-info">
                  <Sparkles className="size-3.5" aria-hidden />
                  AI-assisted summary · requires human review
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">
                  {meeting.minutes.aiSummary}
                </p>
                {aiResult?.actionPoints?.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-foreground">
                    {aiResult.actionPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {canApprove && !approved && meeting.minutes?.content ? (
              <div className="mt-3 flex justify-end border-t border-border pt-3">
                <Button variant="success" size="sm" onClick={() => void approveMinutes()}>
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Approve minutes
                </Button>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Action items"
            description="Follow-up tasks created from this meeting."
            action={<Badge variant={openTasks > 0 ? "warning" : "success"}>{openTasks} open</Badge>}
            contentClassName={tasks.length === 0 ? "p-5" : "p-0"}
          >
            {tasks.length === 0 ? (
              <EmptyState
                title="No action items"
                description="Assign follow-up work to officers after the meeting."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Action</Th>
                      <Th>Assigned to</Th>
                      <Th>Due</Th>
                      <Th>Status</Th>
                      {canUpdateTask ? <Th>Update</Th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => {
                      const overdue =
                        task.dueDate &&
                        !["COMPLETED", "CANCELLED"].includes(task.status) &&
                        new Date(task.dueDate).getTime() < Date.now();
                      return (
                        <tr key={task._id}>
                          <Td>
                            <p className="max-w-[320px] text-[12.5px] text-foreground">{task.description}</p>
                            {task.taskId ? (
                              <p className="font-mono text-[10px] text-muted-foreground">{task.taskId}</p>
                            ) : null}
                          </Td>
                          <Td>
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                              <UserRound className="size-3.5" aria-hidden />
                              {task.assignedTo?.name ?? "Unassigned"}
                            </span>
                          </Td>
                          <Td>
                            <span className={cn("whitespace-nowrap text-[11.5px]", overdue ? "font-semibold text-danger" : "text-muted-foreground")}>
                              {task.dueDate ? formatDate(task.dueDate) : "—"}
                            </span>
                          </Td>
                          <Td>
                            <StatusBadge status={task.status} />
                          </Td>
                          {canUpdateTask ? (
                            <Td>
                              <div className="flex flex-wrap gap-1.5">
                                {task.status === "OPEN" ? (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void updateTaskStatus(task, "IN_PROGRESS")}
                                    disabled={taskSaving === task._id}
                                  >
                                    Start
                                  </Button>
                                ) : null}
                                {!["COMPLETED", "CANCELLED"].includes(task.status) ? (
                                  <Button
                                    variant="success"
                                    size="sm"
                                    onClick={() => void updateTaskStatus(task, "COMPLETED")}
                                    disabled={taskSaving === task._id}
                                  >
                                    Complete
                                  </Button>
                                ) : null}
                              </div>
                            </Td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}

            {canAssignTask ? (
              <form onSubmit={createTask} className="space-y-3 border-t border-border p-4 sm:p-5">
                <p className="text-[13px] font-semibold text-foreground">Assign an action item</p>
                {taskError ? <Alert variant="error">{taskError}</Alert> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Action" htmlFor="task-description" required className="sm:col-span-2">
                    <Textarea
                      id="task-description"
                      rows={2}
                      value={taskForm.description}
                      onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="What must be done, and what evidence is expected?"
                      maxLength={3000}
                    />
                  </Field>
                  <Field label="Assign to" htmlFor="task-assignee" required>
                    <Select
                      id="task-assignee"
                      value={taskForm.assignedTo}
                      onChange={(event) => setTaskForm((current) => ({ ...current, assignedTo: event.target.value }))}
                    >
                      <option value="">Select officer</option>
                      {officers.map((officer) => (
                        <option key={officer.id} value={officer.id}>
                          {officer.name}
                          {officer.designation ? ` · ${officer.designation}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Due date" htmlFor="task-due" required>
                    <Input
                      id="task-due"
                      type="date"
                      value={taskForm.dueDate}
                      onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
                    />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={creatingTask}>
                    <ListChecks className="size-3.5" aria-hidden />
                    {creatingTask ? "Assigning…" : "Assign action item"}
                  </Button>
                </div>
              </form>
            ) : null}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Participants" description={`${meeting.participants?.length ?? 0} invited`}>
            {(meeting.participants?.length ?? 0) === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">No participants were invited.</p>
            ) : (
              <ul className="space-y-2.5">
                {(meeting.participants ?? []).map((participant, index) => {
                  const key = participantKey(participant);
                  const status = attendance[key] ?? participant.attendance ?? "INVITED";
                  return (
                    <li key={`${key}-${index}`} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-foreground">
                            {participantName(participant)}
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">
                            {participant.role || "Participant"}
                          </p>
                        </div>
                        <Badge
                          variant={status === "PRESENT" ? "success" : status === "ABSENT" ? "danger" : "neutral"}
                        >
                          {titleCase(status)}
                        </Badge>
                      </div>
                      {canDraft && !approved ? (
                        <div className="mt-2">
                          <Label htmlFor={`attendance-${index}`} className="sr-only">
                            Attendance for {participantName(participant)}
                          </Label>
                          <Select
                            id={`attendance-${index}`}
                            value={status}
                            onChange={(event) =>
                              setAttendance((current) => ({
                                ...current,
                                [key]: event.target.value as "INVITED" | "PRESENT" | "ABSENT",
                              }))
                            }
                            className="h-8 text-[11.5px]"
                          >
                            <option value="INVITED">Invited</option>
                            <option value="PRESENT">Present</option>
                            <option value="ABSENT">Absent</option>
                          </Select>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Meeting details">
            <dl className="space-y-2.5 text-[12px]">
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Organizer
                </dt>
                <dd className="mt-0.5 text-foreground">{meeting.organizer?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Department
                </dt>
                <dd className="mt-0.5 text-foreground">
                  {meeting.department && typeof meeting.department === "object"
                    ? meeting.department.name
                    : "District-wide"}
                </dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Scheduled
                </dt>
                <dd className="mt-0.5 text-foreground">{formatDateTime(meeting.scheduledAt)}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Agenda
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{meeting.agenda}</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function participantKey(participant: MeetingParticipant): string {
  return participantUserId(participant) ?? participant.name;
}
