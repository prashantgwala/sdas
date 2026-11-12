"use client";

import { FileSearch, PencilLine, Plus, Power, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, PageHeader, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { IdRef } from "@/lib/types";

interface DocumentRequirement {
  key: string;
  label: string;
  required: boolean;
}

interface FormFieldDefinition {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

interface ApplicationTypeRow {
  _id: string;
  name: string;
  code: string;
  department?: IdRef | string | null;
  description?: string;
  requiredDocuments?: DocumentRequirement[];
  formFieldSchema?: { fields?: FormFieldDefinition[] } | Record<string, unknown>;
  slaRule?: IdRef | string | null;
  active: boolean;
}

interface DepartmentRow {
  _id: string;
  name: string;
}

interface SlaRow {
  _id: string;
  name: string;
  entityType: string;
  active: boolean;
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
];

const DOCUMENT_EMPTY: DocumentRequirement = { key: "", label: "", required: true };
const FIELD_EMPTY = { key: "", label: "", type: "text", required: true, options: "" };

interface EditorState {
  name: string;
  code: string;
  department: string;
  description: string;
  slaRule: string;
  active: boolean;
  documents: DocumentRequirement[];
  fields: Array<{ key: string; label: string; type: string; required: boolean; options: string }>;
}

const EMPTY_EDITOR: EditorState = {
  name: "",
  code: "",
  department: "",
  description: "",
  slaRule: "",
  active: true,
  documents: [{ ...DOCUMENT_EMPTY, key: "identity", label: "Identity proof" }],
  fields: [{ ...FIELD_EMPTY }],
};

function refId(value?: IdRef | string | null): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id ?? "";
}

function fieldsOf(schema?: { fields?: FormFieldDefinition[] } | Record<string, unknown>): FormFieldDefinition[] {
  if (!schema || typeof schema !== "object") return [];
  const fields = (schema as { fields?: unknown }).fields;
  return Array.isArray(fields) ? (fields as FormFieldDefinition[]) : [];
}

export function ApplicationTypeManager() {
  const [items, setItems] = useState<ApplicationTypeRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [slas, setSlas] = useState<SlaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditorState>(EMPTY_EDITOR);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async (inactive: boolean, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const [typeData, departmentData, slaData] = await Promise.all([
        api.get<ApplicationTypeRow[]>(`/admin/application-types?includeInactive=${inactive ? "true" : "false"}`, { signal }),
        api.get<DepartmentRow[]>("/admin/departments?includeInactive=true", { signal }),
        api.get<SlaRow[]>("/admin/sla-rules", { signal }),
      ]);
      setItems(typeData);
      setDepartments(departmentData);
      setSlas(slaData.filter((item) => item.entityType === "APPLICATION"));
    } catch (cause) {
      if (!signal?.aborted) setError(errorMessage(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(includeInactive, controller.signal);
    return () => controller.abort();
  }, [includeInactive, load]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_EDITOR, documents: [{ ...DOCUMENT_EMPTY, key: "identity", label: "Identity proof" }], fields: [{ ...FIELD_EMPTY }] });
    setFormError("");
    setOpen(true);
  }

  function openEdit(item: ApplicationTypeRow) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      code: item.code,
      department: refId(item.department),
      description: item.description ?? "",
      slaRule: refId(item.slaRule),
      active: item.active,
      documents: (item.requiredDocuments ?? []).map((document) => ({ ...document })),
      fields: fieldsOf(item.formFieldSchema).map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: Boolean(field.required),
        options: (field.options ?? []).join(", "),
      })),
    });
    setFormError("");
    setOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (form.name.trim().length < 2) {
      setFormError("Enter the service name.");
      return;
    }
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(form.code.trim())) {
      setFormError("Code must be 2–40 characters using letters, numbers, hyphen or underscore.");
      return;
    }
    if (!form.department) {
      setFormError("Select the department that owns this service.");
      return;
    }
    const documents = form.documents.filter((document) => document.key.trim() || document.label.trim());
    if (documents.some((document) => !document.key.trim() || !document.label.trim())) {
      setFormError("Every required document needs both a key and a label.");
      return;
    }
    if (new Set(documents.map((document) => document.key.trim())).size !== documents.length) {
      setFormError("Document keys must be unique.");
      return;
    }
    const fields = form.fields.filter((field) => field.key.trim() || field.label.trim());
    if (fields.some((field) => !field.key.trim() || !field.label.trim())) {
      setFormError("Every form field needs both a key and a label.");
      return;
    }
    if (new Set(fields.map((field) => field.key.trim())).size !== fields.length) {
      setFormError("Form field keys must be unique.");
      return;
    }
    if (fields.some((field) => field.type === "select" && !field.options.trim())) {
      setFormError("Dropdown fields need at least one option.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        department: form.department,
        description: form.description.trim(),
        slaRule: form.slaRule || "",
        active: form.active,
        requiredDocuments: documents.map((document) => ({
          key: document.key.trim(),
          label: document.label.trim(),
          required: document.required,
        })),
        formFieldSchema: {
          fields: fields.map((field) => ({
            key: field.key.trim(),
            label: field.label.trim(),
            type: field.type,
            required: field.required,
            ...(field.type === "select"
              ? { options: field.options.split(",").map((option) => option.trim()).filter(Boolean) }
              : {}),
          })),
        },
      };
      if (editingId) await api.patch(`/admin/application-types/${editingId}`, payload);
      else await api.post("/admin/application-types", payload);
      flash(editingId ? "Application type updated." : "Application type created.");
      setOpen(false);
      await load(includeInactive);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item: ApplicationTypeRow) {
    if (!window.confirm(`Deactivate ${item.name}? It will no longer be offered to citizens; existing applications are unaffected.`)) return;
    try {
      await api.delete(`/admin/application-types/${item._id}`);
      flash("Application type deactivated.");
      await load(includeInactive);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Application configuration"
        title="Service applications"
        description="Define the certificate and service types citizens can apply for, the documents required, and the dynamic form shown at submission."
        actions={
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
              Add application type
            </Button>
          </div>
        }
      />

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      {open ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">{editingId ? "Edit application type" : "New application type"}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {formError ? <div className="mb-3"><Alert variant="error">{formError}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service name" htmlFor="apptype-name" required>
              <Input id="apptype-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={180} />
            </Field>
            <Field label="Code" htmlFor="apptype-code" required>
              <Input id="apptype-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={40} />
            </Field>
            <Field label="Department" htmlFor="apptype-dept" required>
              <Select id="apptype-dept" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}>
                <option value="">Select department</option>
                {departments.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="SLA rule" htmlFor="apptype-sla" hint="Optional processing clock">
              <Select id="apptype-sla" value={form.slaRule} onChange={(event) => setForm((current) => ({ ...current, slaRule: event.target.value }))}>
                <option value="">No SLA</option>
                {slas.filter((item) => item.active).map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Description" htmlFor="apptype-description" hint="Shown to citizens before they apply">
              <Textarea id="apptype-description" rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={2000} />
            </Field>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12.5px] font-semibold text-foreground">Required documents</p>
                <p className="text-[11px] text-muted-foreground">Citizens upload these after submitting the application.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setForm((current) => ({ ...current, documents: [...current.documents, { ...DOCUMENT_EMPTY }] }))}
              >
                <Plus className="size-3.5" aria-hidden />
                Add document
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {form.documents.map((document, index) => (
                <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={document.key}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        documents: current.documents.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, key: event.target.value } : item,
                        ),
                      }))
                    }
                    placeholder="Key, e.g. identity"
                    aria-label={`Document ${index + 1} key`}
                    className="sm:w-48"
                  />
                  <Input
                    value={document.label}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        documents: current.documents.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item,
                        ),
                      }))
                    }
                    placeholder="Label shown to citizens"
                    aria-label={`Document ${index + 1} label`}
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={document.required}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          documents: current.documents.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, required: event.target.checked } : item,
                          ),
                        }))
                      }
                      className="size-3.5 accent-[var(--primary)]"
                    />
                    Required
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setForm((current) => ({ ...current, documents: current.documents.filter((_, itemIndex) => itemIndex !== index) }))}
                    aria-label={`Remove document ${index + 1}`}
                    className="text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12.5px] font-semibold text-foreground">Application form fields</p>
                <p className="text-[11px] text-muted-foreground">The citizen form and case detail view are generated from these fields.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setForm((current) => ({ ...current, fields: [...current.fields, { ...FIELD_EMPTY }] }))}
              >
                <Plus className="size-3.5" aria-hidden />
                Add field
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {form.fields.map((field, index) => (
                <div key={index} className="rounded-lg border border-border p-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={field.key}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          fields: current.fields.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, key: event.target.value } : item,
                          ),
                        }))
                      }
                      placeholder="Key, e.g. annualIncome"
                      aria-label={`Field ${index + 1} key`}
                      className="sm:w-48"
                    />
                    <Input
                      value={field.label}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          fields: current.fields.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, label: event.target.value } : item,
                          ),
                        }))
                      }
                      placeholder="Label shown to citizens"
                      aria-label={`Field ${index + 1} label`}
                    />
                    <Select
                      value={field.type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          fields: current.fields.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, type: event.target.value } : item,
                          ),
                        }))
                      }
                      aria-label={`Field ${index + 1} type`}
                      className="sm:w-36"
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </Select>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            fields: current.fields.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, required: event.target.checked } : item,
                            ),
                          }))
                        }
                        className="size-3.5 accent-[var(--primary)]"
                      />
                      Required
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setForm((current) => ({ ...current, fields: current.fields.filter((_, itemIndex) => itemIndex !== index) }))}
                      aria-label={`Remove field ${index + 1}`}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  {field.type === "select" ? (
                    <Input
                      value={field.options}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          fields: current.fields.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, options: event.target.value } : item,
                          ),
                        }))
                      }
                      placeholder="Dropdown options, comma separated"
                      aria-label={`Field ${index + 1} options`}
                      className="mt-2 h-9 text-[12px]"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="size-3.5 accent-[var(--primary)]"
              />
              Active for new applications
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create application type"}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading application types…" />
        ) : items.length === 0 ? (
          <EmptyState title="No application types" description="Add the first service so citizens can submit applications online." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Service</Th>
                  <Th>Department</Th>
                  <Th>Documents</Th>
                  <Th>Form fields</Th>
                  <Th>SLA</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const fields = fieldsOf(item.formFieldSchema);
                  const sla = slas.find((entry) => entry._id === refId(item.slaRule));
                  return (
                    <tr key={item._id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">
                            <FileSearch className="size-3.5" aria-hidden />
                          </span>
                          <div>
                            <p className="font-semibold text-foreground">{item.name}</p>
                            <p className="font-mono text-[10.5px] text-muted-foreground">{item.code}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-muted-foreground">
                          {typeof item.department === "string" ? item.department : item.department?.name ?? "—"}
                        </span>
                      </Td>
                      <Td><span className="text-[11.5px] text-muted-foreground">{(item.requiredDocuments ?? []).length}</span></Td>
                      <Td><span className="text-[11.5px] text-muted-foreground">{fields.length}</span></Td>
                      <Td><span className="text-[11.5px] text-muted-foreground">{sla?.name ?? "—"}</span></Td>
                      <Td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="Edit application type">
                            <PencilLine className="size-3.5" aria-hidden />
                          </Button>
                          {item.active ? (
                            <Button variant="ghost" size="icon-sm" onClick={() => void deactivate(item)} title="Deactivate application type" className="text-muted-foreground hover:text-danger">
                              <Power className="size-3.5" aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
