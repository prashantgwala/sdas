"use client";

import { Archive, FolderKanban, PencilLine, Plus, Power, Route, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, PageHeader, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface IdRefLike {
  _id?: string;
  name?: string;
}

interface FileCategoryRow {
  _id: string;
  name: string;
  code: string;
  defaultDepartment?: IdRefLike | string | null;
  defaultConfidentiality?: string;
  active: boolean;
}

interface MovementRow {
  _id: string;
  name: string;
  fromRole: string;
  toRole: string;
  requiresApproval?: boolean;
  active: boolean;
}

interface RetentionRow {
  _id: string;
  name: string;
  entityType: string;
  confidentiality?: string;
  retentionDays: number;
  archiveAfterDays?: number;
  active: boolean;
}

interface DepartmentRow {
  _id: string;
  name: string;
}

const CONFIDENTIALITY = [
  { value: "PUBLIC", label: "Public" },
  { value: "INTERNAL", label: "Internal" },
  { value: "CONFIDENTIAL", label: "Confidential" },
  { value: "RESTRICTED", label: "Restricted" },
];

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({ value: role, label: ROLE_LABELS[role] }));

const TABS = [
  { key: "categories", label: "File categories", icon: FolderKanban },
  { key: "movement", label: "Movement rules", icon: Route },
  { key: "retention", label: "Retention rules", icon: Archive },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function refId(value?: IdRefLike | string | null): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id ?? "";
}

function refName(value?: IdRefLike | string | null): string {
  if (!value) return "—";
  return typeof value === "string" ? value : value.name ?? "—";
}

function roleLabel(role?: string): string {
  if (!role) return "—";
  return ROLE_LABELS[role as Role] ?? role;
}

export function FileConfigManager() {
  const [tab, setTab] = useState<TabKey>("categories");
  const [categories, setCategories] = useState<FileCategoryRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [retentions, setRetentions] = useState<RetentionRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const [categoryData, movementData, retentionData, departmentData] = await Promise.all([
        api.get<FileCategoryRow[]>("/admin/file-categories?includeInactive=true", { signal }),
        api.get<MovementRow[]>("/admin/movement-rules", { signal }),
        api.get<RetentionRow[]>("/admin/retention-rules", { signal }),
        api.get<DepartmentRow[]>("/admin/departments?includeInactive=true", { signal }),
      ]);
      setCategories(categoryData);
      setMovements(movementData);
      setRetentions(retentionData);
      setDepartments(departmentData);
    } catch (cause) {
      if (!signal?.aborted) setError(errorMessage(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  }

  return (
    <div>
      <PageHeader
        eyebrow="File configuration"
        title="File categories, movement & retention"
        description="Define how digital files are classified, which role movements are permitted, and when records are archived or eligible for disposal."
      />

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      <div role="tablist" aria-label="File configuration" className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors",
                tab === item.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="card-surface p-6"><LoadingBlock label="Loading file configuration…" /></div>
      ) : (
        <>
          {tab === "categories" ? (
            <CategoriesTab items={categories} departments={departments} onChanged={load} flash={flash} />
          ) : null}
          {tab === "movement" ? <MovementTab items={movements} onChanged={load} flash={flash} /> : null}
          {tab === "retention" ? <RetentionTab items={retentions} onChanged={load} flash={flash} /> : null}
        </>
      )}
    </div>
  );
}

/* -------------------------------- categories ------------------------------- */

const EMPTY_CATEGORY = { name: "", code: "", defaultDepartment: "", defaultConfidentiality: "INTERNAL", active: true };

function CategoriesTab({
  items,
  departments,
  onChanged,
  flash,
}: {
  items: FileCategoryRow[];
  departments: DepartmentRow[];
  onChanged: () => Promise<void>;
  flash: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_CATEGORY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_CATEGORY);
    setError("");
    setOpen(true);
  }

  function openEdit(item: FileCategoryRow) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      code: item.code,
      defaultDepartment: refId(item.defaultDepartment),
      defaultConfidentiality: item.defaultConfidentiality ?? "INTERNAL",
      active: item.active,
    });
    setError("");
    setOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (form.name.trim().length < 2) {
      setError("Enter a category name.");
      return;
    }
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(form.code.trim())) {
      setError("Code must be 2–40 characters using letters, numbers, hyphen or underscore.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        defaultDepartment: form.defaultDepartment || "",
        defaultConfidentiality: form.defaultConfidentiality,
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/file-categories/${editingId}`, payload);
      else await api.post("/admin/file-categories", payload);
      flash(editingId ? "File category updated." : "File category created.");
      setOpen(false);
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item: FileCategoryRow) {
    if (!window.confirm(`Deactivate ${item.name}? Existing files keep their category.`)) return;
    try {
      await api.delete(`/admin/file-categories/${item._id}`);
      flash("File category deactivated.");
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted-foreground">{items.length} file categor{items.length === 1 ? "y" : "ies"}</p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden />
          Add category
        </Button>
      </div>

      {error && !open ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}

      {open ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit file category" : "New file category"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="filecat-name" required>
              <Input id="filecat-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} />
            </Field>
            <Field label="Code" htmlFor="filecat-code" required>
              <Input id="filecat-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={40} />
            </Field>
            <Field label="Default department" htmlFor="filecat-dept">
              <Select id="filecat-dept" value={form.defaultDepartment} onChange={(event) => setForm((current) => ({ ...current, defaultDepartment: event.target.value }))}>
                <option value="">Not assigned</option>
                {departments.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Default confidentiality" htmlFor="filecat-conf" hint="Applied at registration">
              <Select id="filecat-conf" value={form.defaultConfidentiality} onChange={(event) => setForm((current) => ({ ...current, defaultConfidentiality: event.target.value }))}>
                {CONFIDENTIALITY.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  className="size-3.5 accent-[var(--primary)]"
                />
                Active for new files
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create category"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {items.length === 0 ? (
          <EmptyState title="No file categories" description="Create file categories so incoming files are classified consistently." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th>Default department</Th>
                  <Th>Confidentiality</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <Td>
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <p className="font-mono text-[10.5px] text-muted-foreground">{item.code}</p>
                    </Td>
                    <Td><span className="text-muted-foreground">{refName(item.defaultDepartment)}</span></Td>
                    <Td><StatusBadge status={item.defaultConfidentiality} /></Td>
                    <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit category">
                          <PencilLine className="size-3.5" aria-hidden />
                        </Button>
                        {item.active ? (
                          <Button variant="ghost" size="icon-sm" onClick={() => void deactivate(item)} title="Deactivate category" className="text-muted-foreground hover:text-danger">
                            <Power className="size-3.5" aria-hidden />
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- movement -------------------------------- */

const EMPTY_MOVEMENT = { name: "", fromRole: "CLERK", toRole: "OFFICER", requiresApproval: false, active: true };

function MovementTab({
  items,
  onChanged,
  flash,
}: {
  items: MovementRow[];
  onChanged: () => Promise<void>;
  flash: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_MOVEMENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_MOVEMENT);
    setError("");
    setOpen(true);
  }

  function openEdit(item: MovementRow) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      fromRole: item.fromRole,
      toRole: item.toRole,
      requiresApproval: Boolean(item.requiresApproval),
      active: item.active,
    });
    setError("");
    setOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (form.name.trim().length < 2) {
      setError("Enter a rule name.");
      return;
    }
    if (form.fromRole === form.toRole) {
      setError("Movement rules must go from one role to a different role.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        fromRole: form.fromRole,
        toRole: form.toRole,
        requiresApproval: form.requiresApproval,
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/movement-rules/${editingId}`, payload);
      else await api.post("/admin/movement-rules", payload);
      flash(editingId ? "Movement rule updated." : "Movement rule created.");
      setOpen(false);
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted-foreground">Allowed role-to-role handovers for digital files and their approval requirement.</p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden />
          Add movement rule
        </Button>
      </div>

      {error && !open ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}

      {open ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit movement rule" : "New movement rule"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rule name" htmlFor="move-name" required>
              <Input id="move-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} />
            </Field>
            <div className="hidden sm:block" />
            <Field label="From role" htmlFor="move-from" required>
              <Select id="move-from" value={form.fromRole} onChange={(event) => setForm((current) => ({ ...current, fromRole: event.target.value }))}>
                {ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="To role" htmlFor="move-to" required>
              <Select id="move-to" value={form.toRole} onChange={(event) => setForm((current) => ({ ...current, toRole: event.target.value }))}>
                {ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(event) => setForm((current) => ({ ...current, requiresApproval: event.target.checked }))}
                className="size-3.5 accent-[var(--primary)]"
              />
              Requires approval before movement
            </label>
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="size-3.5 accent-[var(--primary)]"
              />
              Active
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create rule"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {items.length === 0 ? (
          <EmptyState title="No movement rules" description="Without rules, file movement requests are rejected. Add at least one allowed handover." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Rule</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Approval</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <Td><span className="font-semibold text-foreground">{item.name}</span></Td>
                    <Td><span className="text-muted-foreground">{roleLabel(item.fromRole)}</span></Td>
                    <Td><span className="text-muted-foreground">{roleLabel(item.toRole)}</span></Td>
                    <Td><span className="text-[11.5px] text-muted-foreground">{item.requiresApproval ? "Required" : "Not required"}</span></Td>
                    <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                    <Td>
                      <div className="flex items-center justify-end">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit movement rule">
                          <PencilLine className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- retention ------------------------------- */

const EMPTY_RETENTION = {
  name: "",
  entityType: "FILE",
  confidentiality: "",
  retentionDays: "3650",
  archiveAfterDays: "",
  active: true,
};

function RetentionTab({
  items,
  onChanged,
  flash,
}: {
  items: RetentionRow[];
  onChanged: () => Promise<void>;
  flash: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_RETENTION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_RETENTION);
    setError("");
    setOpen(true);
  }

  function openEdit(item: RetentionRow) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      entityType: item.entityType,
      confidentiality: item.confidentiality ?? "",
      retentionDays: String(item.retentionDays),
      archiveAfterDays: item.archiveAfterDays ? String(item.archiveAfterDays) : "",
      active: item.active,
    });
    setError("");
    setOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (form.name.trim().length < 2) {
      setError("Enter a retention rule name.");
      return;
    }
    const retentionDays = Number(form.retentionDays);
    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      setError("Retention days must be at least 1.");
      return;
    }
    const archiveAfterDays = form.archiveAfterDays ? Number(form.archiveAfterDays) : undefined;
    if (archiveAfterDays !== undefined && (!Number.isFinite(archiveAfterDays) || archiveAfterDays < 1)) {
      setError("Archive-after days must be at least 1 when provided.");
      return;
    }
    if (archiveAfterDays !== undefined && archiveAfterDays > retentionDays) {
      setError("Archive-after days cannot exceed the total retention period.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        entityType: form.entityType,
        confidentiality: form.confidentiality || undefined,
        retentionDays,
        archiveAfterDays,
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/retention-rules/${editingId}`, payload);
      else await api.post("/admin/retention-rules", payload);
      flash(editingId ? "Retention rule updated." : "Retention rule created.");
      setOpen(false);
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted-foreground">
          The daily retention job archives records after the archive threshold and flags them for disposal at the retention limit.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden />
          Add retention rule
        </Button>
      </div>

      {error && !open ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}

      {open ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit retention rule" : "New retention rule"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rule name" htmlFor="ret-name" required>
              <Input id="ret-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} />
            </Field>
            <Field label="Applies to" htmlFor="ret-entity">
              <Select id="ret-entity" value={form.entityType} onChange={(event) => setForm((current) => ({ ...current, entityType: event.target.value }))}>
                <option value="FILE">Digital file</option>
                <option value="GRIEVANCE">Grievance</option>
                <option value="APPLICATION">Application</option>
              </Select>
            </Field>
            <Field label="Confidentiality" htmlFor="ret-conf" hint="Optional filter">
              <Select id="ret-conf" value={form.confidentiality} onChange={(event) => setForm((current) => ({ ...current, confidentiality: event.target.value }))}>
                <option value="">Any class</option>
                {CONFIDENTIALITY.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Retention period (days)" htmlFor="ret-days" required>
              <Input id="ret-days" type="number" min={1} value={form.retentionDays} onChange={(event) => setForm((current) => ({ ...current, retentionDays: event.target.value }))} />
            </Field>
            <Field label="Archive after (days)" htmlFor="ret-archive" hint="Optional, must not exceed retention">
              <Input id="ret-archive" type="number" min={1} value={form.archiveAfterDays} onChange={(event) => setForm((current) => ({ ...current, archiveAfterDays: event.target.value }))} />
            </Field>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="size-3.5 accent-[var(--primary)]"
              />
              Active
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create rule"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {items.length === 0 ? (
          <EmptyState title="No retention rules" description="Add retention rules so records are archived and disposed of consistently." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Rule</Th>
                  <Th>Applies to</Th>
                  <Th>Confidentiality</Th>
                  <Th>Retention</Th>
                  <Th>Archive after</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <Td><span className="font-semibold text-foreground">{item.name}</span></Td>
                    <Td><span className="text-muted-foreground">{item.entityType}</span></Td>
                    <Td><StatusBadge status={item.confidentiality} /></Td>
                    <Td><span className="text-[11.5px] text-muted-foreground">{item.retentionDays} days</span></Td>
                    <Td><span className="text-[11.5px] text-muted-foreground">{item.archiveAfterDays ? `${item.archiveAfterDays} days` : "—"}</span></Td>
                    <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                    <Td>
                      <div className="flex items-center justify-end">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit retention rule">
                          <PencilLine className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
