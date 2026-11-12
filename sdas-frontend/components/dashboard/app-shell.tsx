"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/providers/auth-provider";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { navigationForRole, type NavGroup, type NavItem } from "@/lib/navigation";
import { ROLE_LABELS } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

const COLLAPSE_KEY = "sdas:sidebar-collapsed";

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (item.href === "/admin" || item.href === "/citizen" || item.href === "/clerk" || item.href === "/officer" || item.href === "/dept-head" || item.href === "/district") {
    return false;
  }
  return pathname.startsWith(`${item.href}/`);
}

function sectionTitle(groups: NavGroup[], pathname: string): string {
  for (const group of groups) {
    for (const item of group.items) {
      if (isActive(pathname, item)) return item.label;
    }
  }
  return "Workspace";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading, logout, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!loading && !session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, session, pathname, router]);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const loadCounts = useCallback(async () => {
    if (!session) return;
    try {
      const unreadData = await api.get<{ unread: number }>("/notifications/unread-count");
      setUnread(unreadData.unread ?? 0);
    } catch {
      setUnread(0);
    }
    if (hasPermission("task.read")) {
      try {
        const tasks = await api.list<unknown>("/tasks?limit=1");
        setTaskCount(Number(tasks.meta?.total ?? 0));
      } catch {
        setTaskCount(0);
      }
    }
  }, [session, hasPermission]);

  useEffect(() => {
    void loadCounts();
    const handler = () => void loadCounts();
    window.addEventListener("sdas:counters-changed", handler);
    return () => window.removeEventListener("sdas:counters-changed", handler);
  }, [loadCounts]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const groups = useMemo(() => {
    if (!session) return [];
    return navigationForRole(session.user.role)
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(...(item.permissions ?? []))),
      }))
      .filter((group) => group.items.length > 0);
  }, [session, hasPermission]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Spinner />
          Loading workspace…
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Spinner />
          Redirecting to sign in…
        </div>
      </div>
    );
  }

  const user = session.user;
  const title = sectionTitle(groups, pathname);

  const renderSidebar = (compact: boolean) => (
    <>
      <div className={cn("flex h-16 items-center border-b border-sidebar-border", compact ? "justify-center px-2" : "px-5")}>
        {compact ? (
          <Brand href={session.dashboard} compact tone="inverse" />
        ) : (
          <Brand href={session.dashboard} tone="inverse" subtitle="District Administration" />
        )}
      </div>

      <nav className="scrollbar-slim flex-1 overflow-y-auto px-2.5 py-4">
        {groups.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex} className={cn(groupIndex > 0 && "mt-5")}>
            {group.label && !compact ? (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const badgeCount =
                  item.badge === "notifications" ? unread : item.badge === "tasks" ? taskCount : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={compact ? item.label : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors",
                        active
                          ? "bg-sidebar-active text-white shadow-sm"
                          : "text-sidebar-foreground/85 hover:bg-white/[0.06] hover:text-white",
                        compact && "justify-center px-0",
                      )}
                    >
                      {active ? (
                        <span className="absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-white/85" aria-hidden />
                      ) : null}
                      <item.icon className="size-[17px] shrink-0" strokeWidth={1.85} aria-hidden />
                      {compact ? null : <span className="truncate">{item.label}</span>}
                      {!compact && badgeCount > 0 ? (
                        <span
                          className={cn(
                            "ml-auto min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold",
                            active ? "bg-white/20 text-white" : "bg-primary/20 text-blue-200",
                          )}
                        >
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-sidebar-border p-2.5", compact && "px-2")}>
        <div className={cn("flex items-center gap-2.5 rounded-lg px-1.5 py-1.5", compact && "justify-center px-0")}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-active/25 text-[11px] font-bold text-white ring-1 ring-white/15">
            {initials(user.name)}
          </span>
          {compact ? null : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">{user.name}</p>
              <p className="truncate text-[10.5px] text-sidebar-foreground/55">{ROLE_LABELS[user.role]}</p>
            </div>
          )}
          {compact ? null : (
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out"
              aria-label="Sign out"
              className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-svh bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[255px]",
        )}
      >
        {renderSidebar(collapsed)}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[280px] max-w-[84vw] flex-col bg-sidebar shadow-pop">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 z-10 grid size-8 place-items-center rounded-md text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="size-4" aria-hidden />
            </button>
            {renderSidebar(false)}
          </aside>
        </div>
      ) : null}

      <div className={cn("flex min-h-svh flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-[255px]")}>
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid size-9 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden size-9 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground lg:grid"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {ROLE_LABELS[user.role]} workspace
              </p>
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <ThemeToggle />
            </div>

            <Link
              href="/notifications"
              className="relative grid size-9 place-items-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            >
              <Bell className="size-4" aria-hidden />
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-[17px] rounded-full bg-danger px-1 text-center text-[9.5px] font-bold leading-[17px] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface pl-1.5 pr-2 text-left transition-colors hover:bg-surface-muted"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="grid size-6 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-[130px] sm:block">
                  <span className="block truncate text-[11.5px] font-semibold leading-tight">{user.name}</span>
                  <span className="block truncate text-[9.5px] text-muted-foreground">{ROLE_LABELS[user.role]}</span>
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+8px)] w-60 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-pop"
                >
                  <div className="border-b border-border px-2.5 pb-2.5 pt-2">
                    <p className="text-[12.5px] font-semibold">{user.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{user.email}</p>
                    {user.departmentName ? (
                      <p className="mt-1 text-[10.5px] text-muted-foreground">{user.departmentName}</p>
                    ) : null}
                  </div>
                  <Link
                    href="/profile"
                    role="menuitem"
                    className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-foreground hover:bg-muted"
                  >
                    <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
                    My profile
                  </Link>
                  <Link
                    href="/settings"
                    role="menuitem"
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-foreground hover:bg-muted"
                  >
                    <Settings className="size-3.5 text-muted-foreground" aria-hidden />
                    Preferences
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-danger hover:bg-danger-soft"
                  >
                    <LogOut className="size-3.5" aria-hidden />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main
          className={cn(
            "flex-1 px-4 sm:px-6",
            user.preferences?.layout === "compact" ? "py-4 sm:py-4" : "py-6 sm:py-7",
          )}
        >
          <div className="mx-auto w-full max-w-[84rem]">{children}</div>
        </main>

        <footer className="border-t border-border/70 px-4 py-4 text-[10.5px] text-muted-foreground sm:px-6">
          <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p>SDAS · Smart District Administration System</p>
            <p>Authorized use only. All actions are recorded in the audit trail.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
