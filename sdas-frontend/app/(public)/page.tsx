import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  CloudLightning,
  FileSearch,
  FileText,
  FolderKanban,
  Landmark,
  MessageSquareWarning,
  Route,
  ShieldCheck,
  Star,
  Clock3,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const services = [
  {
    icon: MessageSquareWarning,
    title: "Grievance redressal",
    description:
      "Register, route, investigate and resolve citizen grievances with SLA-backed escalation at every stage.",
    href: "/login",
  },
  {
    icon: FolderKanban,
    title: "Digital file tracking",
    description:
      "Create file records, generate QR labels and track every movement, noting and approval across departments.",
    href: "/login",
  },
  {
    icon: FileText,
    title: "Service applications",
    description:
      "Apply for district services online, upload documents and follow verification until the final decision.",
    href: "/register",
  },
  {
    icon: ClipboardCheck,
    title: "Field inspections",
    description:
      "Assign inspection tasks, capture photo evidence and submit structured reports from the field.",
    href: "/login",
  },
  {
    icon: CloudLightning,
    title: "Disaster & weather alerts",
    description:
      "Monitor incidents, weather warnings and resources so district teams can respond on time.",
    href: "/login",
  },
  {
    icon: Star,
    title: "Feedback & reviews",
    description:
      "Collect citizen satisfaction feedback, review department trends and act on service quality gaps.",
    href: "/register",
  },
];

const workflow = [
  {
    step: "01",
    title: "Submit or register",
    description:
      "A citizen submits online, or a clerk registers a walk-in request after verification and document checks.",
  },
  {
    step: "02",
    title: "Classify and route",
    description:
      "AI-assisted classification is reviewed by a human, then routed to the responsible department and officer.",
  },
  {
    step: "03",
    title: "Act with accountability",
    description:
      "Officers investigate, add notes, upload evidence and submit resolutions within department SLAs.",
  },
  {
    step: "04",
    title: "Resolve and audit",
    description:
      "Supervisors approve or return work, citizens receive updates, and every action remains in the audit trail.",
  },
];

const roles = [
  { name: "Citizen", description: "Submit requests, upload documents and track progress." },
  { name: "Clerk", description: "Register cases, verify documents and route work." },
  { name: "Officer", description: "Investigate, act and resolve assigned cases." },
  { name: "Department Head", description: "Review, approve and monitor departmental SLAs." },
  { name: "District Admin", description: "Oversee departments, escalations and district performance." },
  { name: "Super Admin", description: "Govern users, roles, configuration and platform health." },
];

const security = [
  "Backend-enforced role-based access control with data scopes",
  "Complete audit trail for every case, file and configuration change",
  "Session management with rotating refresh tokens and CSRF protection",
  "Restricted module gating for sensitive operations",
  "Human review required for AI-assisted classification",
  "External integrations stay disabled until configured and tested",
];

export default function LandingPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
        <div className="page-container flex h-16 items-center justify-between gap-4">
          <Brand href="/" />
          <nav className="hidden items-center gap-7 text-[13px] font-medium text-muted-foreground lg:flex">
            <a href="#services" className="transition-colors hover:text-foreground">Services</a>
            <a href="#workflow" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#roles" className="transition-colors hover:text-foreground">Roles</a>
            <a href="#security" className="transition-colors hover:text-foreground">Security</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
            >
              Sign in
            </Link>
            <Link href="/register" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
              Citizen register
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
          <div className="page-container relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:py-24">
            <div className="animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground shadow-sm">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                District Administration · Digital governance platform
              </span>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[3.35rem]">
                One accountable system for every district request.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                SDAS connects citizens, clerks, officers and district leadership through a single
                governed workflow — with clear ownership, deadlines, approvals and an audit trail for
                every decision.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
                  Sign in to your account
                  <ArrowRight aria-hidden />
                </Link>
                <Link href="/register" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                  Create citizen account
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[12.5px] font-medium text-muted-foreground">
                <li className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-success" aria-hidden />
                  Backend-enforced RBAC
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-4 text-primary" aria-hidden />
                  SLA & escalation monitoring
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Users className="size-4 text-info" aria-hidden />
                  Six governed roles
                </li>
              </ul>
            </div>

            <div className="animate-fade relative">
              <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-primary/15 via-info/10 to-transparent blur-2xl" aria-hidden />
              <div className="card-surface relative overflow-hidden shadow-pop">
                <div className="flex items-center justify-between border-b border-border bg-surface-muted/70 px-5 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Case lifecycle preview
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                    <Route className="size-3" aria-hidden />
                    Illustrative
                  </span>
                </div>
                <div className="space-y-5 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Grievance workflow
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">Road repair request</h2>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">
                        Public Works · Ward 12 · Assigned to Junior Engineer
                      </p>
                    </div>
                    <span className="rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-[10.5px] font-semibold text-warning">
                      In progress
                    </span>
                  </div>

                  <ol className="relative space-y-4 border-l border-border pl-5">
                    {[
                      ["Received", "Citizen submission received and acknowledged", true],
                      ["Verified", "Documents checked by intake clerk", true],
                      ["Routed", "AI suggestion reviewed and assigned to PWD", true],
                      ["Field action", "Inspection scheduled with photo evidence", false],
                      ["Resolved", "Resolution reviewed and citizen notified", false],
                    ].map(([title, description, done]) => (
                      <li key={title as string} className="relative">
                        <span
                          className={cn(
                            "absolute -left-[26px] top-0.5 grid size-[18px] place-items-center rounded-full border-2 border-surface",
                            done ? "bg-success" : "bg-muted",
                          )}
                          aria-hidden
                        >
                          {done ? (
                            <CheckCircle2 className="size-3 text-white" />
                          ) : (
                            <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                          )}
                        </span>
                        <p className="text-[13px] font-semibold">{title as string}</p>
                        <p className="text-[12px] leading-relaxed text-muted-foreground">
                          {description as string}
                        </p>
                      </li>
                    ))}
                  </ol>

                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                    {[
                      ["Owner", "Assigned"],
                      ["SLA", "Tracked"],
                      ["Audit", "Recorded"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-surface-muted px-2 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {label}
                        </p>
                        <p className="mt-0.5 text-[12px] font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-[10.5px] text-muted-foreground">
                Illustrative workflow preview — not live data.
              </p>
            </div>
          </div>
        </section>

        <section id="services" className="border-y border-border bg-surface-muted/50 py-16 sm:py-20">
          <div className="page-container">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Services</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Every district service, one governed platform
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Each module shares the same ownership, deadline and audit discipline, so nothing is
                lost between departments or desks.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <Link
                  key={service.title}
                  href={service.href}
                  className="group rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-pop"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
                    <service.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[15px] font-semibold">{service.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {service.description}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                    Access service
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="py-16 sm:py-20">
          <div className="page-container">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                  How it works
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                  A workflow built on ownership and accountability
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  SDAS follows the district operating principle: every case has an owner, every task
                  has a deadline, every decision has an authorized officer, and every important action
                  has an audit trail.
                </p>
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                  <Landmark className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    File movement, approvals and escalations remain visible to authorized
                    supervisors across the department and district levels.
                  </p>
                </div>
              </div>
              <ol className="grid gap-3 sm:grid-cols-2">
                {workflow.map((item, index) => (
                  <li
                    key={item.step}
                    className="rounded-xl border border-border bg-surface p-5 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-primary">
                        {item.step}
                      </span>
                      {index === workflow.length - 1 ? (
                        <FileSearch className="size-4 text-muted-foreground" aria-hidden />
                      ) : null}
                    </div>
                    <h3 className="mt-3 text-[14.5px] font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="roles" className="border-y border-border bg-sidebar py-16 text-white sm:py-20">
          <div className="page-container">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300">
                Role-based access
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                The right information for every responsibility
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-sidebar-foreground/70">
                Each role has its own dashboard, navigation and backend-enforced data scope. Menus
                adapt to permissions — access itself is always verified by the server.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role, index) => (
                <div
                  key={role.name}
                  className="rounded-xl border border-white/10 bg-white/[0.045] p-5 transition-colors hover:bg-white/[0.07]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] font-semibold tracking-[0.16em] text-sidebar-foreground/45">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <ShieldCheck className="size-4 text-blue-300/70" aria-hidden />
                  </div>
                  <h3 className="mt-3 text-[14.5px] font-semibold text-white">{role.name}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-sidebar-foreground/65">
                    {role.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="py-16 sm:py-20">
          <div className="page-container grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                Security & governance
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Designed for sensitive public records
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                SDAS treats citizen data and official files as sensitive by default. Access is
                restricted to the role and scope required for the task at hand.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/login" className={cn(buttonVariants())}>
                  Sign in
                  <ArrowRight aria-hidden />
                </Link>
                <Link href="/register" className={cn(buttonVariants({ variant: "secondary" }))}>
                  Register as citizen
                </Link>
              </div>
            </div>
            <ul className="grid gap-3">
              {security.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  <span className="text-[12.5px] leading-relaxed text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="page-container flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Brand href="/" />
            <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
              Smart District Administration System — a governed workspace for citizen services,
              grievances, files and district operations.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-[12.5px]">
            <Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="text-muted-foreground transition-colors hover:text-foreground">
              Citizen registration
            </Link>
            <Link
              href="/forgot-password"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Account recovery
            </Link>
            <Link
              href="/access-denied"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Access policy
            </Link>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="page-container flex flex-col gap-2 py-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© District Administration · SDAS</p>
            <p>Authorized use only. All access is logged and monitored.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
