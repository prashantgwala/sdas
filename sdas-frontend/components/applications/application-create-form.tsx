"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, Info } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApplicationSummary } from "@/lib/types";
import { applicationFields, type ApplicationTypeOption } from "./types";

export function ApplicationCreateForm({ backHref }: { backHref: string }) {
  const router = useRouter();
  const [types, setTypes] = useState<ApplicationTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeId, setTypeId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<ApplicationTypeOption[]>("/applications/types")
      .then((data) => {
        if (!cancelled) setTypes(data.filter((item) => item.active !== false));
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => types.find((item) => item._id === typeId), [types, typeId]);
  const fields = useMemo(() => applicationFields(selected?.formFieldSchema), [selected]);
  const documents = selected?.requiredDocuments ?? [];

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!selected) {
      setError("Select the service you want to apply for.");
      return;
    }
    for (const field of fields) {
      if (field.required && !String(values[field.key] ?? "").trim()) {
        setError(`Please complete "${field.label}".`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const formData: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = String(values[field.key] ?? "").trim();
        if (!raw) continue;
        formData[field.key] = field.type === "number" ? Number(raw) : raw;
      }
      const result = await api.post<ApplicationSummary>("/applications", {
        type: selected._id,
        formData,
      });
      router.push(`/applications/${result._id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading available services" />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Submit a service application"
        description="Select a service, complete the required details, and upload supporting documents after submission."
        eyebrow="New application"
        actions={
          <Link href={backHref} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline size-3.5" aria-hidden />
            Back to applications
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="card-surface space-y-4 p-5">
          <Field label="Service / certificate" htmlFor="type" required>
            <Select
              id="type"
              value={typeId}
              onChange={(event) => {
                setTypeId(event.target.value);
                setValues({});
              }}
            >
              <option value="">Select a service</option>
              {types.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>

          {selected?.description ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-info/20 bg-info-soft px-3.5 py-3 text-[12px] text-info">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">{selected.name}</p>
                <p className="mt-0.5 leading-relaxed opacity-90">{selected.description}</p>
              </div>
            </div>
          ) : null}
        </div>

        {selected ? (
          <>
            {fields.length > 0 ? (
              <div className="card-surface grid gap-4 p-5 sm:grid-cols-2">
                {fields.map((field) => {
                  const id = `field-${field.key}`;
                  const common = {
                    id,
                    value: values[field.key] ?? "",
                    onChange: (
                      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
                    ) => setValue(field.key, event.target.value),
                  };
                  return (
                    <Field
                      key={field.key}
                      label={field.label}
                      htmlFor={id}
                      required={field.required}
                      className={field.type === "textarea" ? "sm:col-span-2" : undefined}
                    >
                      {field.type === "textarea" ? (
                        <Textarea {...common} rows={3} />
                      ) : field.type === "select" ? (
                        <Select {...common}>
                          <option value="">Select {field.label.toLowerCase()}</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          {...common}
                          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                          min={field.type === "number" ? 0 : undefined}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            ) : (
              <Alert variant="info">
                This service does not require additional form details. Submit the application to begin document
                verification.
              </Alert>
            )}

            <div className="card-surface p-5">
              <h2 className="text-[13.5px] font-semibold text-foreground">Documents to prepare</h2>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                You can upload PDF or image copies after submitting. Staff will verify each document.
              </p>
              {documents.length === 0 ? (
                <p className="mt-3 text-[12px] text-muted-foreground">No documents are required for this service.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {documents.map((document) => (
                    <li key={document.key} className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] text-foreground">{document.label}</span>
                      <Badge variant={document.required ? "warning" : "neutral"}>
                        {document.required ? "Required" : "Optional"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
                Submitting declares that the information provided is true. False information may lead to rejection.
              </p>
              <Button type="submit" disabled={submitting}>
                <FilePlus2 className="size-4" aria-hidden />
                {submitting ? "Submitting…" : "Submit application"}
              </Button>
            </div>
          </>
        ) : null}
      </form>
    </div>
  );
}
