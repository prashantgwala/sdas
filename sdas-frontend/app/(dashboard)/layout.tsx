import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppShell } from "@/components/dashboard/app-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-background">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            Loading workspace…
          </div>
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
