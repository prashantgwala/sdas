"use client";

import { Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import type { OfficerOption } from "@/lib/types";
import { PRIORITIES, toOptions } from "@/lib/workflow";
import type { ApplicationDetailData } from "./types";

const TERMINAL = ["APPROVED", "REJECTED", "CLOSED"];

type ActionKey = "verify" | "assign" | "review" | "decision";

interface ActionDef {
  key: ActionKey;
  label: string;
  blurb: string;
}

export function ApplicationWorkflow({
  application,
  onUpdated,
}: {
  application: ApplicationDetailData;
  onUpdated: () => void;
}) {
  const { permissions } = useAuth();
  const can = (...codes: string[]) => codes.some((code) => permissions.includes(code));
  const terminal = TERMINAL.includes(application.status);

  const actions = useMemo<ActionDef[]>(() => {
    const list: ActionDef[] = [];
    if (
      can("application.verify") &&
      ["SUBMITTED", "UNDER_VERIFICATION", "DOCUMENT_PENDING"].includes(application.status)
    ) {
      list.push({
        key: "verify",
        label: "Verify documents",
        blurb: "Mark the checklist, link uploaded documents and optionally assign an officer.",
      });
    }
    if (can("application.decision.dept") && !terminal) {
      list.push({
        key: "assign",
        label: "Assign officer",
        blurb: "Allocate this application to an officer for review.",
      });
    }
    if (
      can("application.review") &&
      ["UNDER_REVIEW", "DOCUMENT_PENDING"].includes(application.status) &&
      (application.missingDocuments?.length ?? 0) === 0
    ) {
      list.push({
        key: "review",
        label: "Submit review",
        blurb: "Record review notes and recommend the application for decision.",
      });
    }
    if (
      can("application.decision.dept", "application.decision.district") &&
      ["PENDING_DECISION", "UNDER_REVIEW"].includes(application.status)
    ) {
      list.push({
        key: "decision",
        label: "Record decision",
        blurb: "Approve, reject or close the application.",
      });
    }
    return list;
  }, [application.status, application.missingDocuments, permissions, terminal]);

  const [selected, setSelected] = useState<ActionKey | "">("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [officers, setOfficers] = useState<OfficerOption[] | null>(null);

  useEffect(() => {
    if (selected && !actions.some((action) => action.key === selected)) setSelected("");
  }, [actions, selected]);

  useEffect(() => {
    if (selected !== "verify" && selected !== "assign") return;
    let cancelled = false;
    setOfficers(null);
    api
      .get<OfficerOption[]>("/reference/officers")
      .then((data) => {
        if (!cancelled) setOfficers(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (actions.length === 0) return null;
  const current = actions.find((action) => action.key === selected);

  const checklist =
    application.checklist && application.checklist.length > 0
      ? application.checklist
      : (application.type?.requiredDocuments ?? []).map((document) => ({
          key: document.key,
          label: document.label,
          required: document.required,
          provided: false,
          verified: false,
          document: null,
        }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      if (selected === "verify") {
        const payload: Record<string, unknown> = {
          checklist: checklist.map((item) => {
            const documentId = text(`document_${item.key}`);
            return {
              key: item.key,
              label: item.label,
              required: item.required,
              provided: form.get(`provided_${item.key}`) === "on" || Boolean(documentId),
              verified: form.get(`verified_${item.key}`) === "on",
              ...(documentId ? { document: documentId } : {}),
            };
          }),
        };
        if (text("assignOfficer")) payload.assignOfficer = text("assignOfficer");
        if (text("notes")) payload.notes = text("notes");
        await api.post(`/applications/${application._id}/verify`, payload);
      } else if (selected === "assign") {
        await api.post(`/applications/${application._id}/assign`, {
          officerId: text("officerId"),
          ...(text("priority") ? { priority: text("priority") } : {}),
          ...(text("remarks") ? { remarks: text("remarks") } : {}),
        });
      } else if (selected === "review") {
        await api.post(`/applications/${application._id}/review`, {
          reviewNotes: text("reviewNotes"),
        });
      } else {
        await api.post(`/applications/${application._id}/decision`, {
          outcome: text("outcome"),
          reason: text("reason"),
        });
      }
      setSuccess("Application updated successfully.");
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
        <h2 className="text-[13.5px] font-semibold text-foreground">Processing actions</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Only actions valid for the current status are shown.
        </p>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {success ? <Alert variant="success">{success}</Alert> : null}
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

            {current.key === "verify" ? (
              <>
                <div className="space-y-2">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Document checklist
                  </p>
                  {checklist.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">No documents are required for this service.</p>
                  ) : (
                    checklist.map((item) => {
                      const documentId = item.document?._id ?? "";
                      return (
                        <div key={item.key} className="rounded-lg border border-border bg-surface-muted/40 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[12.5px] font-medium text-foreground">
                              {item.label}
                              {item.required ? <span className="ml-1 text-danger">*</span> : null}
                            </p>
                            <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                              <label className="inline-flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  name={`provided_${item.key}`}
                                  defaultChecked={item.provided}
                                  className="size-3.5 rounded border-input"
                                />
                                Provided
                              </label>
                              <label className="inline-flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  name={`verified_${item.key}`}
                                  defaultChecked={item.verified}
                                  className="size-3.5 rounded border-input"
                                />
                                Verified
                              </label>
                            </div>
                          </div>
                          <Select name={`document_${item.key}`} defaultValue={documentId} className="mt-2 h-9 text-[12px]">
                            <option value="">Link an uploaded document (optional)</option>
                            {(application.documents ?? []).map((document) => (
                              <option key={document._id} value={document._id}>
                                {document.originalName}
                              </option>
                            ))}
                          </Select>
                        </div>
                      );
                    })
                  )}
                </div>
                <Field label="Assign officer" htmlFor="assignOfficer" hint="Optional at verification">
                  <Select id="assignOfficer" name="assignOfficer" defaultValue="">
                    <option value="">{officers ? "Do not assign yet" : "Loading officers…"}</option>
                    {(officers ?? []).map((officer) => (
                      <option key={officer.id} value={officer.id}>
                        {officer.name}
                        {officer.designation ? ` — ${officer.designation}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Verification notes" htmlFor="notes">
                  <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
                </Field>
              </>
            ) : null}

            {current.key === "assign" ? (
              <>
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
                  <Select id="priority" name="priority" defaultValue={application.priority ?? ""}>
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
            ) : null}

            {current.key === "review" ? (
              <Field label="Review notes" htmlFor="reviewNotes" required>
                <Textarea id="reviewNotes" name="reviewNotes" rows={5} minLength={5} maxLength={5000} required />
              </Field>
            ) : null}

            {current.key === "decision" ? (
              <>
                <Field label="Outcome" htmlFor="outcome" required>
                  <Select id="outcome" name="outcome" defaultValue="APPROVED" required>
                    <option value="APPROVED">Approve</option>
                    <option value="REJECTED">Reject</option>
                    <option value="CLOSED">Close</option>
                  </Select>
                </Field>
                <Field label="Reason" htmlFor="reason" required>
                  <Textarea id="reason" name="reason" rows={4} minLength={5} maxLength={2000} required />
                </Field>
              </>
            ) : null}

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
