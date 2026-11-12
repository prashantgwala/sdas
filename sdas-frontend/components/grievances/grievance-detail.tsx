"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PriorityBadge,
  SectionCard,
  StatusBadge,
  statusVariant,
} from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { Role, TimelineEventItem } from "@/lib/types";
import { cn, formatDate, formatDateTime, relativeTime, titleCase } from "@/lib/utils";
import { GrievanceWorkflow } from "./grievance-workflow";
import type { GrievanceActionItem, GrievanceDetailData } from "./types";

const BACK_LINKS: Record<Role, string> = {
  CITIZEN: "/citizen/grievances",
  CLERK: "/clerk/grievances",
  OFFICER: "/officer/grievances",
  DEPARTMENT_HEAD: "/dept-head/grievances",
  DISTRICT_ADMIN: "/district/grievances",
  SUPER_ADMIN: "/admin",
};

export function GrievanceDetail({ id }: { id: string }) {
  const { user, permissions } = useAuth();
  const [grievance, setGrievance] = useState<GrievanceDetailData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEventItem[]>([]);
  const [actions, setActions] = useState<GrievanceActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [detail, events, entries] = await Promise.all([
        api.get<GrievanceDetailData>(`/grievances/${id}`),
        api.get<TimelineEventItem[]>(`/grievances/${id}/timeline`),
        api.get<GrievanceActionItem[]>(`/grievances/${id}/actions`),
      ]);
      setGrievance(detail);
      setTimeline(events);
      setActions(entries);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingBlock label="Loading grievance" />;

  if (error || !grievance) {
    return (
      <div>
        <Link
          href={user ? BACK_LINKS[user.role] : "/login"}
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to grievances
        </Link>
        <Alert variant="error" title="Unable to load this grievance">
          {error || "The grievance could not be found."}
        </Alert>
      </div>
    );
  }

  const overdue =
    grievance.sla?.dueAt &&
    !["RESOLVED", "CLOSED", "REJECTED"].includes(grievance.status) &&
    new Date(grievance.sla.dueAt).getTime() < Date.now();

  const canFeedback =
    permissions.includes("feedback.create") &&
    ["RESOLVED", "CLOSED"].includes(grievance.status) &&
    !grievance.feedbackSubmitted;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={user ? BACK_LINKS[user.role] : "/login"}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to grievances
        </Link>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11.5px] font-semibold text-primary">
                {grievance.grievanceId ?? grievance._id}
              </span>
              <StatusBadge status={grievance.status} />
              <PriorityBadge priority={grievance.priority} />
              {overdue ? (
                <Badge variant="danger">
                  <AlertTriangle className="mr-1 size-3" aria-hidden />
                  SLA overdue
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {grievance.subject}
            </h1>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Filed {formatDateTime(grievance.createdAt)}
              {grievance.source === "ASSISTED" ? " · Assisted registration" : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <SectionCard title="Complaint details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail icon={UserRound} label="Complainant" value={grievance.contact?.name ?? grievance.citizen?.name ?? "—"} />
              <Detail icon={MessageSquare} label="Contact" value={grievance.contact?.mobile ?? grievance.citizen?.mobile ?? "—"} />
              <Detail icon={Building2} label="Department" value={grievance.department?.name ?? "Not routed yet"} />
              <Detail icon={ShieldCheck} label="Category" value={grievance.category?.name ?? "Unclassified"} />
              <Detail icon={MapPin} label="Location" value={grievance.location || grievance.tehsil?.name || "Not provided"} />
              <Detail icon={UserRound} label="Assigned officer" value={grievance.assignedOfficer?.name ?? "Unassigned"} />
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">
                {grievance.description}
              </p>
            </div>
            {grievance.attachments && grievance.attachments.length > 0 ? (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Attachments
                </p>
                <ul className="space-y-1.5">
                  {grievance.attachments.map((attachment) => (
                    <li key={attachment._id}>
                      <a
                        href={`/api/v1/documents/${attachment._id}/download`}
                        className="inline-flex items-center gap-2 text-[12.5px] font-medium text-primary hover:underline"
                      >
                        <Download className="size-3.5" aria-hidden />
                        {attachment.originalName ?? "Attachment"}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>

          {grievance.aiSuggestion?.category ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-info/20 bg-info-soft px-3.5 py-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
              <div className="text-[12px] leading-relaxed text-info">
                <p className="font-semibold">
                  Suggested classification: {grievance.aiSuggestion.category.name}
                  {grievance.aiSuggestion.confidence
                    ? ` · ${Math.round(grievance.aiSuggestion.confidence * 100)}% confidence`
                    : ""}
                </p>
                <p className="opacity-90">
                  AI suggestions are advisory only and are reviewed by authorised staff. Status:{" "}
                  {titleCase(grievance.aiSuggestion.status ?? "SUGGESTED")}.
                </p>
              </div>
            </div>
          ) : null}

          {grievance.resolution?.text ? (
            <SectionCard
              title="Resolution"
              description={grievance.resolution.submittedAt ? `Submitted ${formatDateTime(grievance.resolution.submittedAt)}` : undefined}
            >
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">
                {grievance.resolution.text}
              </p>
            </SectionCard>
          ) : null}

          {grievance.decision?.outcome ? (
            <SectionCard title="Supervisory decision">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={grievance.decision.outcome} />
                {grievance.decision.decidedAt ? (
                  <span className="text-[11.5px] text-muted-foreground">
                    {formatDateTime(grievance.decision.decidedAt)}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-foreground">{grievance.decision.reason}</p>
            </SectionCard>
          ) : null}

          <SectionCard title="Action history" description="Notings, evidence and action taken reports">
            {actions.length === 0 ? (
              <EmptyState compact title="No actions recorded yet" description="Officer notings and evidence will appear here." />
            ) : (
              <ul className="space-y-3">
                {actions.map((action) => (
                  <li key={action._id} className="rounded-lg border border-border bg-surface-muted/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={action.type === "ATR" ? "success" : action.type === "EVIDENCE" ? "info" : "neutral"}>
                        {titleCase(action.type)}
                      </Badge>
                      {action.visibility && action.visibility !== "INTERNAL" ? (
                        <Badge variant="outline">{titleCase(action.visibility)}</Badge>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">
                        {action.actor?.name ? `${action.actor.name} · ` : ""}
                        {formatDateTime(action.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-foreground">
                      {action.text}
                    </p>
                    {action.documents && action.documents.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-3">
                        {action.documents.map((document) => (
                          <a
                            key={document._id}
                            href={`/api/v1/documents/${document._id}/download`}
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
                          >
                            <FileText className="size-3" aria-hidden />
                            {document.originalName ?? "Document"}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Timeline" description="Chronological record of the grievance lifecycle">
            {timeline.length === 0 ? (
              <EmptyState compact title="No timeline events yet" />
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-4">
                {timeline.map((event) => (
                  <li key={event._id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[21.5px] top-1 size-2.5 rounded-full border-2 border-surface",
                        statusVariant(event.toStatus) === "success"
                          ? "bg-success"
                          : statusVariant(event.toStatus) === "danger"
                            ? "bg-danger"
                            : statusVariant(event.toStatus) === "warning"
                              ? "bg-warning"
                              : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-[12.5px] font-semibold text-foreground">{titleCase(event.action)}</p>
                      <p className="text-[10.5px] text-muted-foreground">{relativeTime(event.createdAt)}</p>
                    </div>
                    {event.message ? (
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{event.message}</p>
                    ) : null}
                    {event.actor?.name ? (
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">by {event.actor.name}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Service deadline">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg",
                  overdue ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary",
                )}
              >
                <CalendarClock className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {grievance.sla?.dueAt ? formatDate(grievance.sla.dueAt) : "Not scheduled"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {grievance.sla?.dueAt
                    ? overdue
                      ? `Overdue since ${relativeTime(grievance.sla.dueAt)}`
                      : `Due ${relativeTime(grievance.sla.dueAt)}`
                    : "A deadline is set when the grievance is routed."}
                </p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-border pt-3 text-[11.5px]">
              <Row label="SLA status" value={titleCase(grievance.sla?.status ?? "—")} />
              <Row label="Escalation level" value={String(grievance.sla?.escalationLevel ?? 0)} />
              <Row label="Reopen request" value={titleCase(grievance.reopenRequest?.status ?? "None")} />
            </dl>
          </SectionCard>

          <GrievanceWorkflow grievance={grievance} onUpdated={load} />

          {canFeedback ? (
            <FeedbackForm
              grievance={grievance}
              onDone={() => {
                setGrievance((current) => (current ? { ...current, feedbackSubmitted: true } : current));
              }}
            />
          ) : null}

          <SectionCard title="Record references">
            <dl className="space-y-2 text-[11.5px]">
              <Row label="Grievance ID" value={grievance.grievanceId ?? grievance._id} mono />
              <Row label="Source" value={titleCase(grievance.source ?? "CITIZEN")} />
              <Row label="Category" value={grievance.category?.name ?? "—"} />
              <Row label="Department" value={grievance.department?.name ?? "—"} />
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[12.5px] font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium text-foreground", mono && "font-mono text-[10.5px]")}>{value}</dd>
    </div>
  );
}

function FeedbackForm({
  grievance,
  onDone,
}: {
  grievance: GrievanceDetailData;
  onDone: () => void;
}) {
  const [rating, setRating] = useState("5");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/feedback", {
        grievance: grievance._id,
        category: grievance.category?.name ?? "Grievance",
        text: text.trim(),
        rating: Number(rating),
      });
      setDone(true);
      onDone();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="card-surface flex items-start gap-3 p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <div>
          <p className="text-[13px] font-semibold text-foreground">Thank you for your feedback</p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            It helps the district administration improve service quality.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface p-4">
      <h2 className="text-[13.5px] font-semibold text-foreground">Rate the resolution</h2>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        Your rating is used for service quality monitoring.
      </p>
      {error ? (
        <div className="mt-3">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
      <div className="mt-3 space-y-3">
        <Field label="Rating" htmlFor="rating" required>
          <Select id="rating" value={rating} onChange={(event) => setRating(event.target.value)}>
            <option value="5">5 — Excellent</option>
            <option value="4">4 — Good</option>
            <option value="3">3 — Satisfactory</option>
            <option value="2">2 — Needs improvement</option>
            <option value="1">1 — Poor</option>
          </Select>
        </Field>
        <Field label="Comments" htmlFor="feedback-text" required>
          <Textarea
            id="feedback-text"
            rows={3}
            minLength={5}
            maxLength={3000}
            required
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="What went well or what could be improved?"
          />
        </Field>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit feedback"}
        </Button>
      </div>
    </form>
  );
}
