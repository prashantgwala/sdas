import Link from "next/link";
import { Compass } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Brand href="/" />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Compass className="size-8" aria-hidden />
          </span>
          <p className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            404 · Page not found
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            This page does not exist
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The link may be outdated, or you may not have navigated to the right workspace. Return to
            the portal home or sign in to continue from your dashboard.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <Link href="/" className={cn(buttonVariants({ variant: "secondary" }))}>
              Portal home
            </Link>
            <Link href="/login" className={cn(buttonVariants())}>
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
