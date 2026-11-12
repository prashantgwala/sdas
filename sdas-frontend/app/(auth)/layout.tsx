import Link from "next/link";
import { ArrowLeft, Clock3, FileSearch, Route, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

const pillars = [
  {
    icon: Route,
    title: "Every case has an owner",
    description: "Role-based routing from intake to resolution with a complete movement trail.",
  },
  {
    icon: Clock3,
    title: "Every task has a deadline",
    description: "SLA monitoring and escalation keep departmental work on schedule.",
  },
  {
    icon: ShieldCheck,
    title: "Every action is authorized",
    description: "Backend-enforced permissions and data scope for all six roles.",
  },
  {
    icon: FileSearch,
    title: "Every decision is auditable",
    description: "Immutable audit logs capture who did what, when and why.",
  },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #7f9cc4 1px, transparent 1px), linear-gradient(to bottom, #7f9cc4 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 90% 70% at 20% 0%, #000 30%, transparent 100%)",
          }}
          aria-hidden
        />
        <div className="relative z-10 p-10 xl:p-12">
          <Brand href="/" tone="inverse" />
          <div className="mt-16 max-w-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/60">
              District governance, digitised
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white text-balance xl:text-[34px]">
              One accountable system for every grievance, file and decision.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/75">
              SDAS connects citizens, clerks, officers and district leadership through a single
              governed workflow with real-time status, deadlines and audit trails.
            </p>
          </div>

          <ul className="mt-12 grid gap-5">
            {pillars.map((pillar) => (
              <li key={pillar.title} className="flex gap-3.5">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-sidebar-foreground">
                  <pillar.icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{pillar.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-sidebar-foreground/65">
                    {pillar.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 border-t border-sidebar-border/70 px-10 py-6 xl:px-12">
          <p className="text-[11px] leading-relaxed text-sidebar-foreground/50">
            Restricted system · Authorized government personnel only. All access is logged and
            monitored under applicable IT security policy.
          </p>
        </div>
      </aside>

      <main className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="lg:hidden">
            <Brand href="/" />
          </div>
          <div className="hidden lg:block">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Back to portal home
            </Link>
          </div>
          <ThemeToggle />
        </header>
        <div className="flex flex-1 items-center justify-center px-4 pb-10 pt-2 sm:px-8">
          <div className="w-full max-w-[27rem]">{children}</div>
        </div>
        <footer className="px-4 py-5 text-center text-[11px] text-muted-foreground sm:px-8">
          © District Administration · SDAS
        </footer>
      </main>
    </div>
  );
}
