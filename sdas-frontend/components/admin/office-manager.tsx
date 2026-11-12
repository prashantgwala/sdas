"use client";

import { Building, PencilLine, Plus, Power, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/dashboard/list-controls";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";

interface OfficeRow {
  _id: string;
  name: string;
  code: string;
  department?: { _id?: string; name?: string; code?: string } | null;
  tehsil?: { _id?: string; name?: string; code?: string } | null;
  address?: string;
  active: boolean;
}

interface DepartmentOption {
  _id: string;
  name: string;
  code: string;
}

interface UnitOption {
  _id: string;
  name: string;
  code: string;
}

const EMPTY = { name: "", code: "", department: "", tehsil: "", address: "", active: true };

export function OfficeManager() {
  const [items, setItems] = useState<OfficeRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ includeInactive: includeInactive ? "true" : "false" });
      if (departmentFilter) query.set("department", departmentFilter);
      const data = await api.get<OfficeRow[]>(`/admin/offices?${query.toString()}`);
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
  }, [includeInactive, departmentFilter]);

  useEffect(() => {
    Promise.all([
      api.get<DepartmentOption[]>("/admin/departments?includeInactive=true"),
      api.get<UnitOption[]>("/admin/units?includeInactive=true"),
    ])
      .then(([departmentData, unitData]) => {
        setDepartments(departmentData);
        setUnits(unitData);
      })
      .catch(() => undefined);
  }, []);

  const departmentOptions = useMemo(
    () => departments.map((item) => ({ value: item._id, label: `${item.name} (${item.code})` })),
    [departments],
  );

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY, department: departmentFilter || "" });
    setFormError("");
    setEditorOpen(true);
  }

  function openEdit(item: OfficeRow) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      code: item.code,
      department: item.department?._id ?? "",
      tehsil: item.tehsil?._id ?? "",
      address: item.address ?? "",
      active: item.active,
    });
    setFormError("");
    setEditorOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (form.name.trim().length < 2) {
      setFormError("Enter an office name.");
      return;
    }
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(form.code.trim())) {
      setFormError("Code must be 2–30 characters using letters, numbers, hyphen or underscore.");
      return;
    }
    if (!form.department) {
      setFormError("Select the department that owns this office.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        department: form.department,
        tehsil: form.tehsil || "",
        address: form.address.trim(),
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/offices/${editingId}`, payload);
      else await api.post("/admin/offices", payload);
      setNotice(editingId ? "Office updated." : "Office created.");
      setEditorOpen(false);
      await load();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item: OfficeRow) {
    if (!window.confirm(`Deactivate ${item.name}? Staff assigned here keep their history but it cannot be used for new assignments.`)) return;
    setError("");
    try {
      await api.delete(`/admin/offices/${item._id}`);
      setNotice("Office deactivated.");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Offices</h2>
          <p className="text-[11.5px] text-muted-foreground">Field offices mapped to a department and administrative unit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={departmentFilter}
            onChange={setDepartmentFilter}
            options={departmentOptions}
            placeholder="All departments"
            label="Filter by department"
            className="h-9"
          />
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
            Add office
          </Button>
        </div>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      {editorOpen ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit office" : "New office"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditorOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {formError ? <div className="mb-3"><Alert variant="error">{formError}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="office-name" required>
              <Input id="office-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={150} />
            </Field>
            <Field label="Code" htmlFor="office-code" hint="Letters, numbers, - _" required>
              <Input id="office-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={30} />
            </Field>
            <Field label="Department" htmlFor="office-department" required>
              <Select id="office-department" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}>
                <option value="">Select department</option>
                {departments.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Administrative unit" htmlFor="office-tehsil" hint="Optional">
              <Select id="office-tehsil" value={form.tehsil} onChange={(event) => setForm((current) => ({ ...current, tehsil: event.target.value }))}>
                <option value="">Not mapped</option>
                {units.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Address" htmlFor="office-address" hint="Optional">
              <Textarea id="office-address" rows={2} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} maxLength={500} />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="size-3.5 accent-[var(--primary)]"
              />
              Active for new assignments
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create office"}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading offices…" />
        ) : items.length === 0 ? (
          <EmptyState title="No offices" description="Add field offices so work can be routed to the right place." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Office</Th>
                  <Th>Department</Th>
                  <Th>Unit</Th>
                  <Th>Address</Th>
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
                          <Building className="size-3.5" aria-hidden />
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">{item.name}</p>
                          <p className="font-mono text-[10.5px] text-muted-foreground">{item.code}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><span className="text-muted-foreground">{item.department?.name ?? "—"}</span></Td>
                    <Td><span className="text-muted-foreground">{item.tehsil?.name ?? "—"}</span></Td>
                    <Td><span className="line-clamp-2 max-w-[240px] text-[11.5px] text-muted-foreground">{item.address || "—"}</span></Td>
                    <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit office">
                          <PencilLine className="size-3.5" aria-hidden />
                        </Button>
                        {item.active ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void deactivate(item)}
                            title="Deactivate office"
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
