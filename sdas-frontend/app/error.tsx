"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error", error);
  }, [error]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger">
          <AlertTriangle className="size-8" aria-hidden />
        </span>
        <p className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-danger">
          Application error
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The page could not be rendered. Your work is safe; try again. If the problem continues,
          share the reference below with the system administrator.
        </p>
        {error.digest ? (
          <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-2.5 font-mono text-[11.5px] text-muted-foreground">
            Reference: {error.digest}
          </p>
        ) : null}
        <Button className="mt-6" onClick={reset}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
      </div>
    </div>
  );
}
