"use client";

import { Lock, Save, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader, SectionCard } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface SettingRow {
  _id: string;
  key: string;
  value: unknown;
  category: string;
  description?: string;
  updatedAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  security: "Security",
  notifications: "Notifications",
  files: "Files & uploads",
  reports: "Reports",
  ai: "AI assistance",
};

const LOCKED: Record<string, string> = {
  "ai.requireHumanReview":
    "Human review of AI suggestions is a platform invariant and cannot be disabled.",
  "restricted.moduleEnabled":
    "Restricted safety review is environment-managed and stays disabled unless separately approved and enabled by operations.",
  "notifications.smsEnabled":
    "SMS delivery requires an approved provider wired into the notification service. Configure and test the SMS integration first.",
};

function labelFor(key: string): string {
  const name = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase())
    .trim();
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isBoolean(value: unknown): boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): boolean {
  return typeof value === "number";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function SettingsEditor() {
  const [items, setItems] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<SettingRow[]>("/admin/settings", { signal });
      setItems(data);
      setDrafts({});
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

  const grouped = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  function currentValue(row: SettingRow): unknown {
    return Object.prototype.hasOwnProperty.call(drafts, row.key) ? drafts[row.key] : row.value;
  }

  function setDraft(key: string, value: unknown) {
    setDrafts((current) => ({ ...current, [key]: value }));
  }

  async function save(row: SettingRow) {
    const value = currentValue(row);
    setSavingKey(row.key);
    setError("");
    setNotice("");
    try {
      const updated = await api.put<SettingRow>(`/admin/settings/${encodeURIComponent(row.key)}`, {
        value,
        category: row.category,
        description: row.description,
      });
      setItems((current) => current.map((item) => (item.key === updated.key ? { ...item, ...updated } : item)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      setNotice(`${labelFor(row.key)} saved.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) return <LoadingBlock label="Loading settings…" />;

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Platform settings"
        description="Operational settings that change server behaviour immediately. Security-sensitive values are protected and may be environment-managed."
      />

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      <div className="mb-4">
        <Alert variant="info" title="Changes are audited">
          Every update is written to the audit log with the previous and new value. Session timeout, lockout policy,
          maintenance mode, upload rules and export formats take effect within seconds.
        </Alert>
      </div>

      <div className="space-y-5">
        {grouped.map(([category, list]) => (
          <SectionCard
            key={category}
            title={CATEGORY_LABELS[category] ?? category}
            description={`${list.length} setting${list.length === 1 ? "" : "s"}`}
          >
            <div className="space-y-4">
              {list.map((row) => {
                const lockedReason = LOCKED[row.key];
                const value = currentValue(row);
                const dirty = !sameValue(value, row.value);
                const busy = savingKey === row.key;
                const isMaintenance = row.key === "maintenance.mode";

                return (
                  <div key={row.key} className="rounded-lg border border-border p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                          {labelFor(row.key)}
                          {lockedReason ? <Lock className="size-3 text-muted-foreground" aria-hidden /> : null}
                          {isMaintenance && value === true ? (
                            <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                              <ShieldAlert className="size-3" aria-hidden />
                              Citizen services paused
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.key}</p>
                        {row.description ? (
                          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{row.description}</p>
                        ) : null}
                        {lockedReason ? (
                          <p className="mt-1 text-[11px] leading-relaxed text-warning">{lockedReason}</p>
                        ) : null}
                      </div>
                      {row.updatedAt ? (
                        <span className="shrink-0 text-[10.5px] text-muted-foreground">Updated {formatDateTime(row.updatedAt)}</span>
                      ) : null}
                    </div>

                    <div className="mt-3">
                      {isBoolean(row.value) ? (
                        <label className="flex items-center gap-2 text-[12px] text-foreground">
                          <input
                            type="checkbox"
                            checked={value === true}
                            disabled={Boolean(lockedReason)}
                            onChange={(event) => setDraft(row.key, event.target.checked)}
                            className="size-4 accent-[var(--primary)] disabled:opacity-50"
                          />
                          {value === true ? "Enabled" : "Disabled"}
                        </label>
                      ) : isNumber(row.value) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={String(value ?? "")}
                            disabled={Boolean(lockedReason)}
                            onChange={(event) => setDraft(row.key, event.target.value === "" ? 0 : Number(event.target.value))}
                            className="h-9 w-32 text-[12.5px]"
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {row.key === "security.sessionTimeoutMinutes"
                              ? "minutes"
                              : row.key === "files.maxUploadMb"
                                ? "MB"
                                : row.key.includes("Minutes")
                                  ? "minutes"
                                  : row.key.includes("Attempts")
                                    ? "attempts"
                                    : ""}
                          </span>
                        </div>
                      ) : row.key === "files.allowedMimeTypes" && isStringArray(row.value) ? (
                        <Textarea
                          rows={5}
                          value={(value as string[]).join("\n")}
                          onChange={(event) =>
                            setDraft(
                              row.key,
                              event.target.value
                                .split(/\r?\n/)
                                .map((entry) => entry.trim())
                                .filter(Boolean),
                            )
                          }
                          className="font-mono text-[11.5px]"
                        />
                      ) : row.key === "reports.exportFormats" && isStringArray(row.value) ? (
                        <div className="flex flex-wrap gap-3">
                          {["CSV", "XLSX", "PDF"].map((format) => {
                            const selected = (value as string[]).includes(format);
                            return (
                              <label key={format} className="flex items-center gap-1.5 text-[12px] text-foreground">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(event) => {
                                    const next = new Set(value as string[]);
                                    if (event.target.checked) next.add(format);
                                    else next.delete(format);
                                    setDraft(row.key, ["CSV", "XLSX", "PDF"].filter((entry) => next.has(entry)));
                                  }}
                                  className="size-3.5 accent-[var(--primary)]"
                                />
                                {format}
                              </label>
                            );
                          })}
                          {(value as string[]).length === 0 ? (
                            <span className="text-[11px] text-danger">At least one format must stay enabled.</span>
                          ) : null}
                        </div>
                      ) : isStringArray(row.value) ? (
                        <Input
                          value={(value as string[]).join(", ")}
                          disabled={Boolean(lockedReason)}
                          onChange={(event) =>
                            setDraft(
                              row.key,
                              event.target.value
                                .split(",")
                                .map((entry) => entry.trim())
                                .filter(Boolean),
                            )
                          }
                          className="h-9 text-[12.5px]"
                        />
                      ) : (
                        <Input
                          type={row.key.toLowerCase().includes("email") ? "email" : row.key.toLowerCase().includes("phone") ? "tel" : "text"}
                          value={String(value ?? "")}
                          disabled={Boolean(lockedReason)}
                          onChange={(event) => setDraft(row.key, event.target.value)}
                          className="h-9 text-[12.5px]"
                        />
                      )}
                    </div>

                    {!lockedReason ? (
                      <div className="mt-3 flex justify-end gap-2">
                        {dirty ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDrafts((current) => {
                                const next = { ...current };
                                delete next[row.key];
                                return next;
                              })
                            }
                            disabled={busy}
                          >
                            Reset
                          </Button>
                        ) : null}
                        <Button size="sm" onClick={() => void save(row)} disabled={!dirty || busy}>
                          <Save className="size-3.5" aria-hidden />
                          {busy ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
