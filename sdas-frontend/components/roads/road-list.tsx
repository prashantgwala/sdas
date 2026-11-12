"use client";

import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Route } from "lucide-react";
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
import { cn, formatDate, titleCase } from "@/lib/utils";
import type { RoadReportSummary } from "./types";

const STATUS_OPTIONS = ["REPORTED", "INSPECTED", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED"].map(
  (status) => ({ value: status, label: titleCase(status) }),
);

export const DAMAGE_CATEGORIES = [
  "POTHOLE",
  "CRACKED_SURFACE",
  "WATERLOGGING",
  "BROKEN_DIVIDER",
  "BROKEN_STREETLIGHT",
  "DAMAGED_BRIDGE",
  "SUBSIDENCE",
  "GENERAL_ROAD_DAMAGE",
].map((category) => ({ value: category, label: titleCase(category) }));

export function RoadList() {
  const router = useRouter();
  const { permissions } = useAuth();
  const canCreate = permissions.includes("road.create");
  const canFilterMine = permissions.includes("road.create") && !permissions.includes("road.verify");

  const [items, setItems] = useState<RoadReportSummary[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);

  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    roadName: "",
    damageCategory: "POTHOLE",
    description: "",
    address: "",
    tehsil: "",
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
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (appliedQ) params.set("q", appliedQ);
    if (status) params.set("repairStatus", status);
    if (category) params.set("damageCategory", category);
    if (mine) params.set("mine", "true");

    setLoading(true);
    setError("");
    api
      .list<RoadReportSummary>(`/roads?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, status, category, mine]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (form.roadName.trim().length < 2) {
      setFormError("Enter the road name or stretch.");
      return;
    }
    if (form.description.trim().length < 20) {
      setFormError("Describe the damage in at least 20 characters.");
      return;
    }
    setCreating(true);
    try {
      const result = await api.post<RoadReportSummary>("/roads", {
        roadName: form.roadName.trim(),
        damageCategory: form.damageCategory,
        description: form.description.trim(),
        location: {
          address: form.address.trim() || undefined,
          tehsil: form.tehsil || undefined,
        },
      });
      router.push(`/roads/${result._id}`);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  const hasFilters = Boolean(appliedQ || status || category || mine);

  return (
    <div>
      <PageHeader
        title="Road damage reports"
        description="Report, inspect, verify and track repair of road damage across the district."
        eyebrow="Infrastructure monitoring"
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setShowCreate((value) => !value)}>
              <Plus className="size-4" aria-hidden />
              Report road damage
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
            <h2 className="text-[14px] font-semibold text-foreground">Report road damage</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              An initial damage category is suggested automatically and must be reviewed by an officer.
            </p>
          </div>
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Road name / stretch" htmlFor="road-name" required>
              <Input
                id="road-name"
                value={form.roadName}
                onChange={(event) => setForm((current) => ({ ...current, roadName: event.target.value }))}
                placeholder="Main market road near bus stand"
                maxLength={250}
              />
            </Field>
            <Field label="Damage type" htmlFor="road-category" required>
              <Select
                id="road-category"
                value={form.damageCategory}
                onChange={(event) => setForm((current) => ({ ...current, damageCategory: event.target.value }))}
              >
                {DAMAGE_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" htmlFor="road-description" required className="sm:col-span-2">
              <Textarea
                id="road-description"
                rows={3}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Describe the damage, size, risk to commuters and how long it has existed."
                maxLength={5000}
              />
            </Field>
            <Field label="Location" htmlFor="road-address">
              <Input
                id="road-address"
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="Landmark, ward or village"
                maxLength={500}
              />
            </Field>
            <Field label="Tehsil" htmlFor="road-tehsil">
              <Select
                id="road-tehsil"
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
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Submitting…" : "Submit report"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Search road or report ID" className="w-full sm:w-72" />
        <FilterSelect
          label="Repair status"
          value={status}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Damage type"
          value={category}
          placeholder="All damage types"
          options={DAMAGE_CATEGORIES}
          onChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
        />
        {canFilterMine ? (
          <button
            type="button"
            onClick={() => {
              setMine((value) => !value);
              setPage(1);
            }}
            aria-pressed={mine}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
              mine
                ? "border-primary/35 bg-primary-soft text-primary"
                : "border-input bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            <Route className="size-3.5" aria-hidden />
            My reports
          </button>
        ) : null}
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setAppliedQ("");
              setStatus("");
              setCategory("");
              setMine(false);
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
          <LoadingBlock label="Loading road reports…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No reports match these filters" : "No road damage reports"}
            description={
              hasFilters
                ? "Clear the filters or search with a different keyword."
                : canCreate
                  ? "Report road damage to start the inspection and repair workflow."
                  : "Reports assigned to your department will appear here."
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Report</Th>
                    <Th>Damage</Th>
                    <Th>Location</Th>
                    <Th>Department</Th>
                    <Th>AI suggestion</Th>
                    <Th>Reported</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((report) => (
                    <tr key={report._id}>
                      <Td>
                        <TableLink href={`/roads/${report._id}`}>{report.roadName}</TableLink>
                        {report.reportId ? (
                          <p className="font-mono text-[10px] text-muted-foreground">{report.reportId}</p>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge variant="outline">{titleCase(report.damageCategory)}</Badge>
                      </Td>
                      <Td>
                        <span className="text-[11.5px] text-muted-foreground">
                          {report.location?.address ||
                            (report.location?.tehsil && typeof report.location.tehsil === "object"
                              ? report.location.tehsil.name
                              : "—")}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[11.5px] text-muted-foreground">
                          {report.assignedDepartment && typeof report.assignedDepartment === "object"
                            ? report.assignedDepartment.name
                            : "Unassigned"}
                        </span>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                          {report.aiSuggestion?.category
                            ? `${titleCase(report.aiSuggestion.category)} · ${Math.round((report.aiSuggestion.confidence ?? 0) * 100)}%`
                            : "—"}
                        </span>
                      </Td>
                      <Td>
                        <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                          {report.createdAt ? formatDate(report.createdAt) : "—"}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={report.repairStatus} />
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
