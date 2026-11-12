"use client";

import { BookOpenCheck, PencilLine, Plus, Power, TimerReset, Waypoints, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, PageHeader, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";

interface IdRefLike {
  _id?: string;
  name?: string;
}

interface CategoryRow {
  _id: string;
  name: string;
  code: string;
  parent?: IdRefLike | string | null;
  defaultDepartment?: IdRefLike | string | null;
  defaultPriority?: string;
  aiKeywords?: string[];
  requiredEvidence?: string[];
  active: boolean;
  updatedAt?: string;
}

interface RoutingRow {
  _id: string;
  category?: IdRefLike | string | null;
  subcategory?: IdRefLike | string | null;
  department?: IdRefLike | string | null;
  office?: IdRefLike | string | null;
  priority?: string;
  active: boolean;
}

interface SlaRow {
  _id: string;
  entityType: string;
  category?: IdRefLike | string | null;
  name: string;
  priority: string;
  responseHours: number;
  resolutionHours: number;
  dueSoonHours?: number;
  escalationHours?: number[];
  pauseAllowed?: boolean;
  active: boolean;
  updatedAt?: string;
}

interface DepartmentRow {
  _id: string;
  name: string;
  code: string;
}

interface OfficeRow {
  _id: string;
  name: string;
  department?: IdRefLike | string | null;
}

const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const TABS = [
  { key: "categories", label: "Categories", icon: BookOpenCheck },
  { key: "routing", label: "Routing rules", icon: Waypoints },
  { key: "sla", label: "SLA rules", icon: TimerReset },
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

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function GrievanceConfigManager() {
  const [tab, setTab] = useState<TabKey>("categories");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [routing, setRouting] = useState<RoutingRow[]>([]);
  const [slas, setSlas] = useState<SlaRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const [categoryData, routingData, slaData, departmentData, officeData] = await Promise.all([
        api.get<CategoryRow[]>("/admin/grievance-categories?includeInactive=true", { signal }),
        api.get<RoutingRow[]>("/admin/routing-rules", { signal }),
        api.get<SlaRow[]>("/admin/sla-rules", { signal }),
        api.get<DepartmentRow[]>("/admin/departments?includeInactive=true", { signal }),
        api.get<OfficeRow[]>("/admin/offices?includeInactive=true", { signal }),
      ]);
      setCategories(categoryData);
      setRouting(routingData);
      setSlas(slaData);
      setDepartments(departmentData);
      setOffices(officeData);
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
        eyebrow="Grievance configuration"
        title="Categories, routing & SLA"
        description="Control how grievances are classified, which department receives them, and the response and resolution clocks applied at registration."
      />

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      <div role="tablist" aria-label="Grievance configuration" className="mb-5 flex flex-wrap gap-1 border-b border-border">
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
        <div className="card-surface p-6"><LoadingBlock label="Loading grievance configuration…" /></div>
      ) : (
        <>
          {tab === "categories" ? (
            <CategoriesTab items={categories} departments={departments} onChanged={load} flash={flash} />
          ) : null}
          {tab === "routing" ? (
            <RoutingTab items={routing} categories={categories} departments={departments} offices={offices} onChanged={load} flash={flash} />
          ) : null}
          {tab === "sla" ? (
            <SlaTab items={slas} categories={categories} onChanged={load} flash={flash} />
          ) : null}
        </>
      )}
    </div>
  );
}

/* -------------------------------- categories ------------------------------- */

const EMPTY_CATEGORY = {
  name: "",
  code: "",
  parent: "",
  defaultDepartment: "",
  defaultPriority: "NORMAL",
  aiKeywords: "",
  requiredEvidence: "",
  active: true,
};

function CategoriesTab({
  items,
  departments,
  onChanged,
  flash,
}: {
  items: CategoryRow[];
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

  function openEdit(item: CategoryRow) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      code: item.code,
      parent: refId(item.parent),
      defaultDepartment: refId(item.defaultDepartment),
      defaultPriority: item.defaultPriority ?? "NORMAL",
      aiKeywords: (item.aiKeywords ?? []).join(", "),
      requiredEvidence: (item.requiredEvidence ?? []).join("\n"),
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
        parent: form.parent || "",
        defaultDepartment: form.defaultDepartment || "",
        defaultPriority: form.defaultPriority,
        aiKeywords: splitList(form.aiKeywords),
        requiredEvidence: splitList(form.requiredEvidence),
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/grievance-categories/${editingId}`, payload);
      else await api.post("/admin/grievance-categories", payload);
      flash(editingId ? "Category updated." : "Category created.");
      setOpen(false);
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item: CategoryRow) {
    if (!window.confirm(`Deactivate ${item.name}? Existing grievances keep their category; it will no longer be offered for new registration.`)) return;
    try {
      await api.delete(`/admin/grievance-categories/${item._id}`);
      flash("Category deactivated.");
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const parentOptions = items.filter((item) => item._id !== editingId);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted-foreground">
          {items.length} categor{items.length === 1 ? "y" : "ies"} · keywords power local classification suggestions
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden />
          Add category
        </Button>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}

      {open ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit category" : "New category"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="cat-name" required>
              <Input id="cat-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={150} />
            </Field>
            <Field label="Code" htmlFor="cat-code" required>
              <Input id="cat-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={40} />
            </Field>
            <Field label="Parent category" htmlFor="cat-parent" hint="Optional sub-category">
              <Select id="cat-parent" value={form.parent} onChange={(event) => setForm((current) => ({ ...current, parent: event.target.value }))}>
                <option value="">Top-level category</option>
                {parentOptions.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Default department" htmlFor="cat-dept" hint="Used when no routing rule matches">
              <Select id="cat-dept" value={form.defaultDepartment} onChange={(event) => setForm((current) => ({ ...current, defaultDepartment: event.target.value }))}>
                <option value="">Not assigned</option>
                {departments.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Default priority" htmlFor="cat-priority">
              <Select id="cat-priority" value={form.defaultPriority} onChange={(event) => setForm((current) => ({ ...current, defaultPriority: event.target.value }))}>
                {PRIORITIES.map((item) => (
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
                Active for new grievances
              </label>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Classification keywords" htmlFor="cat-keywords" hint="Comma separated">
              <Textarea id="cat-keywords" rows={3} value={form.aiKeywords} onChange={(event) => setForm((current) => ({ ...current, aiKeywords: event.target.value }))} />
            </Field>
            <Field label="Required evidence" htmlFor="cat-evidence" hint="One item per line">
              <Textarea id="cat-evidence" rows={3} value={form.requiredEvidence} onChange={(event) => setForm((current) => ({ ...current, requiredEvidence: event.target.value }))} />
            </Field>
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
          <EmptyState title="No grievance categories" description="Add categories so citizens can classify their grievance accurately." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th>Parent</Th>
                  <Th>Default department</Th>
                  <Th>Priority</Th>
                  <Th>Keywords</Th>
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
                    <Td><span className="text-muted-foreground">{refName(item.parent)}</span></Td>
                    <Td><span className="text-muted-foreground">{refName(item.defaultDepartment)}</span></Td>
                    <Td><StatusBadge status={item.defaultPriority} /></Td>
                    <Td><span className="text-[11px] text-muted-foreground">{(item.aiKeywords ?? []).length} terms</span></Td>
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

/* --------------------------------- routing -------------------------------- */

const EMPTY_ROUTING = { category: "", subcategory: "", department: "", office: "", priority: "NORMAL", active: true };

function RoutingTab({
  items,
  categories,
  departments,
  offices,
  onChanged,
  flash,
}: {
  items: RoutingRow[];
  categories: CategoryRow[];
  departments: DepartmentRow[];
  offices: OfficeRow[];
  onChanged: () => Promise<void>;
  flash: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_ROUTING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const subcategoryOptions = useMemo(
    () => categories.filter((item) => refId(item.parent) === form.category),
    [categories, form.category],
  );
  const officeOptions = useMemo(
    () => offices.filter((item) => !form.department || refId(item.department) === form.department),
    [offices, form.department],
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_ROUTING);
    setError("");
    setOpen(true);
  }

  function openEdit(item: RoutingRow) {
    setEditingId(item._id);
    setForm({
      category: refId(item.category),
      subcategory: refId(item.subcategory),
      department: refId(item.department),
      office: refId(item.office),
      priority: item.priority ?? "NORMAL",
      active: item.active,
    });
    setError("");
    setOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!form.category) {
      setError("Select the grievance category this rule applies to.");
      return;
    }
    if (!form.department) {
      setError("Select the department that should receive these grievances.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        category: form.category,
        subcategory: form.subcategory || "",
        department: form.department,
        office: form.office || "",
        priority: form.priority,
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/routing-rules/${editingId}`, payload);
      else await api.post("/admin/routing-rules", payload);
      flash(editingId ? "Routing rule updated." : "Routing rule created.");
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
          Rules are evaluated in order; the first matching active rule assigns the department, office and priority.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden />
          Add routing rule
        </Button>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}

      {open ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit routing rule" : "New routing rule"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="route-category" required>
              <Select
                id="route-category"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value, subcategory: "" }))}
              >
                <option value="">Select category</option>
                {categories.filter((item) => !item.parent).map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
                {categories.filter((item) => item.parent).map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Sub-category" htmlFor="route-subcategory" hint="Optional, must belong to the selected category">
              <Select
                id="route-subcategory"
                value={form.subcategory}
                onChange={(event) => setForm((current) => ({ ...current, subcategory: event.target.value }))}
                disabled={!subcategoryOptions.length}
              >
                <option value="">Any sub-category</option>
                {subcategoryOptions.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Department" htmlFor="route-department" required>
              <Select
                id="route-department"
                value={form.department}
                onChange={(event) => setForm((current) => ({ ...current, department: event.target.value, office: "" }))}
              >
                <option value="">Select department</option>
                {departments.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Office" htmlFor="route-office" hint="Optional field office">
              <Select id="route-office" value={form.office} onChange={(event) => setForm((current) => ({ ...current, office: event.target.value }))}>
                <option value="">Department level</option>
                {officeOptions.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Priority override" htmlFor="route-priority" hint="Applied when the rule matches">
              <Select id="route-priority" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                {PRIORITIES.map((item) => (
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
                Active
              </label>
            </div>
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
          <EmptyState title="No routing rules" description="Without rules, grievances use each category's default department." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th>Sub-category</Th>
                  <Th>Department</Th>
                  <Th>Office</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <Td><span className="font-semibold text-foreground">{refName(item.category)}</span></Td>
                    <Td><span className="text-muted-foreground">{refName(item.subcategory)}</span></Td>
                    <Td><span className="text-muted-foreground">{refName(item.department)}</span></Td>
                    <Td><span className="text-muted-foreground">{refName(item.office)}</span></Td>
                    <Td><StatusBadge status={item.priority} /></Td>
                    <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                    <Td>
                      <div className="flex items-center justify-end">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit routing rule">
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

/* ----------------------------------- sla ---------------------------------- */

const EMPTY_SLA = {
  name: "",
  entityType: "GRIEVANCE",
  category: "",
  priority: "NORMAL",
  responseHours: "24",
  resolutionHours: "72",
  dueSoonHours: "24",
  escalationHours: "",
  pauseAllowed: false,
  active: true,
};

function SlaTab({
  items,
  categories,
  onChanged,
  flash,
}: {
  items: SlaRow[];
  categories: CategoryRow[];
  onChanged: () => Promise<void>;
  flash: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_SLA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_SLA);
    setError("");
    setOpen(true);
  }

  function openEdit(item: SlaRow) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      entityType: item.entityType,
      category: refId(item.category),
      priority: item.priority,
      responseHours: String(item.responseHours),
      resolutionHours: String(item.resolutionHours),
      dueSoonHours: String(item.dueSoonHours ?? 24),
      escalationHours: (item.escalationHours ?? []).join(", "),
      pauseAllowed: Boolean(item.pauseAllowed),
      active: item.active,
    });
    setError("");
    setOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (form.name.trim().length < 2) {
      setError("Enter an SLA rule name.");
      return;
    }
    const responseHours = Number(form.responseHours);
    const resolutionHours = Number(form.resolutionHours);
    const dueSoonHours = Number(form.dueSoonHours);
    if (!Number.isFinite(responseHours) || responseHours < 1) {
      setError("Response hours must be at least 1.");
      return;
    }
    if (!Number.isFinite(resolutionHours) || resolutionHours < 1) {
      setError("Resolution hours must be at least 1.");
      return;
    }
    const escalation = form.escalationHours
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((value) => Number.isFinite(value));
    if (escalation.length > 0 && escalation.length !== 3) {
      setError("Escalation hours require exactly three thresholds, e.g. 24, 48, 72.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        entityType: form.entityType,
        category: form.entityType === "GRIEVANCE" ? form.category || "" : "",
        priority: form.priority,
        responseHours,
        resolutionHours,
        dueSoonHours: Number.isFinite(dueSoonHours) && dueSoonHours > 0 ? dueSoonHours : undefined,
        escalationHours: escalation.length === 3 ? escalation : undefined,
        pauseAllowed: form.pauseAllowed,
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/sla-rules/${editingId}`, payload);
      else await api.post("/admin/sla-rules", payload);
      flash(editingId ? "SLA rule updated." : "SLA rule created.");
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
          {items.length} SLA rule{items.length === 1 ? "" : "s"} · clocks run in the district working calendar
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden />
          Add SLA rule
        </Button>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}

      {open ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit SLA rule" : "New SLA rule"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rule name" htmlFor="sla-name" required>
              <Input id="sla-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} />
            </Field>
            <Field label="Applies to" htmlFor="sla-entity">
              <Select
                id="sla-entity"
                value={form.entityType}
                onChange={(event) => setForm((current) => ({ ...current, entityType: event.target.value, category: "" }))}
              >
                <option value="GRIEVANCE">Grievance</option>
                <option value="FILE">Digital file</option>
                <option value="APPLICATION">Application</option>
                <option value="TASK">Meeting task</option>
              </Select>
            </Field>
            {form.entityType === "GRIEVANCE" ? (
              <Field label="Category" htmlFor="sla-category" hint="Leave empty to apply to all categories">
                <Select id="sla-category" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                  <option value="">All categories</option>
                  {categories.map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Priority" htmlFor="sla-priority">
              <Select id="sla-priority" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                {PRIORITIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Response clock (hours)" htmlFor="sla-response" required>
              <Input id="sla-response" type="number" min={1} value={form.responseHours} onChange={(event) => setForm((current) => ({ ...current, responseHours: event.target.value }))} />
            </Field>
            <Field label="Resolution clock (hours)" htmlFor="sla-resolution" required>
              <Input id="sla-resolution" type="number" min={1} value={form.resolutionHours} onChange={(event) => setForm((current) => ({ ...current, resolutionHours: event.target.value }))} />
            </Field>
            <Field label="Due-soon warning (hours)" htmlFor="sla-duesoon" hint="Used for due-soon badges">
              <Input id="sla-duesoon" type="number" min={1} value={form.dueSoonHours} onChange={(event) => setForm((current) => ({ ...current, dueSoonHours: event.target.value }))} />
            </Field>
            <Field label="Escalation thresholds (hours)" htmlFor="sla-escalation" hint="Three comma-separated values, e.g. 24, 48, 72">
              <Input id="sla-escalation" value={form.escalationHours} onChange={(event) => setForm((current) => ({ ...current, escalationHours: event.target.value }))} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={form.pauseAllowed}
                onChange={(event) => setForm((current) => ({ ...current, pauseAllowed: event.target.checked }))}
                className="size-3.5 accent-[var(--primary)]"
              />
              Allow the SLA clock to pause (for example, awaiting citizen documents)
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
              {saving ? "Saving…" : editingId ? "Save changes" : "Create SLA rule"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {items.length === 0 ? (
          <EmptyState title="No SLA rules" description="Create SLA rules so every case gets response and resolution clocks." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Rule</Th>
                  <Th>Applies to</Th>
                  <Th>Priority</Th>
                  <Th>Response</Th>
                  <Th>Resolution</Th>
                  <Th>Escalation</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <Td>
                      <p className="font-semibold text-foreground">{item.name}</p>
                      {item.updatedAt ? <p className="text-[10.5px] text-muted-foreground">{formatDateTime(item.updatedAt)}</p> : null}
                    </Td>
                    <Td>
                      <p className="text-[11.5px] text-foreground">{item.entityType}</p>
                      <p className="text-[10.5px] text-muted-foreground">{refName(item.category)}</p>
                    </Td>
                    <Td><StatusBadge status={item.priority} /></Td>
                    <Td><span className="text-[11.5px] text-muted-foreground">{item.responseHours}h</span></Td>
                    <Td><span className="text-[11.5px] text-muted-foreground">{item.resolutionHours}h</span></Td>
                    <Td><span className="text-[11.5px] text-muted-foreground">{(item.escalationHours ?? []).join(" / ") || "—"}</span></Td>
                    <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                    <Td>
                      <div className="flex items-center justify-end">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit SLA rule">
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
