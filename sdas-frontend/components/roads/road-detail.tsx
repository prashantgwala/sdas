"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Route, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ReferenceCatalogs } from "@/lib/types";
import { cn, formatDateTime, titleCase } from "@/lib/utils";
import type { RoadReportSummary } from "./types";

const REPAIR_STATUSES = ["INSPECTED", "APPROVED", "IN_PROGRESS", "REJECTED"];

export function RoadDetail({ id }: { id: string }) {
  const { permissions } = useAuth();
  const canInspect = permissions.includes("road.inspect");
  const canVerify = permissions.includes("road.verify");
  const canRepair = permissions.includes("road.repair.update");
  const canClose = permissions.includes("road.close");
  const canAiReview = permissions.includes("road.ai.review");

  const [report, setReport] = useState<RoadReportSummary | null>(null);
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const [inspectionForm, setInspectionForm] = useState({ status: "COMPLETED", findings: "", verified: false });
  const [verifyForm, setVerifyForm] = useState({ verified: "true", assignedDepartment: "", findings: "" });
  const [repairForm, setRepairForm] = useState({ text: "", status: "IN_PROGRESS" });
  const [closeForm, setCloseForm] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api
      .get<RoadReportSummary>(`/roads/${id}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setReport(data);
        setVerifyForm((current) => ({
          ...current,
          assignedDepartment:
            typeof data.assignedDepartment === "object" && data.assignedDepartment
              ? data.assignedDepartment._id ?? current.assignedDepartment
              : current.assignedDepartment,
        }));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  useEffect(() => {
    api.get<ReferenceCatalogs>("/reference/catalogs").then(setCatalogs).catch(() => undefined);
  }, []);

  function refresh(message: string) {
    setNotice(message);
    setReloadKey((value) => value + 1);
  }

  async function reviewAi(decision: "ACCEPTED" | "REJECTED") {
    setSaving(true);
    setError("");
    try {
      await api.post(`/roads/${id}/ai-review`, { decision });
      refresh(decision === "ACCEPTED" ? "AI suggestion accepted." : "AI suggestion rejected.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function submitInspection(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (inspectionForm.findings.trim().length < 5) {
      setError("Record inspection findings of at least 5 characters.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/roads/${id}/inspect`, {
        status: inspectionForm.status,
        findings: inspectionForm.findings.trim(),
        verified: inspectionForm.verified,
      });
      setInspectionForm({ status: "COMPLETED", findings: "", verified: false });
      refresh("Inspection findings recorded.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function submitVerify(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/roads/${id}/verify`, {
        verified: verifyForm.verified === "true",
        assignedDepartment: verifyForm.assignedDepartment || undefined,
        findings: verifyForm.findings.trim() || undefined,
      });
      refresh(verifyForm.verified === "true" ? "Road report verified for repair." : "Road report rejected.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function submitRepair(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (repairForm.text.trim().length < 5) {
      setError("Describe the repair progress in at least 5 characters.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/roads/${id}/repairs`, {
        text: repairForm.text.trim(),
        status: repairForm.status,
      });
      setRepairForm({ text: "", status: "IN_PROGRESS" });
      refresh("Repair progress updated.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function submitClose(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (closeForm.trim().length < 10) {
      setError("Provide a completion summary of at least 10 characters.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/roads/${id}/close`, { summary: closeForm.trim() });
      setCloseForm("");
      refresh("Road repair marked completed.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading road report" />;
  if (!report) {
    return (
      <div>
        <Link
          href="/roads"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to road reports
        </Link>
        <Alert variant="error">{error || "Road report not found."}</Alert>
      </div>
    );
  }

  const completed = report.repairStatus === "COMPLETED";
  const updates = report.repairUpdates ?? [];
  const aiSuggestion = report.aiSuggestion;
  const inspection = report.inspection;
  const assignedDepartment =
    report.assignedDepartment && typeof report.assignedDepartment === "object"
      ? report.assignedDepartment.name
      : null;

  return (
    <div>
      <PageHeader
        title={report.roadName}
        description={report.description}
        eyebrow={report.reportId ? `Road report · ${report.reportId}` : "Road damage report"}
        actions={
          <Link
            href="/roads"
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            All road reports
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
        <StatusBadge status={report.repairStatus} />
        <Badge variant="outline">{titleCase(report.damageCategory)}</Badge>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <Route className="size-3.5" aria-hidden />
          {report.location?.address ||
            (report.location?.tehsil && typeof report.location.tehsil === "object"
              ? report.location.tehsil.name
              : "Location not specified")}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          {assignedDepartment ? `Assigned to ${assignedDepartment}` : "Department not assigned"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <SectionCard
            title="Repair progress"
            description="Inspection, verification and repair updates are recorded in order."
          >
            {updates.length === 0 ? (
              <EmptyState title="No progress recorded" description="Inspection and repair updates will appear here." />
            ) : (
              <ol className="space-y-3">
                {updates.map((update, index) => (
                  <li key={index} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1 grid size-6 shrink-0 place-items-center rounded-full text-white",
                        update.status === "COMPLETED"
                          ? "bg-success"
                          : update.status === "REJECTED"
                            ? "bg-danger"
                            : "bg-info",
                      )}
                    >
                      {update.status === "COMPLETED" ? (
                        <CheckCircle2 className="size-3.5" aria-hidden />
                      ) : update.status === "REJECTED" ? (
                        <XCircle className="size-3.5" aria-hidden />
                      ) : (
                        <Wrench className="size-3" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={update.status} />
                        {update.at ? (
                          <span className="text-[10.5px] text-muted-foreground">{formatDateTime(update.at)}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-foreground">{update.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          {canRepair && !completed ? (
            <SectionCard title="Record repair progress" description="Keep the citizen and district office updated.">
              <form onSubmit={submitRepair} className="space-y-3">
                <Field label="Progress note" htmlFor="repair-text" required>
                  <Textarea
                    id="repair-text"
                    rows={3}
                    value={repairForm.text}
                    onChange={(event) => setRepairForm((current) => ({ ...current, text: event.target.value }))}
                    placeholder="Work started, material used, expected completion…"
                    maxLength={3000}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Field label="Status" htmlFor="repair-status" className="flex-1">
                    <Select
                      id="repair-status"
                      value={repairForm.status}
                      onChange={(event) => setRepairForm((current) => ({ ...current, status: event.target.value }))}
                    >
                      {REPAIR_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {titleCase(status)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" size="sm" disabled={saving}>
                    <Wrench className="size-3.5" aria-hidden />
                    Add update
                  </Button>
                </div>
              </form>
            </SectionCard>
          ) : null}

          {canClose && !completed ? (
            <SectionCard title="Complete repair" description="Record final completion and evidence references.">
              <form onSubmit={submitClose} className="space-y-3">
                <Field label="Completion summary" htmlFor="road-close" required>
                  <Textarea
                    id="road-close"
                    rows={3}
                    value={closeForm}
                    onChange={(event) => setCloseForm(event.target.value)}
                    placeholder="Work completed, quality check result and completion date."
                    maxLength={3000}
                  />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit" variant="success" size="sm" disabled={saving}>
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Mark completed
                  </Button>
                </div>
              </form>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-4">
          <SectionCard
            title="AI damage suggestion"
            description="Machine suggestions are advisory and require human review."
            action={
              aiSuggestion?.status ? (
                <Badge
                  variant={
                    aiSuggestion.status === "ACCEPTED"
                      ? "success"
                      : aiSuggestion.status === "REJECTED"
                        ? "danger"
                        : "warning"
                  }
                >
                  {titleCase(aiSuggestion.status)}
                </Badge>
              ) : null
            }
          >
            {aiSuggestion?.category ? (
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-foreground">
                  {titleCase(aiSuggestion.category)}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    {Math.round((aiSuggestion.confidence ?? 0) * 100)}% confidence
                  </span>
                </p>
                <p className="text-[11.5px] text-muted-foreground">{aiSuggestion.rationale}</p>
                {canAiReview && aiSuggestion.status === "SUGGESTED" ? (
                  <div className="flex gap-2 pt-1">
                    <Button variant="success" size="sm" onClick={() => void reviewAi("ACCEPTED")} disabled={saving}>
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      Accept
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => void reviewAi("REJECTED")} disabled={saving}>
                      <XCircle className="size-3.5" aria-hidden />
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[11.5px] text-muted-foreground">No AI suggestion is available.</p>
            )}
          </SectionCard>

          <SectionCard title="Inspection" description={inspection?.inspectedAt ? `Completed ${formatDateTime(inspection.inspectedAt)}` : undefined}>
            {inspection?.findings ? (
              <div className="mb-3 space-y-1">
                <StatusBadge status={inspection.status} />
                <p className="text-[12px] text-foreground">{inspection.findings}</p>
                <p className="text-[10.5px] text-muted-foreground">
                  Officer: {inspection.officer?.name ?? "—"}
                </p>
              </div>
            ) : (
              <p className="mb-3 text-[11.5px] text-muted-foreground">No inspection has been recorded.</p>
            )}
            {canInspect && !completed ? (
              <form onSubmit={submitInspection} className="space-y-2.5 border-t border-border pt-3">
                <Field label="Findings" htmlFor="inspect-findings" required>
                  <Textarea
                    id="inspect-findings"
                    rows={3}
                    value={inspectionForm.findings}
                    onChange={(event) =>
                      setInspectionForm((current) => ({ ...current, findings: event.target.value }))
                    }
                    placeholder="Site inspection observations and recommended action."
                    maxLength={3000}
                  />
                </Field>
                <div className="flex items-center justify-between gap-2">
                  <Select
                    aria-label="Inspection status"
                    value={inspectionForm.status}
                    onChange={(event) =>
                      setInspectionForm((current) => ({ ...current, status: event.target.value }))
                    }
                    className="h-9 flex-1 text-[12px]"
                  >
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="COMPLETED">Completed</option>
                  </Select>
                  <Button type="submit" size="sm" disabled={saving}>
                    <ClipboardCheck className="size-3.5" aria-hidden />
                    Save
                  </Button>
                </div>
              </form>
            ) : null}
          </SectionCard>

          {canVerify && !completed ? (
            <SectionCard title="Verification" description="Approve repair or reject the report with findings.">
              <form onSubmit={submitVerify} className="space-y-2.5">
                <Field label="Decision" htmlFor="verify-decision">
                  <Select
                    id="verify-decision"
                    value={verifyForm.verified}
                    onChange={(event) => setVerifyForm((current) => ({ ...current, verified: event.target.value }))}
                  >
                    <option value="true">Verify and approve</option>
                    <option value="false">Reject report</option>
                  </Select>
                </Field>
                <Field label="Assign repair to department" htmlFor="verify-department">
                  <Select
                    id="verify-department"
                    value={verifyForm.assignedDepartment}
                    onChange={(event) =>
                      setVerifyForm((current) => ({ ...current, assignedDepartment: event.target.value }))
                    }
                  >
                    <option value="">Keep current department</option>
                    {(catalogs?.departments ?? []).map((department) => (
                      <option key={department._id} value={department._id}>
                        {department.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Findings" htmlFor="verify-findings">
                  <Textarea
                    id="verify-findings"
                    rows={2}
                    value={verifyForm.findings}
                    onChange={(event) => setVerifyForm((current) => ({ ...current, findings: event.target.value }))}
                    placeholder="Optional verification notes."
                    maxLength={3000}
                  />
                </Field>
                <Button type="submit" size="sm" className="w-full" disabled={saving}>
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Submit decision
                </Button>
              </form>
            </SectionCard>
          ) : null}

          {completed && report.closedAt ? (
            <SectionCard title="Completed" description={formatDateTime(report.closedAt)}>
              <p className="text-[12px] text-muted-foreground">
                Repair has been completed and the report is closed. Citizens receive a notification with the
                completion update.
              </p>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
