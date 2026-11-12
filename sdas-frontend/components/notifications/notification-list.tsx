"use client";

import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  FileText,
  FolderKanban,
  Info,
  ListChecks,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { FilterSelect, Pagination } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta, NotificationItem } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

const NOTIFICATION_TYPES = [
  "GRIEVANCE_SUBMITTED",
  "GRIEVANCE_ASSIGNED",
  "GRIEVANCE_OVERDUE",
  "GRIEVANCE_STATUS_CHANGED",
  "FILE_RECEIVED",
  "FILE_FORWARDED",
  "FILE_APPROVAL_PENDING",
  "FILE_APPROVED",
  "FILE_RETURNED",
  "APPLICATION_DOCUMENT_MISSING",
  "APPLICATION_STATUS_CHANGED",
  "MEETING_SCHEDULED",
  "TASK_DEADLINE",
  "ESCALATION_ALERT",
  "ACCOUNT_CREATED",
  "SYSTEM",
] as const;

const TYPE_META: Record<string, { icon: ComponentType<{ className?: string }>; tone: string; label: string }> = {
  GRIEVANCE_SUBMITTED: { icon: ClipboardList, tone: "bg-primary-soft text-primary", label: "Grievance" },
  GRIEVANCE_ASSIGNED: { icon: ClipboardList, tone: "bg-info-soft text-info", label: "Grievance" },
  GRIEVANCE_OVERDUE: { icon: ShieldAlert, tone: "bg-danger-soft text-danger", label: "Grievance" },
  GRIEVANCE_STATUS_CHANGED: { icon: ClipboardList, tone: "bg-info-soft text-info", label: "Grievance" },
  FILE_RECEIVED: { icon: FolderKanban, tone: "bg-info-soft text-info", label: "File" },
  FILE_FORWARDED: { icon: FolderKanban, tone: "bg-primary-soft text-primary", label: "File" },
  FILE_APPROVAL_PENDING: { icon: FolderKanban, tone: "bg-warning-soft text-warning", label: "File" },
  FILE_APPROVED: { icon: FolderKanban, tone: "bg-success-soft text-success", label: "File" },
  FILE_RETURNED: { icon: FolderKanban, tone: "bg-danger-soft text-danger", label: "File" },
  APPLICATION_DOCUMENT_MISSING: { icon: FileText, tone: "bg-warning-soft text-warning", label: "Application" },
  APPLICATION_STATUS_CHANGED: { icon: FileText, tone: "bg-info-soft text-info", label: "Application" },
  MEETING_SCHEDULED: { icon: CalendarDays, tone: "bg-primary-soft text-primary", label: "Meeting" },
  TASK_DEADLINE: { icon: ListChecks, tone: "bg-warning-soft text-warning", label: "Task" },
  ESCALATION_ALERT: { icon: ShieldAlert, tone: "bg-danger-soft text-danger", label: "Escalation" },
  ACCOUNT_CREATED: { icon: Bell, tone: "bg-muted text-muted-foreground", label: "Account" },
  SYSTEM: { icon: Info, tone: "bg-muted text-muted-foreground", label: "System" },
};

const typeOptions = NOTIFICATION_TYPES.map((type) => ({
  value: type,
  label: type
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" "),
}));

export function NotificationList() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const unread = Number(meta?.unread ?? 0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "15" });
    if (unreadOnly) params.set("unread", "true");
    if (type) params.set("type", type);

    setLoading(true);
    setError("");
    api
      .list<NotificationItem>(`/notifications?${params.toString()}`, { signal: controller.signal })
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
  }, [page, unreadOnly, type, reloadKey]);

  function countersChanged() {
    window.dispatchEvent(new CustomEvent("sdas:counters-changed"));
  }

  async function markRead(id: string) {
    setBusy(id);
    try {
      await api.post<{ updated: number }>("/notifications/read", { ids: [id] });
      setItems((current) =>
        current.map((item) => (item._id === id ? { ...item, readAt: new Date().toISOString() } : item)),
      );
      setMeta((current) => (current ? { ...current, unread: Math.max(0, unread - 1) } : current));
      countersChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function markAllRead() {
    setBusy("all");
    try {
      const result = await api.post<{ updated: number }>("/notifications/read-all");
      setNotice(result.updated ? `${result.updated} notification(s) marked as read.` : "You have no unread notifications.");
      countersChanged();
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await api.delete<null>(`/notifications/${id}`);
      setItems((current) => current.filter((item) => item._id !== id));
      countersChanged();
      if (items.length === 1 && page > 1) setPage((value) => value - 1);
      else setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function open(item: NotificationItem) {
    if (!item.readAt) await markRead(item._id);
    if (item.link) router.push(item.link);
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Alerts for grievance updates, file movement, application decisions, tasks and escalations."
        eyebrow="Inbox"
        actions={
          <Button variant="secondary" size="sm" onClick={markAllRead} disabled={unread === 0 || busy === "all"}>
            <CheckCheck className="size-3.5" aria-hidden />
            Mark all read
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-center rounded-lg border border-border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
            className={cn(
              "h-8 rounded-md px-3 text-[12px] font-semibold transition-colors",
              !unreadOnly ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
            className={cn(
              "h-8 rounded-md px-3 text-[12px] font-semibold transition-colors",
              unreadOnly ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Unread{unread > 0 ? ` (${unread})` : ""}
          </button>
        </div>
        <FilterSelect
          label="Type"
          value={type}
          placeholder="All types"
          options={typeOptions}
          onChange={(value) => {
            setType(value);
            setPage(1);
          }}
        />
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

      <div className="card-surface overflow-hidden">
        {loading ? (
          <div className="p-5">
            <LoadingBlock label="Loading notifications…" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={unreadOnly || type ? "No notifications match these filters" : "You're all caught up"}
            description={
              unreadOnly || type
                ? "Clear the filters to see your full notification history."
                : "Workflow alerts and reminders will appear here as activity happens."
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const definition = TYPE_META[item.type ?? "SYSTEM"] ?? TYPE_META.SYSTEM;
                const Icon = definition.icon;
                const isUnread = !item.readAt;
                return (
                  <li
                    key={item._id}
                    className={cn("group relative flex gap-3 px-4 py-3.5 transition-colors sm:px-5", isUnread && "bg-primary/[0.035]")}
                  >
                    <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", definition.tone)}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void open(item)}
                          className={cn(
                            "break-words text-left text-[13px] leading-snug hover:underline",
                            isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/85",
                          )}
                        >
                          {item.title}
                        </button>
                        {isUnread ? <span className="size-1.5 rounded-full bg-primary" aria-label="Unread" /> : null}
                        <Badge variant="neutral">{definition.label}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">
                        {item.body ?? item.message ?? ""}
                      </p>
                      <p className="mt-1.5 text-[10.5px] text-muted-foreground">{relativeTime(item.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      {isUnread ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void markRead(item._id)}
                          disabled={busy === item._id}
                          title="Mark as read"
                          aria-label={`Mark "${item.title}" as read`}
                        >
                          <CheckCheck className="size-3.5" aria-hidden />
                        </Button>
                      ) : null}
                      {item.link ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void open(item)}
                          title="Open record"
                          aria-label={`Open record for "${item.title}"`}
                        >
                          <Info className="size-3.5" aria-hidden />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void remove(item._id)}
                        disabled={busy === item._id}
                        title="Delete notification"
                        aria-label={`Delete "${item.title}"`}
                        className="text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border px-4 py-3 sm:px-5">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
