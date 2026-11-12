import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Access denied" };

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Brand href="/" />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger">
            <ShieldX className="size-8" aria-hidden />
          </span>
          <p className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-danger">
            403 · Access denied
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            You do not have permission to view this page
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This area is restricted to a different role or data scope. If you believe you should
            have access, contact your department administrator and quote the page you were trying to
            open.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <Link href="/" className={cn(buttonVariants({ variant: "secondary" }))}>
              <ArrowLeft aria-hidden />
              Back to portal home
            </Link>
            <Link href="/login" className={cn(buttonVariants())}>
              Sign in with another account
            </Link>
          </div>
          <p className="mt-8 rounded-lg border border-border bg-surface px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
            All access attempts are recorded in the system audit log as part of the district IT
            security policy.
          </p>
        </div>
      </main>
    </div>
  );
}
