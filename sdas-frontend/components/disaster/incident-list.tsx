"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, MapPin, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
  Table,
  TableLink,
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
import type { ApiMeta, ReferenceCatalogs } from "@/lib/types";
import { formatDateTime, titleCase } from "@/lib/utils";
import type { IncidentSummary } from "./types";

interface OfficerOption {
  id: string;
  name: string;
  designation?: string | null;
}

const STATUS_OPTIONS = ["REPORTED", "ACTIVE", "CONTAINED", "CLOSED"].map((status) => ({
  value: status,
  label: titleCase(status),
}));

const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((severity) => ({
  value: severity,
  label: titleCase(severity),
}));

export function IncidentList() {
  const router = useRouter();
  const { permissions } = useAuth();
  const canCreate = permissions.includes("incident.create");
  const canListOfficers = permissions.includes("incident.resources");

  const [items, setItems] = useState<IncidentSummary[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    type: "",
    title: "",
    description: "",
    severity: "MEDIUM",
    address: "",
    tehsil: "",
    commander: "",
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQ(q);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    api.get<ReferenceCatalogs>("/reference/catalogs").then(setCatalogs).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!showCreate || !canListOfficers) return;
    api
      .get<OfficerOption[]>("/reference/officers")
      .then(setOfficers)
      .catch(() => setOfficers([]));
  }, [showCreate, canListOfficers]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (appliedQ) params.set("q", appliedQ);
    if (status) params.set("status", status);
    if (severity) params.set("severity", severity);

    setLoading(true);
    setError("");
    api
      .list<IncidentSummary>(`/incidents?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, status, severity, reloadKey]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (form.type.trim().length < 2) {
      setFormError("Enter the incident type.");
      return;
    }
    if (form.title.trim().length < 5) {
      setFormError("Enter an incident title of at least 5 characters.");
      return;
    }
    if (form.description.trim().length < 20) {
      setFormError("Describe the incident in at least 20 characters.");
      return;
    }
    setCreating(true);
    try {
      const result = await api.post<IncidentSummary>("/incidents", {
        type: form.type.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        severity: form.severity,
        location: {
          address: form.address.trim() || undefined,
          tehsil: form.tehsil || undefined,
        },
        commander: form.commander || undefined,
      });
      router.push(`/incidents/${result._id}`);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  const hasFilters = Boolean(appliedQ || status || severity);

  function resetFilters() {
    setQ("");
    setAppliedQ("");
    setStatus("");
    setSeverity("");
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Incidents"
        description="Disaster and emergency incidents with severity, command, resources and response actions."
        eyebrow="Disaster management"
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setShowCreate((value) => !value)}>
              <Plus className="size-4" aria-hidden />
              Report incident
            </Button>
          ) : null
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      {showCreate ? (
        <form onSubmit={handleCreate} className="card-surface mb-5 space-y-4 p-5">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Report an incident</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              District and department heads are notified immediately, with escalation for critical incidents.
            </p>
          </div>
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Incident type" htmlFor="incident-type" required>
              <Input
                id="incident-type"
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                placeholder="Flood, fire, landslide, heatwave…"
                maxLength={120}
              />
            </Field>
            <Field label="Severity" htmlFor="incident-severity">
              <Select
                id="incident-severity"
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
            <Field label="Title" htmlFor="incident-title" required className="sm:col-span-2">
              <Input
                id="incident-title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Short incident headline"
                maxLength={250}
              />
            </Field>
            <Field label="Description" htmlFor="incident-description" required className="sm:col-span-2">
              <Textarea
                id="incident-description"
                rows={3}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="What happened, affected area and immediate response required."
                maxLength={5000}
              />
            </Field>
            <Field label="Location" htmlFor="incident-address">
              <Input
                id="incident-address"
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="Village, road or landmark"
                maxLength={500}
              />
            </Field>
            <Field label="Tehsil" htmlFor="incident-tehsil">
              <Select
                id="incident-tehsil"
                value={form.tehsil}
                onChange={(event) => setForm((current) => ({ ...current, tehsil: event.target.value }))}
              >
                <option value="">Not specified</option>
                {(catalogs?.administrativeUnits ?? []).map((unit) => (
                  <option key={unit._id} value={unit._id}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </Field>
            {canListOfficers ? (
              <Field label="Incident commander" htmlFor="incident-commander" className="sm:col-span-2">
                <Select
                  id="incident-commander"
                  value={form.commander}
                  onChange={(event) => setForm((current) => ({ ...current, commander: event.target.value }))}
                >
                  <option value="">Assign later</option>
                  {officers.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.name}
                      {officer.designation ? ` · ${officer.designation}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Reporting…" : "Report incident"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search incident ID, type or title"
          className="w-full sm:w-72"
        />
        <FilterSelect
          label="Status"
          value={status}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value);
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
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <ShieldAlert className="size-3.5" aria-hidden />
          Informational record · not an emergency dispatch service
        </span>
      </div>

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading incidents…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No incidents match these filters" : "No incidents reported"}
            description={
              hasFilters
                ? "Clear the filters or search with a different keyword."
                : "Reported incidents and their response status will appear here."
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Incident</Th>
                    <Th>Severity</Th>
                    <Th>Location</Th>
                    <Th>Commander</Th>
                    <Th>Reported</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((incident) => (
                    <tr key={incident._id}>
                      <Td>
                        <TableLink href={`/incidents/${incident._id}`}>{incident.title}</TableLink>
                        <p className="text-[10.5px] text-muted-foreground">
                          {incident.incidentId ? <span className="font-mono">{incident.incidentId} · </span> : null}
                          {incident.type}
                        </p>
                      </Td>
                      <Td>
                        <Badge
                          variant={
                            incident.severity === "CRITICAL"
                              ? "danger"
                              : incident.severity === "HIGH"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {incident.severity === "CRITICAL" ? (
                            <AlertTriangle className="size-3" aria-hidden />
                          ) : null}
                          {titleCase(incident.severity)}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="inline-flex items-start gap-1 text-[11.5px] text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {incident.location?.address ||
                            (incident.location?.tehsil && typeof incident.location.tehsil === "object"
                              ? incident.location.tehsil.name
                              : "—")}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[11.5px] text-muted-foreground">
                          {incident.commander?.name ?? "Unassigned"}
                        </span>
                      </Td>
                      <Td>
                        <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                          {incident.reportedAt ? formatDateTime(incident.reportedAt) : "—"}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={incident.status} />
                      </Td>
                    </tr>
                  ))}
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
