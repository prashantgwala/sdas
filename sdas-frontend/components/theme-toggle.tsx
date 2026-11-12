"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

const order = ["light", "dark", "system"] as const;
const labels = { light: "Light", dark: "Dark", system: "System" } as const;

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  const next = order[(order.indexOf(theme) + 1) % order.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Theme: ${labels[theme]} (click for ${labels[next]})`}
      aria-label={`Theme: ${labels[theme]}. Switch to ${labels[next]}`}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {showLabel ? <span>{labels[theme]}</span> : null}
    </button>
  );
}
