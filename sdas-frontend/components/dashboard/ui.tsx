import Link from "next/link";
import { ArrowRight, ArrowUpRight, Inbox } from "lucide-react";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { NamedCount, TrendPoint } from "@/lib/types";
import { cn, titleCase } from "@/lib/utils";

/* --------------------------------- status --------------------------------- */

const SUCCESS = new Set(["RESOLVED", "CLOSED", "APPROVED", "COMPLETED", "ARCHIVED", "VERIFIED", "WITHIN_TIME", "SUCCESS", "ACTIVE"]);
const WARNING = new Set([
  "DUE_SOON",
  "PENDING_APPROVAL",
  "APPROVAL_PENDING",
  "DOCUMENT_PENDING",
  "PENDING_DECISION",
  "UNDER_VERIFICATION",
  "SUBMITTED",
  "RECEIVED",
  "SCHEDULED",
  "OPEN",
  "REPORTED",
]);
const DANGER = new Set(["OVERDUE", "REJECTED", "RETURNED", "ESCALATED", "FAILED", "CANCELLED", "CRITICAL"]);
const INFO = new Set([
  "ASSIGNED",
  "UNDER_INVESTIGATION",
  "ACTION_TAKEN",
  "UNDER_REVIEW",
  "DISPATCHED",
  "FORWARDED",
  "NOTING_ADDED",
  "IN_PROGRESS",
  "REOPENED",
  "CONTAINED",
  "INSPECTED",
]);

export function statusVariant(status?: string | null): ComponentProps<typeof Badge>["variant"] {
  if (!status) return "neutral";
  if (SUCCESS.has(status)) return "success";
  if (WARNING.has(status)) return "warning";
  if (DANGER.has(status)) return "danger";
  if (INFO.has(status)) return "info";
  return "neutral";
}

export function humanizeStatus(status?: string | null): string {
  if (!status) return "—";
  return titleCase(status);
}

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  return (
    <Badge variant={statusVariant(status)} className={className}>
      {humanizeStatus(status)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority?: string | null }) {
  const variant =
    priority === "URGENT" ? "danger" : priority === "HIGH" ? "warning" : priority === "LOW" ? "neutral" : "info";
  return <Badge variant={variant}>{humanizeStatus(priority ?? "NORMAL")}</Badge>;
}

/* -------------------------------- headers --------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* --------------------------------- cards ---------------------------------- */

const tones = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: keyof typeof tones;
  href?: string;
}) {
  const body = (
    <div className="card-surface h-full p-4 transition-shadow hover:shadow-pop sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tones[tone])}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="group block">
      <div className="relative">
        {body}
        <ArrowUpRight className="absolute bottom-4 right-4 size-3.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" aria-hidden />
      </div>
    </Link>
  ) : (
    body
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("card-surface", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn("p-4 sm:p-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-14")}>
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-[13px] font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* --------------------------------- charts --------------------------------- */

export function TrendChart({
  data,
  label = "Last 14 days",
  height = 150,
}: {
  data: TrendPoint[];
  label?: string;
  height?: number;
}) {
  if (!data.length) {
    return <EmptyState compact title="No trend data yet" description="Activity will appear once records are created." />;
  }
  const width = 320;
  const pad = 6;
  const max = Math.max(...data.map((point) => point.value), 1);
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const points = data.map((point, index) => {
    const x = pad + index * step;
    const y = height - pad - (point.value / max) * (height - pad * 2);
    return { x, y, ...point };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L${points[points.length - 1].x.toFixed(2)},${height - pad} L${points[0].x.toFixed(2)},${height - pad} Z`;
  const total = data.reduce((sum, point) => sum + point.value, 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-[11px] font-semibold text-foreground">
          {total} <span className="font-normal text-muted-foreground">records</span>
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${label} trend`}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={pad}
            x2={width - pad}
            y1={pad + (height - pad * 2) * ratio}
            y2={pad + (height - pad * 2) * ratio}
            stroke="var(--border)"
            strokeDasharray="3 4"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="url(#trend-fill)" />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point) =>
          point.value > 0 ? (
            <circle key={point.date} cx={point.x} cy={point.y} r="2.4" fill="var(--surface)" stroke="var(--primary)" strokeWidth="1.5">
              <title>{`${point.date}: ${point.value}`}</title>
            </circle>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[9.5px] text-muted-foreground">
        <span>{data[0]?.date?.slice(5)}</span>
        <span>{data[Math.floor(data.length / 2)]?.date?.slice(5)}</span>
        <span>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

export function BarList({
  items,
  emptyLabel = "No data yet",
  humanize = true,
}: {
  items: NamedCount[];
  emptyLabel?: string;
  humanize?: boolean;
}) {
  if (!items.length) {
    return <p className="py-6 text-center text-[12px] text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.slice(0, 8).map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[11.5px]">
            <span className="truncate font-medium text-foreground">{humanize ? humanizeStatus(item.label) : item.label}</span>
            <span className="shrink-0 font-semibold text-muted-foreground">{item.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/75"
              style={{ width: `${Math.max(3, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------- table ---------------------------------- */

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("scrollbar-slim -mx-4 overflow-x-auto sm:-mx-5", className)}>
      <div className="inline-block min-w-full px-4 align-middle sm:px-5">{children}</div>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">{children}</table>;
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-border pb-2.5 pr-4 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-b border-border/70 py-3 pr-4 align-middle", className)}>{children}</td>;
}

export function TableLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
      {children}
      <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}
