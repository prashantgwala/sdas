"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, Headset, Lock, Send, ShieldAlert, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader, PriorityBadge, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { OfficerOption } from "@/lib/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import type { HelpdeskTicketDetail } from "./types";

export function HelpdeskDetail({ id, audience }: { id: string; audience: "citizen" | "staff" }) {
  const { session, permissions } = useAuth();
  const isStaff = audience === "staff";
  const canReply = isStaff
    ? permissions.includes("helpdesk.reply")
    : permissions.includes("helpdesk.create");
  const canAssign = isStaff && permissions.includes("helpdesk.assign");
  const canClose = isStaff && permissions.includes("helpdesk.close");

  const [ticket, setTicket] = useState<HelpdeskTicketDetail | null>(null);
  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [resolution, setResolution] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api
      .get<HelpdeskTicketDetail>(`/helpdesk/${id}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setTicket(data);
        setAssignTo(
          typeof data.assignedTo === "object" && data.assignedTo
            ? String(data.assignedTo._id ?? "")
            : "",
        );
        setResolution(data.resolution ?? "");
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
    if (!canAssign) return;
    api
      .get<OfficerOption[]>("/reference/officers")
      .then(setOfficers)
      .catch(() => undefined);
  }, [canAssign]);

  function refresh(message: string) {
    setNotice(message);
    setReloadKey((value) => value + 1);
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/helpdesk/${id}/messages`, { content: reply.trim(), internal: isStaff ? internal : false });
      setReply("");
      setInternal(false);
      refresh(isStaff && internal ? "Internal note added." : "Reply sent.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!assignTo) {
      setError("Select a staff member to assign this ticket.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/helpdesk/${id}/assign`, { assignedTo: assignTo });
      refresh("Ticket assigned.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status: "RESOLVED" | "CLOSED") {
    if (status === "RESOLVED" && !resolution.trim() && !ticket?.resolution) {
      setError("Add a resolution note before resolving the ticket.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/helpdesk/${id}/status`, { status, resolution: resolution.trim() || undefined });
      refresh(status === "RESOLVED" ? "Ticket resolved and citizen notified." : "Ticket closed.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading ticket…" />;
  if (!ticket) {
    return (
      <div>
        <PageHeader title="Ticket not found" />
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Link
          href={isStaff ? "/helpdesk" : "/citizen/helpdesk"}
          className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to helpdesk
        </Link>
      </div>
    );
  }

  const closed = ticket.status === "CLOSED";
  const overdue =
    ticket.sla?.dueAt &&
    !["RESOLVED", "CLOSED"].includes(ticket.status) &&
    new Date(ticket.sla.dueAt).getTime() < Date.now();
  const currentUserId = session?.user.id;

  return (
    <div>
      <PageHeader
        title={ticket.subject}
        description={`${ticket.ticketId ?? "Ticket"} · ${ticket.category} · raised ${relativeTime(ticket.createdAt)}`}
        eyebrow="Helpdesk ticket"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <Link
              href={isStaff ? "/helpdesk" : "/citizen/helpdesk"}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-surface px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Back
            </Link>
          </div>
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <SectionCard title="Conversation" description="All public replies are visible to the citizen.">
            <ul className="space-y-3">
              {ticket.messages.map((message, index) => {
                const isCitizenMessage =
                  message.author && ticket.citizen?._id
                    ? String(message.author) === String(ticket.citizen._id)
                    : false;
                const isMine = currentUserId && message.author ? String(message.author) === currentUserId : false;
                return (
                  <li
                    key={`${message.at}-${index}`}
                    className={cn(
                      "rounded-xl border p-3",
                      message.internal
                        ? "border-warning/40 bg-warning-soft/50"
                        : isCitizenMessage
                          ? "border-border bg-surface"
                          : "border-primary/25 bg-primary-soft/25",
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-surface text-muted-foreground">
                        {isCitizenMessage ? <UserRound className="size-3" aria-hidden /> : <Headset className="size-3" aria-hidden />}
                      </span>
                      <span className="text-[11.5px] font-semibold text-foreground">
                        {message.authorName ?? (isCitizenMessage ? "Citizen" : "Support")}
                        {isMine ? " (you)" : ""}
                      </span>
                      {isCitizenMessage ? <Badge variant="info">Citizen</Badge> : null}
                      {message.internal ? (
                        <Badge variant="warning" className="inline-flex items-center gap-1">
                          <Lock className="size-2.5" aria-hidden />
                          Internal
                        </Badge>
                      ) : null}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {formatDateTime(message.at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap pl-8 text-[12.5px] leading-relaxed text-foreground/90">
                      {message.content}
                    </p>
                  </li>
                );
              })}
            </ul>

            {closed ? (
              <div className="mt-4">
                <Alert variant="info">This ticket is closed. Closed tickets cannot receive new messages.</Alert>
              </div>
            ) : canReply ? (
              <form onSubmit={sendReply} className="mt-4 space-y-2">
                <Textarea
                  rows={3}
                  maxLength={5000}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={
                    isStaff
                      ? "Reply to the citizen or add an internal note…"
                      : "Add a reply for the support team…"
                  }
                  aria-label="Reply"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {isStaff ? (
                    <label className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={internal}
                        onChange={(event) => setInternal(event.target.checked)}
                        className="size-3.5 rounded border-input accent-primary"
                      />
                      Internal note (hidden from citizen)
                    </label>
                  ) : (
                    <span className="text-[10.5px] text-muted-foreground">
                      Replying to a resolved ticket reopens it for follow-up.
                    </span>
                  )}
                  <Button type="submit" size="sm" disabled={saving || !reply.trim()}>
                    <Send className="size-3.5" aria-hidden />
                    {saving ? "Sending…" : isStaff && internal ? "Add note" : "Send reply"}
                  </Button>
                </div>
              </form>
            ) : null}
          </SectionCard>

          {canClose && !closed ? (
            <SectionCard
              title={ticket.status === "RESOLVED" ? "Close ticket" : "Resolve ticket"}
              description="The resolution note is shared with the citizen and stored in the audit trail."
            >
              <div className="space-y-3">
                <Field label="Resolution note" htmlFor="ticket-resolution">
                  <Textarea
                    id="ticket-resolution"
                    rows={3}
                    maxLength={3000}
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    placeholder="Explain what was done and any next steps for the citizen."
                    className="mt-1"
                  />
                </Field>
                <div className="flex flex-wrap justify-end gap-2">
                  {ticket.status !== "RESOLVED" ? (
                    <Button variant="success" size="sm" onClick={() => void updateStatus("RESOLVED")} disabled={saving}>
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      Mark resolved
                    </Button>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={() => void updateStatus("CLOSED")} disabled={saving}>
                    Close ticket
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-4">
          <SectionCard title="Ticket details">
            <dl className="space-y-2.5 text-[12px]">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Citizen</dt>
                <dd className="text-right font-medium text-foreground">
                  {ticket.citizen?.name ?? "—"}
                  {ticket.citizen?.mobile ? (
                    <span className="block text-[10.5px] font-normal text-muted-foreground">{ticket.citizen.mobile}</span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="text-right font-medium text-foreground">{ticket.category}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Department</dt>
                <dd className="text-right font-medium text-foreground">{ticket.department?.name ?? "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Assigned to</dt>
                <dd className="text-right font-medium text-foreground">{ticket.assignedTo?.name ?? "Unassigned"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Raised</dt>
                <dd className="text-right font-medium text-foreground">{formatDateTime(ticket.createdAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">SLA due</dt>
                <dd className={cn("text-right font-medium", overdue ? "text-danger" : "text-foreground")}>
                  {ticket.sla?.dueAt ? formatDateTime(ticket.sla.dueAt) : "—"}
                </dd>
              </div>
              {ticket.resolvedAt ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Resolved</dt>
                  <dd className="text-right font-medium text-foreground">{formatDateTime(ticket.resolvedAt)}</dd>
                </div>
              ) : null}
            </dl>
            {overdue ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11px] font-semibold text-danger">
                <ShieldAlert className="size-3.5" aria-hidden />
                SLA breached
              </p>
            ) : null}
            {ticket.resolution ? (
              <div className="mt-3 rounded-lg bg-success-soft/60 px-3 py-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-success">Resolution</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/90">{ticket.resolution}</p>
              </div>
            ) : null}
          </SectionCard>

          {canAssign && !closed ? (
            <SectionCard title="Assign ticket" description="Route the ticket to a staff member.">
              <form onSubmit={assign} className="space-y-2.5">
                <Select
                  aria-label="Assign to"
                  value={assignTo}
                  onChange={(event) => setAssignTo(event.target.value)}
                >
                  <option value="">Select a staff member</option>
                  {officers.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.name}
                      {officer.designation ? ` · ${officer.designation}` : ""}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm" className="w-full" disabled={saving || !assignTo}>
                  Assign
                </Button>
              </form>
            </SectionCard>
          ) : null}

          <SectionCard title="Service level">
            <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden />
              Helpdesk tickets follow district SLA timelines. Overdue tickets are escalated by the scheduled job.
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
