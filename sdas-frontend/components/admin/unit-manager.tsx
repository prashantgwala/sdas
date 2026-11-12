"use client";

import { MapPin, PencilLine, Plus, Power, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";

interface UnitRow {
  _id: string;
  name: string;
  code: string;
  type?: string;
  active: boolean;
}

const TYPES = [
  { value: "TEHSIL", label: "Tehsil" },
  { value: "BLOCK", label: "Block" },
  { value: "WARD", label: "Ward" },
  { value: "VILLAGE", label: "Village" },
];

const EMPTY = { name: "", code: "", type: "TEHSIL", active: true };

export function UnitManager() {
  const [items, setItems] = useState<UnitRow[]>([]);
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
      const data = await api.get<UnitRow[]>(
        `/admin/units?includeInactive=${includeInactive ? "true" : "false"}`,
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

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setFormError("");
    setEditorOpen(true);
  }

  function openEdit(item: UnitRow) {
    setEditingId(item._id);
    setForm({ name: item.name, code: item.code, type: item.type ?? "TEHSIL", active: item.active });
    setFormError("");
    setEditorOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (form.name.trim().length < 2) {
      setFormError("Enter a unit name.");
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
        type: form.type,
        active: form.active,
      };
      if (editingId) await api.patch(`/admin/units/${editingId}`, payload);
      else await api.post("/admin/units", payload);
      setNotice(editingId ? "Administrative unit updated." : "Administrative unit created.");
      setEditorOpen(false);
      await load();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item: UnitRow) {
    if (!window.confirm(`Deactivate ${item.name}? Existing records that reference it remain unchanged.`)) return;
    setError("");
    try {
      await api.delete(`/admin/units/${item._id}`);
      setNotice("Administrative unit deactivated.");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Administrative units</h2>
          <p className="text-[11.5px] text-muted-foreground">Tehsils, blocks, wards and villages used for jurisdiction and office mapping.</p>
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
            Add unit
          </Button>
        </div>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      {editorOpen ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit administrative unit" : "New administrative unit"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditorOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {formError ? <div className="mb-3"><Alert variant="error">{formError}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" htmlFor="unit-name" required>
              <Input id="unit-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={150} />
            </Field>
            <Field label="Code" htmlFor="unit-code" hint="Letters, numbers, - _" required>
              <Input id="unit-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={30} />
            </Field>
            <Field label="Type" htmlFor="unit-type">
              <Select id="unit-type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
                {TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
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
                {saving ? "Saving…" : editingId ? "Save changes" : "Create unit"}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading administrative units…" />
        ) : items.length === 0 ? (
          <EmptyState title="No administrative units" description="Create the first tehsil, block, ward or village to start mapping jurisdiction." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Unit</Th>
                  <Th>Code</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-info-soft text-info">
                          <MapPin className="size-3.5" aria-hidden />
                        </span>
                        <span className="font-semibold text-foreground">{item.name}</span>
                      </div>
                    </Td>
                    <Td><span className="font-mono text-[11px] text-muted-foreground">{item.code}</span></Td>
                    <Td><span className="text-muted-foreground">{TYPES.find((type) => type.value === item.type)?.label ?? item.type ?? "—"}</span></Td>
                    <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit unit">
                          <PencilLine className="size-3.5" aria-hidden />
                        </Button>
                        {item.active ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void deactivate(item)}
                            title="Deactivate unit"
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
