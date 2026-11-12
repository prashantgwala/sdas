import Link from "next/link";
import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandProps {
  href?: string;
  compact?: boolean;
  tone?: "default" | "inverse";
  subtitle?: string;
  className?: string;
}

export function Brand({
  href = "/",
  compact = false,
  tone = "default",
  subtitle = "Smart District Administration System",
  className,
}: BrandProps) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-3", className)}
      aria-label="SDAS home"
    >
      <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_6px_18px_-8px_var(--primary)]">
        <Landmark className="size-5" strokeWidth={1.9} aria-hidden />
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/15" aria-hidden />
      </span>
      {compact ? null : (
        <span className="flex min-w-0 flex-col leading-tight">
          <span
            className={cn(
              "text-[17px] font-bold tracking-[0.08em]",
              tone === "inverse" ? "text-white" : "text-foreground",
            )}
          >
            SDAS
          </span>
          <span
            className={cn(
              "truncate text-[10.5px] font-medium uppercase tracking-[0.14em]",
              tone === "inverse" ? "text-sidebar-foreground/80" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        </span>
      )}
    </Link>
  );
}
