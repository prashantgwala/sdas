"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, MapPin, Plus, RotateCcw, Users, Video } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
  Table,
  TableLink,
  TableWrap,
  Td,
  Th,
} from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta } from "@/lib/types";
import { cn, formatDateTime, titleCase } from "@/lib/utils";
import type { MeetingSummary } from "./types";

interface OfficerOption {
  id: string;
  name: string;
  designation?: string | null;
  roleLabel?: string;
}

const STATUS_OPTIONS = ["SCHEDULED", "COMPLETED", "CANCELLED"].map((status) => ({
  value: status,
  label: titleCase(status),
}));

const TYPE_OPTIONS = ["DISTRICT", "DEPARTMENT", "REVIEW", "EMERGENCY"].map((type) => ({
  value: type,
  label: titleCase(type),
}));

function toLocalDateTime(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function defaultSchedule(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(11, 0, 0, 0);
  return toLocalDateTime(date);
}

export function MeetingList() {
  const router = useRouter();
  const { permissions, user } = useAuth();
  const canCreate = permissions.includes("meeting.create");
  const canListOfficers = permissions.includes("meeting.task.assign");
  const isDistrict = user?.role === "DISTRICT_ADMIN" || user?.role === "SUPER_ADMIN";

  const [items, setItems] = useState<MeetingSummary[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "",
    agenda: "",
    type: "DEPARTMENT",
    scheduledAt: defaultSchedule(),
    durationMinutes: "60",
    mode: "PHYSICAL",
    location: "",
    visibility: "INTERNAL",
  });
  const [creating, setCreating] = useState(false);
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
    if (type) params.set("type", type);
    if (mine) params.set("mine", "true");

    setLoading(true);
    setError("");
    api
      .list<MeetingSummary>(`/meetings?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, status, type, mine, reloadKey]);

  useEffect(() => {
    if (!showCreate || !canListOfficers) return;
    api
      .get<OfficerOption[]>("/reference/officers")
      .then(setOfficers)
      .catch(() => setOfficers([]));
  }, [showCreate, canListOfficers]);

  const officerLabel = useMemo(() => new Map(officers.map((officer) => [officer.id, officer])), [officers]);

  function toggleParticipant(id: string) {
    setParticipants((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (form.title.trim().length < 5) {
      setFormError("Enter a meeting title of at least 5 characters.");
      return;
    }
    if (form.agenda.trim().length < 10) {
      setFormError("Describe the agenda in at least 10 characters.");
      return;
    }
    if (!form.scheduledAt) {
      setFormError("Choose when the meeting is scheduled.");
      return;
    }
    setCreating(true);
    try {
      const result = await api.post<MeetingSummary>("/meetings", {
        title: form.title.trim(),
        agenda: form.agenda.trim(),
        type: form.type,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: Number(form.durationMinutes) || 60,
        mode: form.mode,
        location: form.location.trim() || undefined,
        visibility: form.visibility,
        participants: participants.map((id) => ({ user: id, name: officerLabel.get(id)?.name ?? "Participant" })),
      });
      setNotice("Meeting scheduled.");
      setShowCreate(false);
      setParticipants([]);
      setForm((current) => ({
        ...current,
        title: "",
        agenda: "",
        location: "",
        scheduledAt: defaultSchedule(),
      }));
      router.push(`/meetings/${result._id}`);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  function resetFilters() {
    setQ("");
    setAppliedQ("");
    setStatus("");
    setType("");
    setMine(false);
    setPage(1);
  }

  const hasFilters = Boolean(appliedQ || status || type || mine);

  return (
    <div>
      <PageHeader
        title="Meetings & reviews"
        description="Department and district review meetings, minutes and the action items they generate."
        eyebrow="Meeting management"
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setShowCreate((value) => !value)}>
              <Plus className="size-4" aria-hidden />
              Schedule meeting
            </Button>
          ) : null
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

      {showCreate ? (
        <form onSubmit={handleCreate} className="card-surface mb-5 space-y-4 p-5">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Schedule a meeting</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Participants receive an in-app notification when the meeting is created.
            </p>
          </div>
          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" htmlFor="meeting-title" required className="sm:col-span-2">
              <Input
                id="meeting-title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Monthly departmental review"
                maxLength={250}
              />
            </Field>
            <Field label="Agenda" htmlFor="meeting-agenda" required className="sm:col-span-2">
              <Textarea
                id="meeting-agenda"
                rows={3}
                value={form.agenda}
                onChange={(event) => setForm((current) => ({ ...current, agenda: event.target.value }))}
                placeholder="Points to be discussed, decisions required and expected outcomes."
                maxLength={5000}
              />
            </Field>
            <Field label="Meeting type" htmlFor="meeting-type">
              <Select
                id="meeting-type"
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
              >
                {TYPE_OPTIONS.filter((option) => option.value !== "DISTRICT" || isDistrict).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Scheduled at" htmlFor="meeting-scheduled" required>
              <Input
                id="meeting-scheduled"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))}
              />
            </Field>
            <Field label="Duration (minutes)" htmlFor="meeting-duration">
              <Input
                id="meeting-duration"
                type="number"
                min={15}
                max={1440}
                value={form.durationMinutes}
                onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))}
              />
            </Field>
            <Field label="Mode" htmlFor="meeting-mode">
              <Select
                id="meeting-mode"
                value={form.mode}
                onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))}
              >
                <option value="PHYSICAL">Physical</option>
                <option value="ONLINE">Online</option>
                <option value="HYBRID">Hybrid</option>
              </Select>
            </Field>
            <Field label="Location / link" htmlFor="meeting-location">
              <Input
                id="meeting-location"
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                placeholder="Conference room or meeting link"
                maxLength={300}
              />
            </Field>
            <Field label="Visibility" htmlFor="meeting-visibility">
              <Select
                id="meeting-visibility"
                value={form.visibility}
                onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}
              >
                <option value="INTERNAL">Internal</option>
                <option value="PUBLIC">Public</option>
              </Select>
            </Field>
          </div>

          {canListOfficers ? (
            <div>
              <p className="text-[13px] font-semibold text-foreground">Participants</p>
              <p className="mb-2 text-[11px] text-muted-foreground">Optional. Select officers to invite.</p>
              <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                {officers.length === 0 ? (
                  <p className="p-1.5 text-[11.5px] text-muted-foreground">No officers available to invite.</p>
                ) : (
                  officers.map((officer) => (
                    <label
                      key={officer.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors",
                        participants.includes(officer.id)
                          ? "bg-primary-soft text-primary"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={participants.includes(officer.id)}
                        onChange={() => toggleParticipant(officer.id)}
                        className="size-3.5 accent-[var(--primary)]"
                      />
                      <span className="truncate">
                        {officer.name}
                        {officer.designation ? (
                          <span className="text-[10.5px] opacity-70"> · {officer.designation}</span>
                        ) : null}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Scheduling…" : "Schedule meeting"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search meetings or agenda"
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
          label="Type"
          value={type}
          placeholder="All types"
          options={TYPE_OPTIONS}
          onChange={(value) => {
            setType(value);
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
          <Users className="size-3.5" aria-hidden />
          Mine
        </button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading meetings…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No meetings match these filters" : "No meetings scheduled"}
            description={
              hasFilters
                ? "Clear the filters or search with a different keyword."
                : canCreate
                  ? "Schedule a review meeting to record minutes and assign action items."
                  : "Meetings you are invited to will appear here."
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Meeting</Th>
                    <Th>Scheduled</Th>
                    <Th>Type</Th>
                    <Th>Mode</Th>
                    <Th>Organizer</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((meeting) => (
                    <tr key={meeting._id}>
                      <Td>
                        <TableLink href={`/meetings/${meeting._id}`}>{meeting.title}</TableLink>
                        {meeting.meetingId ? (
                          <p className="font-mono text-[10px] text-muted-foreground">{meeting.meetingId}</p>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
                          <CalendarDays className="size-3.5" aria-hidden />
                          {formatDateTime(meeting.scheduledAt)}
                        </span>
                        <p className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                          <Clock className="size-3" aria-hidden />
                          {meeting.durationMinutes ?? 60} minutes
                        </p>
                      </Td>
                      <Td>
                        <Badge variant={meeting.type === "EMERGENCY" ? "danger" : "neutral"}>
                          {titleCase(meeting.type)}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                          {meeting.mode === "ONLINE" ? (
                            <Video className="size-3.5" aria-hidden />
                          ) : (
                            <MapPin className="size-3.5" aria-hidden />
                          )}
                          {titleCase(meeting.mode ?? "PHYSICAL")}
                        </span>
                        {meeting.location ? (
                          <p className="mt-0.5 max-w-[180px] truncate text-[10.5px] text-muted-foreground">
                            {meeting.location}
                          </p>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="text-[11.5px] text-muted-foreground">{meeting.organizer?.name ?? "—"}</span>
                      </Td>
                      <Td>
                        <StatusBadge status={meeting.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <div className="mt-4">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          </>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Open a meeting to draft minutes, generate an AI-assisted summary for review, approve minutes or assign
        follow-up action items.{" "}
        <Link href="/tasks" className="font-semibold text-primary hover:underline">
          View my tasks
        </Link>
      </p>
    </div>
  );
}
