"use client";

import Link from "next/link";
import { Bot, Headset, LifeBuoy, MessageSquarePlus, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, PageHeader, PriorityBadge, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { FilterSelect, Pagination } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import type { HelpdeskTicketSummary } from "./types";

const SUPPORT_CATEGORIES = [
  { value: "Grievance support", label: "Grievance support" },
  { value: "Application support", label: "Application support" },
  { value: "Document and file support", label: "Document and file support" },
  { value: "Certificate service", label: "Certificate service" },
  { value: "Portal or login issue", label: "Portal or login issue" },
  { value: "Payment or fee issue", label: "Payment or fee issue" },
  { value: "Other", label: "Other" },
];

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status) => ({
  value: status,
  label: status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()),
}));

export function CitizenHelpdesk() {
  const [tickets, setTickets] = useState<HelpdeskTicketSummary[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState({
    subject: "",
    category: SUPPORT_CATEGORIES[0].value,
    description: "",
    priority: "NORMAL",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "8" });
    if (status) params.set("status", status);
    setLoading(true);
    setError("");
    api
      .list<HelpdeskTicketSummary>(`/helpdesk/mine?${params.toString()}`, { signal: controller.signal })
      .then((result) => {
        setTickets(result.items);
        setMeta(result.meta);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, status, reloadKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    if (form.subject.trim().length < 5) {
      setFormError("Give a short subject of at least 5 characters.");
      return;
    }
    if (form.description.trim().length < 10) {
      setFormError("Describe the issue in at least 10 characters so support can help.");
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await api.post<HelpdeskTicketSummary>("/helpdesk", {
        subject: form.subject.trim(),
        category: form.category,
        description: form.description.trim(),
        priority: form.priority,
      });
      setNotice(`Ticket ${ticket.ticketId ?? ""} created. Support will respond from the helpdesk.`);
      setForm({ subject: "", category: SUPPORT_CATEGORIES[0].value, description: "", priority: "NORMAL" });
      setPage(1);
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        description="Raise a support ticket for portal issues, document problems or service questions. You can also ask the AI assistant first."
        eyebrow="Support"
        actions={
          <Link
            href="/citizen/chatbot"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-surface px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Bot className="size-3.5" aria-hidden />
            Ask AI assistant
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="New support ticket" description="Tell us what you need help with.">
          {formError ? (
            <div className="mb-3">
              <Alert variant="error">{formError}</Alert>
            </div>
          ) : null}
          <form onSubmit={submit} className="space-y-3.5">
            <Field label="Subject" htmlFor="ticket-subject" required>
              <Input
                id="ticket-subject"
                value={form.subject}
                maxLength={250}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                placeholder="Short summary of the issue"
                className="mt-1"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" htmlFor="ticket-category">
                <Select
                  id="ticket-category"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="mt-1"
                >
                  {SUPPORT_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="ticket-priority">
                <Select
                  id="ticket-priority"
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                  className="mt-1"
                >
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => (
                    <option key={priority} value={priority}>
                      {priority.charAt(0) + priority.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="ticket-description" required>
              <Textarea
                id="ticket-description"
                rows={5}
                maxLength={5000}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Explain the issue, what you tried and any reference numbers."
                className="mt-1"
              />
            </Field>
            <Button type="submit" disabled={submitting}>
              <MessageSquarePlus className="size-3.5" aria-hidden />
              {submitting ? "Creating ticket…" : "Create ticket"}
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title="My tickets"
          description="Track responses from the support team."
          action={
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
          }
        >
          {loading ? (
            <LoadingBlock label="Loading tickets…" />
          ) : tickets.length === 0 ? (
            <EmptyState
              title={status ? "No tickets with this status" : "No support tickets yet"}
              description={
                status
                  ? "Try a different status filter."
                  : "Create a ticket and the support team will respond in the helpdesk."
              }
            />
          ) : (
            <>
              <ul className="space-y-3">
                {tickets.map((ticket) => (
                  <li key={ticket._id}>
                    <Link
                      href={`/citizen/helpdesk/${ticket._id}`}
                      className="block rounded-xl border border-border p-3.5 transition-colors hover:border-primary/35 hover:bg-primary-soft/20"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                          <LifeBuoy className="size-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                          {ticket.subject}
                        </span>
                        <StatusBadge status={ticket.status} />
                      </div>
                      <p className="mt-1.5 line-clamp-2 pl-9 text-[11.5px] leading-relaxed text-muted-foreground">
                        {ticket.description}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-[10.5px] text-muted-foreground">
                        {ticket.ticketId ? <span className="font-mono">{ticket.ticketId}</span> : null}
                        <span>{ticket.category}</span>
                        <PriorityBadge priority={ticket.priority} />
                        <span>Raised {relativeTime(ticket.createdAt)}</span>
                        {ticket.assignedTo?.name ? (
                          <span className="inline-flex items-center gap-1">
                            <Headset className="size-3" aria-hidden />
                            {ticket.assignedTo.name}
                          </span>
                        ) : null}
                      </div>
                    </Link>
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

      <p className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <Send className="size-3" aria-hidden />
        You will receive an in-app notification whenever support replies or resolves your ticket.
      </p>
    </div>
  );
}
