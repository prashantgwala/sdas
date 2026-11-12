"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  MessageSquareText,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BarList,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  Table,
  TableWrap,
  Td,
  Th,
  TrendChart,
  humanizeStatus,
} from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta, GrievanceSummary, ReferenceCatalogs } from "@/lib/types";
import { cn, formatDate, relativeTime, titleCase } from "@/lib/utils";
import type { FeedbackAnalytics, FeedbackItem } from "./types";

const FALLBACK_CATEGORIES = [
  "Service quality",
  "Staff behaviour",
  "Response time",
  "Information clarity",
  "Digital experience",
  "Other",
];

const STATUS_OPTIONS = [
  { value: "PENDING_REVIEW", label: "Pending review" },
  { value: "REVIEWED", label: "Reviewed" },
];

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((value) => ({
  value: String(value),
  label: `${value} star${value > 1 ? "s" : ""}`,
}));

function Stars({
  value,
  onChange,
  readOnly = false,
  size = "size-4",
}: {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-0.5" role={readOnly ? "img" : "group"} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        if (readOnly) {
          return (
            <Star
              key={star}
              className={cn(size, active ? "fill-warning text-warning" : "text-muted-foreground/35")}
              aria-hidden
            />
          );
        }
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange?.(star)}
            aria-label={`Rate ${star} out of 5`}
            aria-pressed={active}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={cn(size, active ? "fill-warning text-warning" : "text-muted-foreground/40")}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

function CitizenFeedback() {
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [grievances, setGrievances] = useState<GrievanceSummary[]>([]);
  const [category, setCategory] = useState("");
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [grievanceId, setGrievanceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<FeedbackItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [page, setPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const categoryOptions = useMemo(() => {
    const names = (catalogs?.grievanceCategories ?? [])
      .filter((item) => !item.parent)
      .map((item) => item.name);
    return names.length ? names : FALLBACK_CATEGORIES;
  }, [catalogs]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then((data) => {
        if (!cancelled) setCatalogs(data);
      })
      .catch(() => undefined);
    api
      .list<GrievanceSummary>("/grievances?limit=50")
      .then((result) => {
        if (!cancelled) setGrievances(result.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError("");
    api
      .list<FeedbackItem>(`/feedback/mine?page=${page}&limit=8`, { signal: controller.signal })
      .then((result) => {
        setHistory(result.items);
        setMeta(result.meta);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setHistoryError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [page, reloadKey]);

  const eligibleGrievances = grievances.filter(
    (grievance) =>
      ["RESOLVED", "CLOSED"].includes(grievance.status) && !grievance.feedbackSubmitted,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!category) {
      setError("Choose the area your feedback relates to.");
      return;
    }
    if (!rating) {
      setError("Select a star rating from 1 to 5.");
      return;
    }
    if (text.trim().length < 5) {
      setError("Tell us a little more — at least 5 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post<FeedbackItem>("/feedback", {
        category,
        text: text.trim(),
        rating,
        ...(grievanceId ? { grievance: grievanceId } : {}),
      });
      setNotice("Thank you — your feedback has been recorded.");
      setCategory("");
      setRating(0);
      setText("");
      setGrievanceId("");
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new CustomEvent("sdas:counters-changed"));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="Rate the service you received and help the district improve. Feedback linked to a resolved grievance is shared with the concerned department."
        eyebrow="Citizen voice"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SectionCard
          title="Share your feedback"
          description="Your response is reviewed by department heads to improve services."
        >
          {error ? (
            <div className="mb-3">
              <Alert variant="error">{error}</Alert>
            </div>
          ) : null}
          {notice ? (
            <div className="mb-3">
              <Alert variant="success">{notice}</Alert>
            </div>
          ) : null}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="feedback-category">What is this about?</Label>
              <select
                id="feedback-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-1 flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
              >
                <option value="">Select a category</option>
                {categoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Overall rating</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <Stars value={rating} onChange={setRating} size="size-7" />
                <span className="text-[12px] text-muted-foreground">
                  {rating ? `${rating} / 5` : "Not rated yet"}
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="feedback-text">Your feedback</Label>
              <Textarea
                id="feedback-text"
                rows={5}
                value={text}
                maxLength={3000}
                onChange={(event) => setText(event.target.value)}
                placeholder="Describe your experience with the service, staff response and resolution quality."
                className="mt-1"
              />
              <p className="mt-1 text-right text-[10.5px] text-muted-foreground">{text.length}/3000</p>
            </div>

            <div>
              <Label htmlFor="feedback-grievance">Link a resolved grievance (optional)</Label>
              <select
                id="feedback-grievance"
                value={grievanceId}
                onChange={(event) => setGrievanceId(event.target.value)}
                className="mt-1 flex h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
              >
                <option value="">General feedback</option>
                {eligibleGrievances.map((grievance) => (
                  <option key={grievance._id} value={grievance._id}>
                    {grievance.grievanceId ? `${grievance.grievanceId} · ` : ""}
                    {grievance.subject}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                Only resolved or closed grievances that have not already received feedback appear here.
              </p>
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit feedback"}
            </Button>
          </form>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title="Your feedback history"
            description="Everything you have shared with the administration."
          >
            {historyError ? (
              <div className="mb-3">
                <Alert variant="error">{historyError}</Alert>
              </div>
            ) : null}
            {historyLoading ? (
              <LoadingBlock label="Loading your feedback…" />
            ) : history.length === 0 ? (
              <EmptyState
                compact
                title="No feedback yet"
                description="Your submitted feedback and review notes will appear here."
              />
            ) : (
              <>
                <ul className="space-y-3">
                  {history.map((item) => (
                    <li key={item._id} className="rounded-xl border border-border p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-foreground">{item.category}</span>
                          <StatusBadge status={item.status} />
                        </div>
                        <Stars value={item.rating} readOnly size="size-3.5" />
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-foreground/90">{item.text}</p>
                      {item.aiTopics?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.aiTopics.map((topic) => (
                            <span
                              key={topic}
                              className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary"
                            >
                              {titleCase(topic)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {item.reviewNotes ? (
                        <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-2 text-[11.5px] text-muted-foreground">
                          <span className="font-semibold text-foreground">Review note:</span> {item.reviewNotes}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[10.5px] text-muted-foreground">
                        {item.grievance?.grievanceId ? `${item.grievance.grievanceId} · ` : ""}
                        {item.grievance?.subject ? `${item.grievance.subject} · ` : ""}
                        {formatDate(item.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Pagination meta={meta} onPage={setPage} />
                </div>
              </>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function StaffFeedback({ canAnalyze, canReview }: { canAnalyze: boolean; canReview: boolean }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [analytics, setAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(canAnalyze);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (rating) params.set("rating", rating);

    setLoading(true);
    setError("");
    api
      .list<FeedbackItem>(`/feedback?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, status, rating, reloadKey]);

  useEffect(() => {
    if (!canAnalyze) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    api
      .get<FeedbackAnalytics>("/feedback/analytics")
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canAnalyze, reloadKey]);

  function startReview(item: FeedbackItem) {
    setReviewing(item._id);
    setReviewNotes(item.reviewNotes ?? "");
    setNotice("");
    setError("");
  }

  async function submitReview(id: string) {
    setSaving(true);
    setError("");
    try {
      await api.post<FeedbackItem>(`/feedback/${id}/review`, {
        reviewNotes: reviewNotes.trim() || undefined,
      });
      setNotice("Feedback marked as reviewed.");
      setReviewing(null);
      setReviewNotes("");
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const trendData = (analytics?.trend ?? []).map((point) => ({ date: point._id, value: point.count }));
  const ratingBars = [5, 4, 3, 2, 1].map((star) => ({
    label: `${star} star`,
    value: analytics?.ratingDistribution.find((entry) => entry._id === star)?.count ?? 0,
  }));
  const topicBars = (analytics?.topTopics ?? []).map((topic) => ({
    label: humanizeStatus(topic._id),
    value: topic.count,
  }));

  return (
    <div>
      <PageHeader
        title={canReview ? "Citizen feedback" : "Feedback insights"}
        description="Review what citizens are saying about department services and act on recurring themes."
        eyebrow="Service quality"
      />

      {canAnalyze ? (
        analyticsLoading ? (
          <div className="card-surface mb-4">
            <LoadingBlock label="Loading feedback analytics…" />
          </div>
        ) : analytics ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total feedback"
                value={analytics.summary.total}
                hint="All time"
                icon={MessageSquareText}
                tone="primary"
              />
              <StatCard
                label="Average rating"
                value={analytics.summary.averageRating ? analytics.summary.averageRating.toFixed(1) : "—"}
                hint="Out of 5 stars"
                icon={Star}
                tone="warning"
              />
              <StatCard
                label="Pending review"
                value={analytics.summary.pending}
                hint="Awaiting departmental review"
                icon={ClipboardCheck}
                tone="info"
              />
              <StatCard
                label="Reviewed"
                value={analytics.summary.reviewed}
                hint="Closed by a department head"
                icon={CheckCircle2}
                tone="success"
              />
            </div>

            <div className="mb-4 grid gap-4 lg:grid-cols-3">
              <SectionCard
                title="Feedback trend"
                description="Daily volume over the last 30 days"
                className="lg:col-span-2"
              >
                <TrendChart data={trendData} label="Last 30 days" height={140} />
              </SectionCard>
              <SectionCard title="Rating distribution" description="How citizens rate services">
                <BarList items={ratingBars} emptyLabel="No ratings yet" humanize={false} />
              </SectionCard>
            </div>

            <div className="mb-4 grid gap-4 lg:grid-cols-3">
              <SectionCard title="Recurring topics" description="Extracted from feedback text">
                <BarList items={topicBars} emptyLabel="No recurring topics yet" humanize={false} />
              </SectionCard>
              <SectionCard title="By category" description="Volume and average rating" className="lg:col-span-2">
                {analytics.byCategory.length === 0 ? (
                  <EmptyState compact title="No category data" description="Categories appear as feedback is submitted." />
                ) : (
                  <ul className="space-y-2.5">
                    {analytics.byCategory.map((entry) => (
                      <li
                        key={entry._id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                      >
                        <span className="text-[12px] font-medium text-foreground">{humanizeStatus(entry._id)}</span>
                        <span className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <TrendingUp className="size-3" aria-hidden />
                            {entry.averageRating ? entry.averageRating.toFixed(1) : "—"} avg
                          </span>
                          <span className="font-semibold text-foreground">{entry.count}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            {analytics.byDepartment.length ? (
              <div className="mb-4">
                <SectionCard title="Department scorecard" description="Feedback volume and satisfaction by department">
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Department</Th>
                          <Th>Feedback</Th>
                          <Th>Average rating</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byDepartment.map((entry) => (
                          <tr key={String(entry._id ?? "unassigned")}>
                            <Td className="font-medium text-foreground">
                              {entry.department?.[0]?.name ?? "Unassigned"}
                            </Td>
                            <Td>{entry.count}</Td>
                            <Td>
                              <span className="inline-flex items-center gap-1.5">
                                <Stars value={Math.round(entry.averageRating ?? 0)} readOnly size="size-3" />
                                <span className="text-muted-foreground">
                                  {entry.averageRating ? entry.averageRating.toFixed(1) : "—"}
                                </span>
                              </span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                </SectionCard>
              </div>
            ) : null}
          </>
        ) : null
      ) : null}

      <SectionCard
        title="Feedback inbox"
        description={
          canReview
            ? "Review citizen feedback, record notes and acknowledge service quality."
            : "Read-only view of feedback submitted to your office."
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search feedback text"
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
            label="Rating"
            value={rating}
            placeholder="All ratings"
            options={RATING_OPTIONS}
            onChange={(value) => {
              setRating(value);
              setPage(1);
            }}
          />
        </div>

        {error ? (
          <div className="mb-3">
            <Alert variant="error">{error}</Alert>
          </div>
        ) : null}
        {notice ? (
          <div className="mb-3">
            <Alert variant="success">{notice}</Alert>
          </div>
        ) : null}

        {loading ? (
          <LoadingBlock label="Loading feedback…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={appliedQ || status || rating ? "No feedback matches these filters" : "No feedback yet"}
            description={
              appliedQ || status || rating
                ? "Clear the filters or search with a different keyword."
                : "Citizen feedback will appear here once it is submitted."
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Citizen</Th>
                    <Th>Category</Th>
                    <Th>Rating</Th>
                    <Th>Feedback</Th>
                    <Th>Department</Th>
                    <Th>Submitted</Th>
                    <Th>Status</Th>
                    {canReview ? <Th><span className="sr-only">Actions</span></Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isReviewing = reviewing === item._id;
                    return (
                      <Fragment key={item._id}>
                        <tr>
                          <Td>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{item.citizen?.name ?? "Citizen"}</p>
                              {item.grievance ? (
                                <p className="truncate text-[10.5px] text-muted-foreground">
                                  {item.grievance.grievanceId ?? item.grievance.subject}
                                </p>
                              ) : null}
                            </div>
                          </Td>
                          <Td className="whitespace-nowrap">{item.category}</Td>
                          <Td>
                            <Stars value={item.rating} readOnly size="size-3.5" />
                          </Td>
                          <Td className="max-w-[320px]">
                            <p className="line-clamp-2 text-[12px] leading-relaxed text-foreground/90">{item.text}</p>
                            {item.aiTopics?.length ? (
                              <p className="mt-1 truncate text-[10.5px] text-muted-foreground">
                                <Sparkles className="mr-1 inline size-3" aria-hidden />
                                {item.aiTopics.map((topic) => titleCase(topic)).join(", ")}
                              </p>
                            ) : null}
                          </Td>
                          <Td className="whitespace-nowrap text-muted-foreground">{item.department?.name ?? "—"}</Td>
                          <Td className="whitespace-nowrap text-muted-foreground">{relativeTime(item.createdAt)}</Td>
                          <Td>
                            <StatusBadge status={item.status} />
                          </Td>
                          {canReview ? (
                            <Td className="whitespace-nowrap">
                              {item.status === "PENDING_REVIEW" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => (isReviewing ? setReviewing(null) : startReview(item))}
                                >
                                  {isReviewing ? "Close" : "Review"}
                                </Button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                                  <CheckCircle2 className="size-3" aria-hidden />
                                  {item.reviewedBy?.name ?? "Reviewed"}
                                </span>
                              )}
                            </Td>
                          ) : null}
                        </tr>
                        {isReviewing ? (
                          <tr>
                            <td colSpan={canReview ? 8 : 7} className="border-b border-border/70 bg-surface-muted/40 px-4 py-3">
                              <div className="flex flex-col gap-2">
                                <Textarea
                                  rows={2}
                                  value={reviewNotes}
                                  onChange={(event) => setReviewNotes(event.target.value)}
                                  placeholder="Optional internal note about this feedback"
                                  aria-label="Review notes"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => setReviewing(null)} disabled={saving}>
                                    Cancel
                                  </Button>
                                  <Button size="sm" onClick={() => void submitReview(item._id)} disabled={saving}>
                                    {saving ? "Saving…" : "Mark reviewed"}
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <div className="mt-4">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          </>
        )}
      </SectionCard>

      <p className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <Users className="size-3" aria-hidden />
        Feedback is scoped to your role: department staff see their department, district admins see the whole district.
      </p>
    </div>
  );
}

export function FeedbackView() {
  const { session, permissions } = useAuth();
  const isCitizen = session?.user.role === "CITIZEN";
  const canRead = permissions.includes("feedback.read.dept") || permissions.includes("feedback.read.district");
  const canAnalyze = permissions.includes("feedback.analyze");
  const canReview = permissions.includes("feedback.review");

  if (isCitizen && !canRead) return <CitizenFeedback />;
  if (canRead) return <StaffFeedback canAnalyze={canAnalyze} canReview={canReview} />;
  return (
    <EmptyState
      title="Feedback is not available for your role"
      description="Ask your district administrator if you need access to the feedback workspace."
    />
  );
}
