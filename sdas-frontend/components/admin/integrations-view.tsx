"use client";

import { Cable, CircleAlert, FlaskConical, PencilLine, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface IntegrationRow {
  _id: string;
  key: string;
  name: string;
  category: "EMAIL" | "SMS" | "AI" | "OCR" | "WEATHER" | "GOVERNMENT" | "STORAGE";
  provider?: string;
  status: string;
  lastTestAt?: string | null;
  lastError?: string | null;
  notes?: string;
  updatedAt?: string;
}

interface TestResult {
  ok: boolean;
  status: string;
  message: string;
  testedAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  AI: "AI assistance",
  OCR: "Document OCR",
  WEATHER: "Weather",
  GOVERNMENT: "Government systems",
  STORAGE: "Storage",
};

const STATUSES = [
  { value: "NOT_CONFIGURED", label: "Not configured" },
  { value: "CONFIGURED", label: "Configured — not yet tested" },
  { value: "TESTED", label: "Tested" },
  { value: "ACTIVE", label: "Active" },
  { value: "DISABLED", label: "Disabled" },
];

interface ConfigRow {
  key: string;
  value: string;
}

export function IntegrationsView() {
  const [items, setItems] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<IntegrationRow | null>(null);
  const [form, setForm] = useState({ name: "", provider: "", status: "NOT_CONFIGURED", notes: "" });
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<IntegrationRow[]>("/admin/integrations", { signal });
      setItems(data);
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

  const groups = useMemo(() => {
    const map = new Map<string, IntegrationRow[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  }, [items]);

  function openEdit(item: IntegrationRow) {
    setEditing(item);
    setForm({ name: item.name, provider: item.provider ?? "", status: item.status, notes: item.notes ?? "" });
    setConfigRows([]);
    setFormError("");
    setNotice("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setFormError("");
    if (form.name.trim().length < 2) {
      setFormError("Enter an integration name.");
      return;
    }
    const rows = configRows.filter((row) => row.key.trim());
    if (rows.length && rows.some((row) => !row.value.trim())) {
      setFormError("Every credential field needs a value, or remove the empty row.");
      return;
    }
    const config: Record<string, string> = {};
    for (const row of rows) config[row.key.trim()] = row.value.trim();
    setSaving(true);
    try {
      await api.patch(`/admin/integrations/${editing.key}`, {
        name: form.name.trim(),
        provider: form.provider.trim(),
        status: form.status,
        notes: form.notes.trim(),
        ...(rows.length ? { config } : {}),
      });
      setNotice(`${form.name.trim()} saved.${rows.length ? " Credentials were stored encrypted." : ""}`);
      setEditing(null);
      await load();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function test(item: IntegrationRow) {
    setTestingKey(item.key);
    setError("");
    setNotice("");
    try {
      const result = await api.post<TestResult>(`/admin/integrations/${item.key}/test`);
      setTestResults((current) => ({ ...current, [item.key]: result }));
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setTestingKey(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Integrations"
        description="External channels stay disabled until credentials are configured and a connection test succeeds. Stored credentials are write-only and never returned by the API."
      />

      <div className="mb-4">
        <Alert variant="info" title="Operational status is honest">
          Marking an integration active does not fabricate a connection. Test results reflect the provider actually
          reachable from this server, and AI suggestions always require human review.
        </Alert>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      {editing ? (
        <form onSubmit={save} className="card-surface mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold">Configure {editing.name}</p>
              <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{editing.key}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(null)} aria-label="Close editor">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {formError ? <div className="mb-3"><Alert variant="error">{formError}</Alert></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="integration-name" required>
              <Input id="integration-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={150} />
            </Field>
            <Field label="Provider" htmlFor="integration-provider" hint="Optional">
              <Input id="integration-provider" value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} maxLength={120} />
            </Field>
            <Field label="Status" htmlFor="integration-status" hint="Testing updates this automatically">
              <Select id="integration-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                {STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12.5px] font-semibold text-foreground">Credentials</p>
                <p className="text-[11px] text-muted-foreground">
                  Stored encrypted and never displayed again. Leave all rows empty to keep existing credentials.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setConfigRows((rows) => [...rows, { key: "", value: "" }])}>
                <Plus className="size-3.5" aria-hidden />
                Add field
              </Button>
            </div>
            {configRows.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-3 text-[11.5px] text-muted-foreground">
                No new credentials to write. Existing credentials will be preserved.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {configRows.map((row, index) => (
                  <div key={index} className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={row.key}
                      onChange={(event) =>
                        setConfigRows((rows) =>
                          rows.map((item, itemIndex) => (itemIndex === index ? { ...item, key: event.target.value } : item)),
                        )
                      }
                      placeholder="Field name, e.g. apiKey"
                      aria-label={`Credential field ${index + 1} name`}
                      maxLength={80}
                      className="sm:w-64"
                    />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={row.value}
                      onChange={(event) =>
                        setConfigRows((rows) =>
                          rows.map((item, itemIndex) => (itemIndex === index ? { ...item, value: event.target.value } : item)),
                        )
                      }
                      placeholder="Value"
                      aria-label={`Credential field ${index + 1} value`}
                      maxLength={500}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfigRows((rows) => rows.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label={`Remove credential field ${index + 1}`}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <Field label="Administrator notes" htmlFor="integration-notes" hint="Optional">
              <Textarea id="integration-notes" rows={2} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} maxLength={2000} />
            </Field>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save integration"}
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="card-surface p-6"><LoadingBlock label="Loading integrations…" /></div>
      ) : items.length === 0 ? (
        <div className="card-surface p-6"><EmptyState title="No integrations" description="Integration records are provisioned during seeding." /></div>
      ) : (
        <div className="space-y-5">
          {groups.map(([category, list]) => (
            <section key={category}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {list.map((item) => {
                  const result = testResults[item.key];
                  const busy = testingKey === item.key;
                  return (
                    <article key={item._id} className="card-surface flex flex-col p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                            <Cable className="size-4" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-foreground">{item.name}</p>
                            <p className="font-mono text-[10.5px] text-muted-foreground">{item.key}</p>
                          </div>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <dt className="text-muted-foreground">Provider</dt>
                          <dd className="truncate text-foreground">{item.provider || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Last tested</dt>
                          <dd className="text-foreground">{item.lastTestAt ? formatDateTime(item.lastTestAt) : "Never"}</dd>
                        </div>
                      </dl>

                      {item.notes ? <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{item.notes}</p> : null}

                      {item.lastError ? (
                        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-danger">
                          <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                          <span>{item.lastError}</span>
                        </p>
                      ) : null}

                      {result ? (
                        <p className={result.ok ? "mt-2 text-[11px] font-medium text-success" : "mt-2 text-[11px] font-medium text-danger"}>
                          {result.message}
                        </p>
                      ) : null}

                      <div className="mt-3 flex gap-2 border-t border-border pt-3">
                        <Button variant="secondary" size="sm" onClick={() => void test(item)} disabled={busy}>
                          <FlaskConical className="size-3.5" aria-hidden />
                          {busy ? "Testing…" : "Test connection"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          <PencilLine className="size-3.5" aria-hidden />
                          Configure
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
