"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import type { OfficerOption, ReferenceCatalogs } from "@/lib/types";
import { PRIORITIES, toOptions } from "@/lib/workflow";
import type { GrievanceDetailData } from "./types";

const TERMINAL = ["RESOLVED", "CLOSED", "REJECTED"];

type ActionKey =
  | "verify"
  | "classify"
  | "route"
  | "assign"
  | "acknowledge"
  | "action"
  | "resolution"
  | "decision"
  | "close"
  | "reopen-request"
  | "reopen-review"
  | "escalate";

interface ActionDef {
  key: ActionKey;
  label: string;
  blurb: string;
}

export function GrievanceWorkflow({
  grievance,
  onUpdated,
}: {
  grievance: GrievanceDetailData;
  onUpdated: () => void;
}) {
  const { user, permissions } = useAuth();
  const role = user?.role;
  const can = (...codes: string[]) => codes.some((code) => permissions.includes(code));
  const terminal = TERMINAL.includes(grievance.status);
  const assignedToMe =
    Boolean(user?.id) && String(grievance.assignedOfficer?._id ?? "") === user?.id;
  const supervisor = role === "DEPARTMENT_HEAD" || role === "DISTRICT_ADMIN" || role === "SUPER_ADMIN";

  const actions = useMemo<ActionDef[]>(() => {
    const list: ActionDef[] = [];
    const status = grievance.status;
    if (
      can("grievance.verify") &&
      !terminal &&
      !grievance.assignedOfficer &&
      ["SUBMITTED", "RECEIVED", "UNDER_VERIFICATION"].includes(status)
    ) {
      list.push({
        key: "verify",
        label: "Verify & complete details",
        blurb: "Confirm the category, department and priority before routing.",
      });
    }
    if (can("grievance.classify") && !terminal && status !== "PENDING_APPROVAL") {
      list.push({
        key: "classify",
        label: "Review classification",
        blurb: "Accept or edit the suggested category and department.",
      });
    }
    if (can("grievance.route") && !terminal && grievance.category) {
      list.push({
        key: "route",
        label: "Route to department",
        blurb: "Send the grievance to the responsible department or office.",
      });
    }
    if (can("grievance.assign", "grievance.reassign") && !terminal && grievance.department) {
      list.push({
        key: "assign",
        label: grievance.assignedOfficer ? "Reassign officer" : "Assign officer",
        blurb: "Choose an officer in the department to investigate and respond.",
      });
    }
    if (can("grievance.investigate") && status === "ASSIGNED" && assignedToMe) {
      list.push({
        key: "acknowledge",
        label: "Accept assignment",
        blurb: "Start the investigation clock and notify the complainant.",
      });
    }
    if (
      can("grievance.investigate", "grievance.act") &&
      !terminal &&
      (assignedToMe || supervisor)
    ) {
      list.push({
        key: "action",
        label: "Record action / noting",
        blurb: "Add an internal note, evidence, or the Action Taken Report.",
      });
    }
    if (
      can("grievance.resolve") &&
      (assignedToMe || role === "DEPARTMENT_HEAD") &&
      ["ASSIGNED", "UNDER_INVESTIGATION", "ACTION_TAKEN"].includes(status)
    ) {
      list.push({
        key: "resolution",
        label: "Submit resolution",
        blurb: "Record the outcome for supervisory approval.",
      });
    }
    if (
      can("grievance.approve.dept", "grievance.approve.district") &&
      ["PENDING_APPROVAL", "ACTION_TAKEN"].includes(status)
    ) {
      list.push({
        key: "decision",
        label: "Record decision",
        blurb: "Approve, reject, return, or close the grievance.",
      });
    }
    if (can("grievance.close") && ["RESOLVED", "REJECTED"].includes(status)) {
      list.push({
        key: "close",
        label: "Close grievance",
        blurb: "Close the grievance after the complainant has been informed.",
      });
    }
    if (
      role === "CITIZEN" &&
      terminal &&
      grievance.reopenRequest?.status !== "PENDING" &&
      String(grievance.citizen?._id ?? "") === user?.id
    ) {
      list.push({
        key: "reopen-request",
        label: "Request reopening",
        blurb: "Explain why the grievance needs further action.",
      });
    }
    if (can("grievance.reopen.review") && grievance.reopenRequest?.status === "PENDING") {
      list.push({
        key: "reopen-review",
        label: "Review reopening request",
        blurb: "Approve or reject the complainant's reopening request.",
      });
    }
    if (can("grievance.escalate") && !terminal) {
      list.push({
        key: "escalate",
        label: "Escalate grievance",
        blurb: "Raise the escalation level and alert supervisors.",
      });
    }
    return list;
  }, [grievance, permissions, role, assignedToMe, supervisor, terminal, user?.id]);

  const [selected, setSelected] = useState<ActionKey | "">("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (selected && !actions.some((action) => action.key === selected)) {
      setSelected("");
    }
  }, [actions, selected]);

  if (actions.length === 0) {
    return null;
  }

  const current = actions.find((action) => action.key === selected);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      switch (selected) {
        case "verify": {
          const payload: Record<string, unknown> = {};
          if (text("category")) payload.category = text("category");
          if (text("department")) payload.department = text("department");
          if (text("priority")) payload.priority = text("priority");
          if (text("notes")) payload.notes = text("notes");
          await api.post(`/grievances/${grievance._id}/verify`, payload);
          break;
        }
        case "classify":
          await api.post(`/grievances/${grievance._id}/classify`, {
            category: text("category"),
            decision: text("decision"),
            ...(text("department") ? { department: text("department") } : {}),
            ...(text("priority") ? { priority: text("priority") } : {}),
            ...(text("notes") ? { notes: text("notes") } : {}),
          });
          break;
        case "route":
          await api.post(`/grievances/${grievance._id}/route`, {
            department: text("department"),
            ...(text("priority") ? { priority: text("priority") } : {}),
            ...(text("remarks") ? { remarks: text("remarks") } : {}),
          });
          break;
        case "assign":
          await api.post(`/grievances/${grievance._id}/assign`, {
            officerId: text("officerId"),
            ...(text("priority") ? { priority: text("priority") } : {}),
            ...(text("remarks") ? { remarks: text("remarks") } : {}),
          });
          break;
        case "acknowledge":
          await api.post(`/grievances/${grievance._id}/acknowledge`);
          break;
        case "action":
          await api.post(`/grievances/${grievance._id}/actions`, {
            type: text("type"),
            text: text("text"),
            visibility: text("visibility"),
          });
          break;
        case "resolution":
          await api.post(`/grievances/${grievance._id}/resolution`, { text: text("text") });
          break;
        case "decision":
          await api.post(`/grievances/${grievance._id}/decision`, {
            outcome: text("outcome"),
            reason: text("reason"),
          });
          break;
        case "close":
          await api.post(`/grievances/${grievance._id}/close`, { reason: text("reason") });
          break;
        case "reopen-request":
          await api.post(`/grievances/${grievance._id}/reopen-request`, { reason: text("reason") });
          break;
        case "reopen-review":
          await api.post(`/grievances/${grievance._id}/reopen-review`, {
            approve: form.get("approve") === "on",
            ...(text("notes") ? { decisionNotes: text("notes") } : {}),
          });
          break;
        case "escalate":
          await api.post(`/grievances/${grievance._id}/escalate`, { reason: text("reason") });
          break;
      }
      setSuccess("Action recorded successfully.");
      setSelected("");
      onUpdated();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card-surface">
      <div className="border-b border-border px-4 py-3.5 sm:px-5">
        <h2 className="text-[13.5px] font-semibold text-foreground">Workflow actions</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Available actions depend on your role and the current status.
        </p>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {success ? (
          <Alert variant="success" className="text-success">
            {success}
          </Alert>
        ) : null}
        {error ? <Alert variant="error">{error}</Alert> : null}

        {!current ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={() => {
                  setSelected(action.key);
                  setSuccess("");
                  setError("");
                }}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft"
              >
                <span className="block text-[12.5px] font-semibold text-foreground">{action.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{action.blurb}</span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-semibold text-foreground">{current.label}</h3>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">{current.blurb}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected("")}>
                Cancel
              </Button>
            </div>
            <ActionFields key={current.key} action={current.key} grievance={grievance} />
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? (
                "Saving…"
              ) : (
                <>
                  <Send className="size-3.5" aria-hidden />
                  Confirm action
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}

function ActionFields({ action, grievance }: { action: ActionKey; grievance: GrievanceDetailData }) {
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [officers, setOfficers] = useState<OfficerOption[] | null>(null);
  const [officerError, setOfficerError] = useState("");

  const needsCatalogs = ["verify", "classify", "route"].includes(action);
  const needsOfficers = action === "assign";

  useEffect(() => {
    if (!needsCatalogs) return;
    let cancelled = false;
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then((data) => {
        if (!cancelled) setCatalogs(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needsCatalogs]);

  useEffect(() => {
    if (!needsOfficers) return;
    let cancelled = false;
    setOfficers(null);
    api
      .get<OfficerOption[]>("/reference/officers")
      .then((data) => {
        if (!cancelled) setOfficers(data);
      })
      .catch((cause) => {
        if (!cancelled) setOfficerError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [needsOfficers]);

  const categories = (catalogs?.grievanceCategories ?? []).filter((item) => !item.parent);
  const currentCategory = String(grievance.category?._id ?? "");
  const currentDepartment = String(grievance.department?._id ?? "");

  switch (action) {
    case "verify":
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="category" required>
              <Select id="category" name="category" defaultValue={currentCategory} required>
                <option value="">Select a category</option>
                {categories.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Department" htmlFor="department">
              <Select id="department" name="department" defaultValue={currentDepartment}>
                <option value="">Keep current / auto-route</option>
                {(catalogs?.departments ?? []).map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue={grievance.priority ?? ""}>
                <option value="">Keep current</option>
                {toOptions(PRIORITIES).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Verification notes" htmlFor="notes" hint="Recorded in the internal timeline">
            <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
          </Field>
        </>
      );
    case "classify":
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="category" required>
              <Select id="category" name="category" defaultValue={currentCategory} required>
                <option value="">Select a category</option>
                {categories.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Review decision" htmlFor="decision" required>
              <Select id="decision" name="decision" defaultValue="EDITED" required>
                <option value="ACCEPTED">Accept suggestion</option>
                <option value="EDITED">Correct classification</option>
                <option value="REJECTED">Reject suggestion</option>
              </Select>
            </Field>
            <Field label="Department" htmlFor="department">
              <Select id="department" name="department" defaultValue={currentDepartment}>
                <option value="">Auto from category</option>
                {(catalogs?.departments ?? []).map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue={grievance.priority ?? ""}>
                <option value="">Keep current</option>
                {toOptions(PRIORITIES).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} maxLength={1000} />
          </Field>
        </>
      );
    case "route":
      return (
        <>
          <Field label="Department" htmlFor="department" required>
            <Select id="department" name="department" defaultValue={currentDepartment} required>
              <option value="">Select a department</option>
              {(catalogs?.departments ?? []).map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Remarks" htmlFor="remarks">
            <Textarea id="remarks" name="remarks" rows={3} maxLength={2000} />
          </Field>
        </>
      );
    case "assign":
      return (
        <>
          {officerError ? <Alert variant="error">{officerError}</Alert> : null}
          <Field label="Officer" htmlFor="officerId" required>
            <Select id="officerId" name="officerId" required defaultValue="">
              <option value="">{officers ? "Select an officer" : "Loading officers…"}</option>
              {(officers ?? []).map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name}
                  {officer.designation ? ` — ${officer.designation}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="priority">
            <Select id="priority" name="priority" defaultValue={grievance.priority ?? ""}>
              <option value="">Keep current</option>
              {toOptions(PRIORITIES).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Instructions" htmlFor="remarks">
            <Textarea id="remarks" name="remarks" rows={3} maxLength={2000} />
          </Field>
        </>
      );
    case "acknowledge":
      return (
        <Alert variant="info">
          Accepting the assignment moves the grievance to investigation and records your acknowledgement time.
        </Alert>
      );
    case "action":
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Action type" htmlFor="type" required>
              <Select id="type" name="type" defaultValue="INTERNAL_NOTE" required>
                <option value="INTERNAL_NOTE">Internal note</option>
                <option value="EVIDENCE">Evidence</option>
                <option value="ATR">Action Taken Report</option>
              </Select>
            </Field>
            <Field label="Visibility" htmlFor="visibility">
              <Select id="visibility" name="visibility" defaultValue="INTERNAL">
                <option value="INTERNAL">Internal</option>
                <option value="PUBLIC">Shared with complainant</option>
              </Select>
            </Field>
          </div>
          <Field label="Details" htmlFor="text" required>
            <Textarea id="text" name="text" rows={5} minLength={3} maxLength={5000} required />
          </Field>
        </>
      );
    case "resolution":
      return (
        <Field label="Resolution summary" htmlFor="text" required hint="Visible to the complainant after approval">
          <Textarea id="text" name="text" rows={5} minLength={10} maxLength={5000} required />
        </Field>
      );
    case "decision":
      return (
        <>
          <Field label="Outcome" htmlFor="outcome" required>
            <Select id="outcome" name="outcome" defaultValue="RESOLVED" required>
              <option value="RESOLVED">Resolve</option>
              <option value="REJECTED">Reject</option>
              <option value="RETURNED">Return for further action</option>
              <option value="CLOSED">Close without further action</option>
            </Select>
          </Field>
          <Field label="Reason" htmlFor="reason" required>
            <Textarea id="reason" name="reason" rows={4} minLength={5} maxLength={2000} required />
          </Field>
        </>
      );
    case "close":
      return (
        <Field label="Closing reason" htmlFor="reason" required>
          <Textarea id="reason" name="reason" rows={4} minLength={5} maxLength={2000} required />
        </Field>
      );
    case "reopen-request":
      return (
        <Field label="Why should this be reopened?" htmlFor="reason" required>
          <Textarea id="reason" name="reason" rows={4} minLength={10} maxLength={2000} required />
        </Field>
      );
    case "reopen-review":
      return (
        <>
          <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <input type="checkbox" name="approve" className="size-4 rounded border-input" />
            Approve reopening and restart the SLA clock
          </label>
          <Field label="Decision notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
          </Field>
        </>
      );
    case "escalate":
      return (
        <Field label="Escalation reason" htmlFor="reason" required>
          <Input id="reason" name="reason" minLength={5} maxLength={2000} required />
        </Field>
      );
  }
}
