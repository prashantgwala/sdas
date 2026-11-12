"use client";

import Link from "next/link";
import { ArrowLeft, Boxes, ClipboardList, MapPin, Plus, ShieldAlert, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { EmptyState, PageHeader, SectionCard, StatusBadge, Table, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/utils";
import type { IncidentSummary } from "./types";

const STATUSES = ["REPORTED", "ACTIVE", "CONTAINED"];

export function IncidentDetail({ id }: { id: string }) {
  const { permissions } = useAuth();
  const canUpdate = permissions.includes("incident.update");
  const canResources = permissions.includes("incident.resources");
  const canClose = permissions.includes("incident.close");

  const [incident, setIncident] = useState<IncidentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [actionForm, setActionForm] = useState({ text: "", status: "" });
  const [actionSaving, setActionSaving] = useState(false);

  const [showResources, setShowResources] = useState(false);
  const [resourceForm, setResourceForm] = useState({
    name: "",
    category: "",
    quantity: "",
    unit: "",
    available: "",
    location: "",
  });
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceError, setResourceError] = useState("");

  const [showTeam, setShowTeam] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: "",
    contactPerson: "",
    contactPhone: "",
    members: "",
    status: "STANDBY",
  });
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamError, setTeamError] = useState("");

  const [showClose, setShowClose] = useState(false);
  const [closureReport, setClosureReport] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api
      .get<IncidentSummary>(`/incidents/${id}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setIncident(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  function refresh(message: string) {
    setNotice(message);
    setReloadKey((value) => value + 1);
  }

  async function addAction(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (actionForm.text.trim().length < 5) {
      setError("Describe the response action in at least 5 characters.");
      return;
    }
    setActionSaving(true);
    try {
      await api.post(`/incidents/${id}/actions`, {
        text: actionForm.text.trim(),
        status: actionForm.status || undefined,
      });
      setActionForm({ text: "", status: "" });
      refresh("Response action recorded.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setActionSaving(false);
    }
  }

  async function saveResource(event: FormEvent) {
    event.preventDefault();
    setResourceError("");
    if (resourceForm.name.trim().length < 2) {
      setResourceError("Enter a resource name.");
      return;
    }
    setResourceSaving(true);
    try {
      await api.post(`/incidents/${id}/resources`, {
        resources: [
          {
            name: resourceForm.name.trim(),
            category: resourceForm.category.trim() || undefined,
            quantity: Number(resourceForm.quantity) || 0,
            unit: resourceForm.unit.trim() || undefined,
            available: Number(resourceForm.available) || 0,
            location: resourceForm.location.trim() || undefined,
          },
        ],
      });
      setResourceForm({ name: "", category: "", quantity: "", unit: "", available: "", location: "" });
      setShowResources(false);
      refresh("Resource availability updated.");
    } catch (cause) {
      setResourceError(errorMessage(cause));
    } finally {
      setResourceSaving(false);
    }
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    setTeamError("");
    if (teamForm.name.trim().length < 2) {
      setTeamError("Enter the team name.");
      return;
    }
    setTeamSaving(true);
    try {
      await api.post(`/incidents/${id}/teams`, {
        name: teamForm.name.trim(),
        contactPerson: teamForm.contactPerson.trim() || undefined,
        contactPhone: teamForm.contactPhone.trim() || undefined,
        members: Number(teamForm.members) || 0,
        status: teamForm.status,
      });
      setTeamForm({ name: "", contactPerson: "", contactPhone: "", members: "", status: "STANDBY" });
      setShowTeam(false);
      refresh("Response team assigned.");
    } catch (cause) {
      setTeamError(errorMessage(cause));
    } finally {
      setTeamSaving(false);
    }
  }

  async function closeIncident(event: FormEvent) {
    event.preventDefault();
    setCloseError("");
    if (closureReport.trim().length < 20) {
      setCloseError("Provide a closure report of at least 20 characters.");
      return;
    }
    setClosing(true);
    try {
      await api.post(`/incidents/${id}/close`, { closureReport: closureReport.trim() });
      setShowClose(false);
      setClosureReport("");
      refresh("Incident closed with a closure report.");
    } catch (cause) {
      setCloseError(errorMessage(cause));
    } finally {
      setClosing(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading incident" />;
  if (!incident) {
    return (
      <div>
        <Link
          href="/incidents"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to incidents
        </Link>
        <Alert variant="error">{error || "Incident not found."}</Alert>
      </div>
    );
  }

  const closed = incident.status === "CLOSED";
  const resources = incident.resources ?? [];
  const teams = incident.assignedTeams ?? [];
  const actions = incident.actions ?? [];
  const locationLabel =
    incident.location?.address ||
    (incident.location?.tehsil && typeof incident.location.tehsil === "object"
      ? incident.location.tehsil.name
      : "—");

  return (
    <div>
      <PageHeader
        title={incident.title}
        description={incident.description}
        eyebrow={incident.incidentId ? `Incident · ${incident.incidentId}` : "Incident"}
        actions={
          <Link
            href="/incidents"
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            All incidents
          </Link>
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={incident.status} />
        <Badge
          variant={
            incident.severity === "CRITICAL" ? "danger" : incident.severity === "HIGH" ? "warning" : "neutral"
          }
        >
          {titleCase(incident.severity)} severity
        </Badge>
        <Badge variant="outline">{incident.type}</Badge>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden />
          {locationLabel}
        </span>
        {incident.reportedAt ? (
          <span className="text-[11.5px] text-muted-foreground">Reported {formatDateTime(incident.reportedAt)}</span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <SectionCard title="Response actions" description="Chronological record of incident response.">
            {actions.length === 0 ? (
              <EmptyState title="No actions recorded" description="Response actions will appear here." />
            ) : (
              <ol className="space-y-3">
                {actions.map((action, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 border-b border-border pb-3 last:border-0 last:pb-0">
                      <p className="whitespace-pre-wrap text-[12.5px] text-foreground">{action.text}</p>
                      <p className="mt-1 text-[10.5px] text-muted-foreground">
                        {action.at ? formatDateTime(action.at) : ""}
                        {action.actor?.name ? ` · ${action.actor.name}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {canUpdate && !closed ? (
              <form onSubmit={addAction} className="mt-4 space-y-3 border-t border-border pt-4">
                <Field label="Record a response action" htmlFor="incident-action" required>
                  <Textarea
                    id="incident-action"
                    rows={2}
                    value={actionForm.text}
                    onChange={(event) => setActionForm((current) => ({ ...current, text: event.target.value }))}
                    placeholder="Teams deployed, relief material dispatched, situation update…"
                    maxLength={3000}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Field label="Update status" htmlFor="incident-action-status" className="flex-1">
                    <Select
                      id="incident-action-status"
                      value={actionForm.status}
                      onChange={(event) => setActionForm((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="">Keep current status</option>
                      {STATUSES.filter((status) => status !== incident.status).map((status) => (
                        <option key={status} value={status}>
                          {titleCase(status)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" size="sm" disabled={actionSaving}>
                    <Plus className="size-3.5" aria-hidden />
                    {actionSaving ? "Saving…" : "Add action"}
                  </Button>
                </div>
              </form>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Resources"
            description="Available relief material and equipment."
            action={
              canResources ? (
                <Button variant="secondary" size="sm" onClick={() => setShowResources((value) => !value)}>
                  <Boxes className="size-3.5" aria-hidden />
                  Update stock
                </Button>
              ) : null
            }
            contentClassName={resources.length === 0 ? "p-5" : "p-0"}
          >
            {showResources ? (
              <form onSubmit={saveResource} className="space-y-3 border-b border-border p-4 sm:p-5">
                {resourceError ? <Alert variant="error">{resourceError}</Alert> : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Resource" htmlFor="resource-name" required>
                    <Input
                      id="resource-name"
                      value={resourceForm.name}
                      onChange={(event) => setResourceForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Tarpaulin"
                    />
                  </Field>
                  <Field label="Category" htmlFor="resource-category">
                    <Input
                      id="resource-category"
                      value={resourceForm.category}
                      onChange={(event) => setResourceForm((current) => ({ ...current, category: event.target.value }))}
                      placeholder="Shelter"
                    />
                  </Field>
                  <Field label="Unit" htmlFor="resource-unit">
                    <Input
                      id="resource-unit"
                      value={resourceForm.unit}
                      onChange={(event) => setResourceForm((current) => ({ ...current, unit: event.target.value }))}
                      placeholder="pieces"
                    />
                  </Field>
                  <Field label="Quantity" htmlFor="resource-quantity">
                    <Input
                      id="resource-quantity"
                      type="number"
                      min={0}
                      value={resourceForm.quantity}
                      onChange={(event) => setResourceForm((current) => ({ ...current, quantity: event.target.value }))}
                    />
                  </Field>
                  <Field label="Available" htmlFor="resource-available">
                    <Input
                      id="resource-available"
                      type="number"
                      min={0}
                      value={resourceForm.available}
                      onChange={(event) => setResourceForm((current) => ({ ...current, available: event.target.value }))}
                    />
                  </Field>
                  <Field label="Location" htmlFor="resource-location">
                    <Input
                      id="resource-location"
                      value={resourceForm.location}
                      onChange={(event) => setResourceForm((current) => ({ ...current, location: event.target.value }))}
                      placeholder="Store / depot"
                    />
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowResources(false)} disabled={resourceSaving}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={resourceSaving}>
                    {resourceSaving ? "Saving…" : "Save resource"}
                  </Button>
                </div>
              </form>
            ) : null}
            {resources.length === 0 ? (
              <EmptyState title="No resources recorded" description="Add relief material and equipment stock." />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Resource</Th>
                      <Th>Category</Th>
                      <Th>Available</Th>
                      <Th>Location</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((resource, index) => (
                      <tr key={`${resource.name}-${index}`}>
                        <Td>
                          <p className="font-semibold text-foreground">{resource.name}</p>
                          {resource.unit ? <p className="text-[10.5px] text-muted-foreground">Unit: {resource.unit}</p> : null}
                        </Td>
                        <Td>
                          <span className="text-[11.5px] text-muted-foreground">{resource.category || "—"}</span>
                        </Td>
                        <Td>
                          <span className="text-[11.5px] text-foreground">
                            {resource.available ?? 0}
                            {resource.quantity ? ` / ${resource.quantity}` : ""}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-[11.5px] text-muted-foreground">{resource.location || "—"}</span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Response teams"
            action={
              canResources && !closed ? (
                <Button variant="ghost" size="sm" onClick={() => setShowTeam((value) => !value)}>
                  <Users className="size-3.5" aria-hidden />
                  Add team
                </Button>
              ) : null
            }
          >
            {showTeam ? (
              <form onSubmit={saveTeam} className="mb-3 space-y-2.5 rounded-lg border border-border p-3">
                {teamError ? <Alert variant="error">{teamError}</Alert> : null}
                <Field label="Team name" htmlFor="team-name" required>
                  <Input
                    id="team-name"
                    value={teamForm.name}
                    onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="NDRF unit 2"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Contact person" htmlFor="team-contact">
                    <Input
                      id="team-contact"
                      value={teamForm.contactPerson}
                      onChange={(event) => setTeamForm((current) => ({ ...current, contactPerson: event.target.value }))}
                    />
                  </Field>
                  <Field label="Phone" htmlFor="team-phone">
                    <Input
                      id="team-phone"
                      value={teamForm.contactPhone}
                      onChange={(event) => setTeamForm((current) => ({ ...current, contactPhone: event.target.value }))}
                    />
                  </Field>
                  <Field label="Members" htmlFor="team-members">
                    <Input
                      id="team-members"
                      type="number"
                      min={0}
                      value={teamForm.members}
                      onChange={(event) => setTeamForm((current) => ({ ...current, members: event.target.value }))}
                    />
                  </Field>
                  <Field label="Status" htmlFor="team-status">
                    <Select
                      id="team-status"
                      value={teamForm.status}
                      onChange={(event) => setTeamForm((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="STANDBY">Standby</option>
                      <option value="DEPLOYED">Deployed</option>
                      <option value="RETURNED">Returned</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowTeam(false)} disabled={teamSaving}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={teamSaving}>
                    {teamSaving ? "Saving…" : "Assign team"}
                  </Button>
                </div>
              </form>
            ) : null}
            {teams.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">No response teams assigned.</p>
            ) : (
              <ul className="space-y-2">
                {teams.map((team, index) => (
                  <li key={`${team.name}-${index}`} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12.5px] font-semibold text-foreground">{team.name}</p>
                      <Badge variant={team.status === "DEPLOYED" ? "success" : "neutral"}>
                        {titleCase(team.status ?? "STANDBY")}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                      {team.members ?? 0} members
                      {team.contactPerson ? ` · ${team.contactPerson}` : ""}
                      {team.contactPhone ? ` · ${team.contactPhone}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Command & details">
            <dl className="space-y-2.5 text-[12px]">
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Incident commander
                </dt>
                <dd className="mt-0.5 text-foreground">{incident.commander?.name ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Reported by
                </dt>
                <dd className="mt-0.5 text-foreground">{incident.reportedBy?.name ?? "—"}</dd>
              </div>
              {incident.weatherAlert ? (
                <div>
                  <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Linked weather alert
                  </dt>
                  <dd className="mt-0.5 text-foreground">
                    {incident.weatherAlert.severity} {incident.weatherAlert.type} · {incident.weatherAlert.area}
                  </dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>

          {closed ? (
            <SectionCard title="Closure report" description={incident.closedAt ? `Closed ${formatDateTime(incident.closedAt)}` : undefined}>
              <p className="whitespace-pre-wrap text-[12.5px] text-foreground">
                {incident.closureReport || "No closure report recorded."}
              </p>
            </SectionCard>
          ) : canClose ? (
            <SectionCard title="Close incident" description="Close only after response and recovery are complete.">
              {showClose ? (
                <form onSubmit={closeIncident} className="space-y-2.5">
                  {closeError ? <Alert variant="error">{closeError}</Alert> : null}
                  <Field label="Closure report" htmlFor="closure-report" required>
                    <Textarea
                      id="closure-report"
                      rows={4}
                      value={closureReport}
                      onChange={(event) => setClosureReport(event.target.value)}
                      placeholder="Final situation, losses, relief provided and lessons for the district."
                      maxLength={5000}
                    />
                  </Field>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowClose(false)} disabled={closing}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="danger" size="sm" disabled={closing}>
                      {closing ? "Closing…" : "Close incident"}
                    </Button>
                  </div>
                </form>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setShowClose(true)}>
                  <ClipboardList className="size-3.5" aria-hidden />
                  Prepare closure
                </Button>
              )}
            </SectionCard>
          ) : null}

          <p className="flex items-start gap-1.5 text-[10.5px] text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            This record supports coordination. Life-threatening emergencies must be handled through official
            emergency channels.
          </p>
        </div>
      </div>
    </div>
  );
}
