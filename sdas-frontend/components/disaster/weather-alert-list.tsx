"use client";

import { CloudSun, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PageHeader,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta } from "@/lib/types";
import { formatDateTime, titleCase } from "@/lib/utils";
import type { WeatherAlertItem } from "./types";

const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((severity) => ({
  value: severity,
  label: titleCase(severity),
}));

const ACTIVE_OPTIONS = [
  { value: "true", label: "Active only" },
  { value: "false", label: "Inactive only" },
];

function toLocalDateTime(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function defaultValidity() {
  const from = new Date();
  const to = new Date();
  to.setHours(to.getHours() + 24);
  return { validFrom: toLocalDateTime(from), validTo: toLocalDateTime(to) };
}

export function WeatherAlertList() {
  const { permissions } = useAuth();
  const canManage = permissions.includes("weather.manage");

  const [items, setItems] = useState<WeatherAlertItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState("true");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    type: "",
    severity: "MEDIUM",
    area: "",
    advisory: "",
    status: "INFO",
    ...defaultValidity(),
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (active) params.set("active", active);
    if (severity) params.set("severity", severity);

    setLoading(true);
    setError("");
    api
      .list<WeatherAlertItem>(`/weather-alerts?${params.toString()}`, { signal: controller.signal })
      .then((result) => {
        setItems(result.items);
        setMeta(result.meta);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, active, severity, reloadKey]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (form.type.trim().length < 2) {
      setFormError("Enter the alert type.");
      return;
    }
    if (form.area.trim().length < 2) {
      setFormError("Enter the affected area.");
      return;
    }
    if (form.advisory.trim().length < 10) {
      setFormError("Write an advisory of at least 10 characters.");
      return;
    }
    if (!form.validFrom || !form.validTo) {
      setFormError("Choose the alert validity window.");
      return;
    }
    if (new Date(form.validTo) <= new Date(form.validFrom)) {
      setFormError("Valid-to must be after valid-from.");
      return;
    }
    setCreating(true);
    try {
      await api.post("/weather-alerts", {
        type: form.type.trim(),
        severity: form.severity,
        area: form.area.trim(),
        advisory: form.advisory.trim(),
        status: form.status,
        validFrom: new Date(form.validFrom).toISOString(),
        validTo: new Date(form.validTo).toISOString(),
        active: true,
      });
      setNotice("Weather alert issued.");
      setShowCreate(false);
      setForm({ type: "", severity: "MEDIUM", area: "", advisory: "", status: "INFO", ...defaultValidity() });
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(alert: WeatherAlertItem) {
    if (!window.confirm(`Deactivate the ${alert.type} alert for ${alert.area}?`)) return;
    setSaving(alert._id);
    setError("");
    try {
      await api.patch(`/weather-alerts/${alert._id}`, { active: false });
      setNotice("Alert deactivated.");
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(null);
    }
  }

  const visible = q.trim()
    ? items.filter((alert) =>
        [alert.type, alert.area, alert.advisory].join(" ").toLowerCase().includes(q.trim().toLowerCase()),
      )
    : items;

  return (
    <div>
      <PageHeader
        title="Weather alerts"
        description="District advisories for heavy rain, heat, storms and other weather risks affecting service delivery."
        eyebrow="Disaster management"
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setShowCreate((value) => !value)}>
              <Plus className="size-4" aria-hidden />
              Issue alert
            </Button>
          ) : null
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      ) : null}

      {showCreate ? (
        <form onSubmit={handleCreate} className="card-surface mb-5 space-y-4 p-5">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Issue a weather alert</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              District administrators and department heads are notified when an alert is issued.
            </p>
          </div>
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Alert type" htmlFor="alert-type" required>
              <Input
                id="alert-type"
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                placeholder="Heavy rainfall, heatwave, thunderstorm…"
                maxLength={120}
              />
            </Field>
            <Field label="Severity" htmlFor="alert-severity">
              <Select
                id="alert-severity"
                value={form.severity}
                onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Affected area" htmlFor="alert-area" required>
              <Input
                id="alert-area"
                value={form.area}
                onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                placeholder="Tehsil or district area"
                maxLength={300}
              />
            </Field>
            <Field label="Alert level" htmlFor="alert-status">
              <Select
                id="alert-status"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="INFO">Information</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </Field>
            <Field label="Valid from" htmlFor="alert-from" required>
              <Input
                id="alert-from"
                type="datetime-local"
                value={form.validFrom}
                onChange={(event) => setForm((current) => ({ ...current, validFrom: event.target.value }))}
              />
            </Field>
            <Field label="Valid to" htmlFor="alert-to" required>
              <Input
                id="alert-to"
                type="datetime-local"
                value={form.validTo}
                onChange={(event) => setForm((current) => ({ ...current, validTo: event.target.value }))}
              />
            </Field>
            <Field label="Advisory" htmlFor="alert-advisory" required className="sm:col-span-2">
              <Textarea
                id="alert-advisory"
                rows={3}
                value={form.advisory}
                onChange={(event) => setForm((current) => ({ ...current, advisory: event.target.value }))}
                placeholder="Precautionary instructions for citizens and departments."
                maxLength={3000}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Issuing…" : "Issue alert"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Search alerts or areas" className="w-full sm:w-72" />
        <FilterSelect
          label="Validity"
          value={active}
          placeholder="All alerts"
          options={ACTIVE_OPTIONS}
          onChange={(value) => {
            setActive(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Severity"
          value={severity}
          placeholder="All severities"
          options={SEVERITY_OPTIONS}
          onChange={(value) => {
            setSeverity(value);
            setPage(1);
          }}
        />
        {q || severity || active !== "true" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setSeverity("");
              setActive("true");
              setPage(1);
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading weather alerts…" />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No weather alerts"
            description="Active weather advisories for the district will appear here."
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Alert</Th>
                    <Th>Severity</Th>
                    <Th>Area</Th>
                    <Th>Validity</Th>
                    <Th>Level</Th>
                    <Th>Status</Th>
                    {canManage ? <Th>Action</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((alert) => {
                    const expired = new Date(alert.validTo).getTime() < Date.now();
                    return (
                      <tr key={alert._id}>
                        <Td>
                          <p className="font-semibold text-foreground">{alert.type}</p>
                          <p className="max-w-[280px] truncate text-[10.5px] text-muted-foreground">
                            {alert.advisory}
                          </p>
                        </Td>
                        <Td>
                          <Badge
                            variant={
                              alert.severity === "CRITICAL"
                                ? "danger"
                                : alert.severity === "HIGH"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {titleCase(alert.severity)}
                          </Badge>
                        </Td>
                        <Td>
                          <span className="text-[11.5px] text-muted-foreground">{alert.area}</span>
                        </Td>
                        <Td>
                          <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                            From {formatDateTime(alert.validFrom)}
                          </p>
                          <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                            To {formatDateTime(alert.validTo)}
                          </p>
                        </Td>
                        <Td>
                          <Badge variant={alert.status === "CRITICAL" ? "danger" : alert.status === "WARNING" ? "warning" : "info"}>
                            {titleCase(alert.status)}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge variant={!alert.active || expired ? "neutral" : "success"}>
                            {!alert.active ? "Inactive" : expired ? "Expired" : "Active"}
                          </Badge>
                        </Td>
                        {canManage ? (
                          <Td>
                            {alert.active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void deactivate(alert)}
                                disabled={saving === alert._id}
                              >
                                {saving === alert._id ? "…" : "Deactivate"}
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                                <CloudSun className="size-3.5" aria-hidden />
                                Closed
                              </span>
                            )}
                          </Td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <div className="mt-4">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
