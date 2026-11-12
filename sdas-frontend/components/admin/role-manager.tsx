"use client";

import { CheckCheck, Lock, Save, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, SectionCard } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { Role } from "@/lib/types";
import { cn, titleCase } from "@/lib/utils";

interface AdminRole {
  _id?: string;
  key: Role;
  name: string;
  description?: string;
  permissions: string[];
  isSystem?: boolean;
}

interface PermissionOption {
  code: string;
  module: string;
  action: string;
  description?: string;
}

export function RoleManager() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [selected, setSelected] = useState<Role | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<AdminRole[]>("/admin/roles"),
      api.get<PermissionOption[]>("/admin/permissions"),
    ])
      .then(([roleList, permissionList]) => {
        setRoles(roleList);
        setPermissions(permissionList);
        const first = roleList[0]?.key ?? null;
        setSelected(first);
        setDraft(new Set(roleList[0]?.permissions ?? []));
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);

  const activeRole = roles.find((role) => role.key === selected) ?? null;
  const locked = activeRole?.key === "SUPER_ADMIN";
  const dirty = useMemo(() => {
    if (!activeRole) return false;
    const original = new Set(activeRole.permissions);
    if (original.size !== draft.size) return true;
    for (const code of draft) if (!original.has(code)) return true;
    return false;
  }, [activeRole, draft]);

  const groups = useMemo(() => {
    const pattern = search.trim().toLowerCase();
    const filtered = permissions.filter(
      (permission) =>
        !pattern ||
        permission.code.toLowerCase().includes(pattern) ||
        permission.action.toLowerCase().includes(pattern) ||
        (permission.description ?? "").toLowerCase().includes(pattern),
    );
    const map = new Map<string, PermissionOption[]>();
    for (const permission of filtered) {
      const list = map.get(permission.module) ?? [];
      list.push(permission);
      map.set(permission.module, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions, search]);

  function selectRole(key: Role) {
    const role = roles.find((item) => item.key === key);
    setSelected(key);
    setDraft(new Set(role?.permissions ?? []));
    setNotice("");
    setError("");
  }

  function toggle(code: string) {
    if (locked) return;
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleModule(module: string, options: PermissionOption[], on: boolean) {
    if (locked) return;
    setDraft((current) => {
      const next = new Set(current);
      for (const option of options) {
        if (on) next.add(option.code);
        else next.delete(option.code);
      }
      return next;
    });
  }

  async function save() {
    if (!activeRole) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await api.patch<AdminRole>(`/admin/roles/${activeRole.key}/permissions`, {
        permissions: [...draft],
      });
      setRoles((current) =>
        current.map((role) =>
          role.key === activeRole.key ? { ...role, permissions: updated.permissions ?? [...draft] } : role,
        ),
      );
      setNotice(`${activeRole.name} permissions saved. Changes apply on each user's next request.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card-surface p-5">
        <LoadingBlock label="Loading roles…" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="Permissions are enforced by the backend on every request. Hiding navigation is not treated as security."
        eyebrow="Access control"
      />

      {error ? <div className="mb-4"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert variant="success">{notice}</Alert></div> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)]">
        <SectionCard title="Roles" description="Select a role to review its permissions" contentClassName="space-y-1.5">
          {roles.map((role) => (
            <button
              key={role.key}
              type="button"
              onClick={() => selectRole(role.key)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                selected === role.key
                  ? "border-primary/40 bg-primary-soft"
                  : "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                  {role.name}
                  {role.key === "SUPER_ADMIN" ? <Lock className="size-3 text-muted-foreground" aria-hidden /> : null}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                  {role.permissions.length} permissions
                </span>
              </span>
              <ShieldCheck className={cn("size-4 shrink-0", selected === role.key ? "text-primary" : "text-muted-foreground/50")} aria-hidden />
            </button>
          ))}
        </SectionCard>

        <SectionCard
          title={activeRole ? `${activeRole.name} permissions` : "Permissions"}
          description={
            locked
              ? "The super administrator role always retains every permission and cannot be reduced."
              : "Tick the capabilities this role should have. Changes affect API access immediately."
          }
          action={
            <div className="flex items-center gap-2">
              {dirty ? <Badge variant="warning">Unsaved changes</Badge> : null}
              <Button size="sm" onClick={() => void save()} disabled={!dirty || saving || locked}>
                <Save className="size-3.5" aria-hidden />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search permissions"
                aria-label="Search permissions"
                className="h-9 w-full rounded-lg border border-input bg-surface pl-8 pr-3 text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
              />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {draft.size} of {permissions.length} granted
            </span>
          </div>

          {locked ? (
            <div className="mb-4">
              <Alert variant="info" title="System role">
                Super administrator permissions are fixed to the complete platform permission set.
              </Alert>
            </div>
          ) : null}

          <div className="space-y-4">
            {groups.map(([module, options]) => {
              const allSelected = options.every((option) => draft.has(option.code));
              const someSelected = options.some((option) => draft.has(option.code));
              return (
                <div key={module} className="rounded-xl border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-semibold text-foreground">{titleCase(module)}</p>
                      <Badge variant={someSelected ? "info" : "neutral"}>
                        {options.filter((option) => draft.has(option.code)).length}/{options.length}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleModule(module, options, true)}
                        disabled={locked || allSelected}
                        className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-primary hover:bg-primary-soft disabled:opacity-40"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleModule(module, options, false)}
                        disabled={locked || !someSelected}
                        className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <ul className="grid gap-1 p-2 sm:grid-cols-2">
                    {options.map((permission) => {
                      const checked = draft.has(permission.code);
                      return (
                        <li key={permission.code}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition-colors",
                              locked ? "cursor-not-allowed" : "hover:bg-muted",
                              checked && "bg-primary/[0.04]",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                                checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface",
                                locked && "opacity-60",
                              )}
                            >
                              {checked ? <CheckCheck className="size-3" aria-hidden /> : null}
                            </span>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              disabled={locked}
                              onChange={() => toggle(permission.code)}
                            />
                            <span className="min-w-0">
                              <span className="block font-mono text-[10.5px] text-foreground">{permission.code}</span>
                              {permission.description ? (
                                <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">
                                  {permission.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {groups.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-muted-foreground">No permissions match this search.</p>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
