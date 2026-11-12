"use client";

import { Building2, PencilLine, Plus, Power, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { OfficerOption } from "@/lib/types";

interface DepartmentRow {
  _id: string;
  name: string;
  code: string;
  description?: string;
  head?: { _id?: string; name?: string; designation?: string } | null;
  contactEmail?: string;
  contactPhone?: string;
  active: boolean;
}

const EMPTY = {
  name: "",
  code: "",
  description: "",
  head: "",
  contactEmail: "",
  contactPhone: "",
  active: true,
};

export function DepartmentManager() {
  const [items, setItems] = useState<DepartmentRow[]>([]);
  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<DepartmentRow[]>(
        `/admin/departments?includeInactive=${includeInactive ? "true" : "false"}`,
      );
      setItems(data);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  useEffect(() => {
    api
      .get<OfficerOption[]>("/reference/officers")
      .then(setOfficers)
      .catch(() => undefined);
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setFormError("");
    setEditorOpen(true);
  }

  function openEdit(item: DepartmentRow) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      code: item.code,
      description: item.description ?? "",
      head: item.head?._id ?? "",
      contactEmail: item.contactEmail ?? "",
      contactPhone: item.contactPhone ?? "",
      active: item.active,
    });
    setFormError("");
    setEditorOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (form.name.trim().length < 2) {
      setFormError("Enter a department name.");
      return;
    }
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(form.code.trim())) {
      setFormError("Code must be 2–30 characters using letters, numbers, hyphen or underscore.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        head: form.head || "",
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/departments/${editingId}`, payload);
      else await api.post("/admin/departments", payload);
      setNotice(editingId ? "Department updated." : "Department created.");
      setEditorOpen(false);
      await load();
      window.dispatchEvent(new CustomEvent("sdas:counters-changed"));
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item: DepartmentRow) {
    if (!window.confirm(`Deactivate ${item.name}? It will be hidden from new assignments but historical records remain.`)) return;
    setError("");
    try {
      await api.delete(`/admin/departments/${item._id}`);
      setNotice("Department deactivated.");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Departments</h2>
          <p className="text-[11.5px] text-muted-foreground">Organisational units that own grievances, files and applications.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="size-3.5 accent-[var(--primary)]"
            />
            Show inactive
          </label>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-3.5" aria-hidden />
            Add department
          </Button>
        </div>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      {editorOpen ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit department" : "New department"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditorOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {formError ? <div className="mb-3"><Alert variant="error">{formError}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="dept-name" required>
              <Input id="dept-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={150} />
            </Field>
            <Field label="Code" htmlFor="dept-code" hint="Letters, numbers, - _" required>
              <Input id="dept-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={30} />
            </Field>
            <Field label="Head" htmlFor="dept-head" hint="Optional">
              <Select id="dept-head" value={form.head} onChange={(event) => setForm((current) => ({ ...current, head: event.target.value }))}>
                <option value="">Not assigned</option>
                {officers.map((officer) => (
                  <option key={officer.id} value={officer.id}>
                    {officer.name} — {officer.roleLabel}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contact email" htmlFor="dept-email" hint="Optional">
              <Input id="dept-email" type="email" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} maxLength={200} />
            </Field>
            <Field label="Contact phone" htmlFor="dept-phone" hint="Optional">
              <Input id="dept-phone" value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} maxLength={20} />
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  className="size-3.5 accent-[var(--primary)]"
                />
                Active for new assignments
              </label>
            </div>
          </div>
          <div className="mt-4">
            <Field label="Description" htmlFor="dept-description" hint="Optional">
              <Textarea id="dept-description" rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={500} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create department"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading departments…" />
        ) : items.length === 0 ? (
          <EmptyState title="No departments" description="Create the district's first department to begin routing work." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Department</Th>
                  <Th>Code</Th>
                  <Th>Head</Th>
                  <Th>Contact</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">
                          <Building2 className="size-3.5" aria-hidden />
                        </span>
                        <div className="max-w-[220px]">
                          <p className="truncate font-semibold text-foreground">{item.name}</p>
                          {item.description ? (
                            <p className="line-clamp-1 text-[10.5px] text-muted-foreground">{item.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    <Td><span className="font-mono text-[11px] text-muted-foreground">{item.code}</span></Td>
                    <Td><span className="text-muted-foreground">{item.head?.name ?? "—"}</span></Td>
                    <Td>
                      <div className="text-[11px] text-muted-foreground">
                        {item.contactEmail ? <p className="truncate">{item.contactEmail}</p> : null}
                        {item.contactPhone ? <p>{item.contactPhone}</p> : null}
                        {!item.contactEmail && !item.contactPhone ? "—" : null}
                      </div>
                    </Td>
                    <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit department">
                          <PencilLine className="size-3.5" aria-hidden />
                        </Button>
                        {item.active ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void deactivate(item)}
                            title="Deactivate department"
                            className="text-muted-foreground hover:text-danger"
                          >
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
