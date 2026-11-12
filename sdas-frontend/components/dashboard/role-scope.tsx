"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { LoadingBlock } from "@/components/ui/spinner";
import type { Role } from "@/lib/types";

export function RoleScope({ allowed, children }: { allowed: Role[]; children: React.ReactNode }) {
  const { session, loading, homePath } = useAuth();

  if (loading) return <LoadingBlock label="Checking access" />;
  if (!session) return <LoadingBlock label="Redirecting" />;

  if (!allowed.includes(session.user.role)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
          <ShieldX className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          This workspace belongs to a different role. Your access scope is enforced by the server for
          every request.
        </p>
        <Link href={homePath} className="mt-5 inline-block text-[13px] font-semibold text-primary hover:underline">
          Go to my dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
