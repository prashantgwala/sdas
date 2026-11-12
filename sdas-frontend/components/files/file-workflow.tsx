"use client";

import { Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import type { OfficerOption } from "@/lib/types";
import { PRIORITIES, toOptions } from "@/lib/workflow";
import type { FileDetailData } from "./types";

const TERMINAL = ["COMPLETED", "ARCHIVED"];

type ActionKey = "dispatch" | "receive" | "note" | "decision" | "finalize" | "archive" | "update";

interface ActionDef {
  key: ActionKey;
  label: string;
  blurb: string;
}

export function FileWorkflow({
  file,
  onUpdated,
}: {
  file: FileDetailData;
  onUpdated: () => void;
}) {
  const { user, permissions } = useAuth();
  const can = (...codes: string[]) => codes.some((code) => permissions.includes(code));
  const terminal = TERMINAL.includes(file.status);
  const custodianMe = Boolean(user?.id) && String(file.currentCustodian?._id ?? "") === user?.id;
  const supervisor = user?.role === "DEPARTMENT_HEAD" || user?.role === "DISTRICT_ADMIN" || user?.role === "SUPER_ADMIN";

  const actions = useMemo<ActionDef[]>(() => {
    const list: ActionDef[] = [];
    if (file.status === "DISPATCHED" && can("file.receive") && custodianMe) {
      list.push({
        key: "receive",
        label: "Mark as received",
        blurb: "Confirm physical or QR receipt so the movement is recorded.",
      });
    }
    if (
      can("file.dispatch", "file.forward") &&
      !terminal &&
      (custodianMe || supervisor)
    ) {
      list.push({
        key: "dispatch",
        label: "Dispatch file",
        blurb: "Send the file to another officer with the required action.",
      });
    }
    if (can("file.note") && !terminal && (custodianMe || supervisor)) {
      list.push({
        key: "note",
        label: "Add noting",
        blurb: "Record a note, recommendation or decision on the file.",
      });
    }
    if (
      can("file.approve.dept", "file.approve.district") &&
      ["NOTING_ADDED", "UNDER_REVIEW", "RECEIVED", "APPROVAL_PENDING", "DISPATCHED"].includes(file.status)
    ) {
      list.push({
        key: "decision",
        label: "Record decision",
        blurb: "Approve the file or return it for correction.",
      });
    }
    if (
      can("file.finalize") &&
      ["APPROVED", "NOTING_ADDED", "RECEIVED"].includes(file.status) &&
      (custodianMe || supervisor)
    ) {
      list.push({
        key: "finalize",
        label: "Finalise file",
        blurb: "Record the final action and complete the file.",
      });
    }
    if (can("file.update") && !terminal && (custodianMe || supervisor)) {
      list.push({
        key: "update",
        label: "Update file details",
        blurb: "Adjust priority, location or retention for this file.",
      });
    }
    if (can("file.archive") && file.status !== "ARCHIVED") {
      list.push({
        key: "archive",
        label: "Archive file",
        blurb: "Move the file to the archive with an optional note.",
      });
    }
    return list;
  }, [file, permissions, custodianMe, supervisor, terminal]);

  const [selected, setSelected] = useState<ActionKey | "">("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [officers, setOfficers] = useState<OfficerOption[] | null>(null);

  useEffect(() => {
    if (selected && !actions.some((action) => action.key === selected)) setSelected("");
  }, [actions, selected]);

  useEffect(() => {
    if (selected !== "dispatch") return;
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
        case "dispatch":
          await api.post(`/files/${file._id}/dispatch`, {
            toUser: text("toUser"),
            actionRequired: text("actionRequired"),
            ...(text("remarks") ? { remarks: text("remarks") } : {}),
          });
          break;
        case "receive":
          await api.post(`/files/${file._id}/receive`, { via: "MANUAL" });
          break;
        case "note":
          await api.post(`/files/${file._id}/notes`, {
            text: text("text"),
            visibility: text("visibility"),
            decision: text("decision"),
          });
          break;
        case "decision":
          await api.post(`/files/${file._id}/decision`, {
            outcome: text("outcome"),
            remarks: text("remarks"),
          });
          break;
        case "finalize":
          await api.post(`/files/${file._id}/finalize`, { finalAction: text("finalAction") });
          break;
        case "update": {
          const payload: Record<string, unknown> = {};
          if (text("priority")) payload.priority = text("priority");
          if (text("currentLocation")) payload.currentLocation = text("currentLocation");
          if (text("retentionDays")) payload.retentionDays = Number(text("retentionDays"));
          await api.patch(`/files/${file._id}`, payload);
          break;
        }
        case "archive":
          await api.post(`/files/${file._id}/archive`, text("notes") ? { notes: text("notes") } : {});
          break;
      }
      setSuccess("File updated successfully.");
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
        <h2 className="text-[13.5px] font-semibold text-foreground">File actions</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Actions depend on your role, custody and the current status.
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

            {current.key === "dispatch" ? (
              <>
                <Field label="Recipient" htmlFor="toUser" required>
                  <Select id="toUser" name="toUser" required defaultValue="">
                    <option value="">{officers ? "Select a recipient" : "Loading officers…"}</option>
                    {(officers ?? []).map((officer) => (
                      <option key={officer.id} value={officer.id}>
                        {officer.name}
                        {officer.department?.name ? ` — ${officer.department.name}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Action required" htmlFor="actionRequired" required>
                  <Select id="actionRequired" name="actionRequired" defaultValue="REVIEW" required>
                    <option value="REVIEW">Review</option>
                    <option value="APPROVAL">Approval</option>
                    <option value="INFORMATION">Information</option>
                    <option value="ACTION">Action</option>
                  </Select>
                </Field>
                <Field label="Remarks" htmlFor="remarks">
                  <Textarea id="remarks" name="remarks" rows={3} maxLength={2000} />
                </Field>
              </>
            ) : null}

            {current.key === "note" ? (
              <>
                <Field label="Note" htmlFor="text" required>
                  <Textarea id="text" name="text" rows={5} minLength={2} maxLength={5000} required />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Visibility" htmlFor="visibility" required>
                    <Select id="visibility" name="visibility" defaultValue="INTERNAL" required>
                      <option value="INTERNAL">Internal</option>
                      <option value="PUBLIC">Public</option>
                      <option value="CONFIDENTIAL">Confidential</option>
                    </Select>
                  </Field>
                  <Field label="Recommendation" htmlFor="decision">
                    <Select id="decision" name="decision" defaultValue="NONE">
                      <option value="NONE">None</option>
                      <option value="RECOMMEND_APPROVAL">Recommend approval</option>
                      <option value="RECOMMEND_RETURN">Recommend return</option>
                    </Select>
                  </Field>
                </div>
              </>
            ) : null}

            {current.key === "decision" ? (
              <>
                <Field label="Outcome" htmlFor="outcome" required>
                  <Select id="outcome" name="outcome" defaultValue="APPROVED" required>
                    <option value="APPROVED">Approve</option>
                    <option value="RETURNED">Return for correction</option>
                  </Select>
                </Field>
                <Field label="Remarks" htmlFor="remarks" required>
                  <Textarea id="remarks" name="remarks" rows={4} minLength={5} maxLength={2000} required />
                </Field>
              </>
            ) : null}

            {current.key === "finalize" ? (
              <Field label="Final action" htmlFor="finalAction" required>
                <Textarea id="finalAction" name="finalAction" rows={4} minLength={5} maxLength={2000} required />
              </Field>
            ) : null}

            {current.key === "update" ? (
              <>
                <Field label="Priority" htmlFor="priority">
                  <Select id="priority" name="priority" defaultValue={file.priority}>
                    {toOptions(PRIORITIES).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Current location" htmlFor="currentLocation">
                  <Input id="currentLocation" name="currentLocation" maxLength={200} defaultValue={file.currentLocation ?? ""} />
                </Field>
                <Field label="Retention (days)" htmlFor="retentionDays">
                  <Input
                    id="retentionDays"
                    name="retentionDays"
                    type="number"
                    min={1}
                    max={36500}
                    defaultValue={file.retentionDays ?? ""}
                  />
                </Field>
              </>
            ) : null}

            {current.key === "archive" ? (
              <Field label="Archive note" htmlFor="notes">
                <Textarea id="notes" name="notes" rows={3} maxLength={1000} />
              </Field>
            ) : null}

            {current.key === "receive" ? (
              <Alert variant="info">
                Confirm that you have received file {file.fileNumber ?? file.fileId}. This records the movement
                receipt and makes you the custodian.
              </Alert>
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
