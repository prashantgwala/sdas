"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { DigitalFileSummary, ReferenceCatalogs } from "@/lib/types";
import { CONFIDENTIALITY_LEVELS, PRIORITIES, toOptions } from "@/lib/workflow";

export function FileRegisterForm({ backHref }: { backHref: string }) {
  const router = useRouter();
  const { user, permissions } = useAuth();
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState(user?.department ?? "");
  const [category, setCategory] = useState("");
  const [office, setOffice] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [confidentiality, setConfidentiality] = useState("INTERNAL");
  const [retentionDays, setRetentionDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canPickDepartment = user?.role === "DISTRICT_ADMIN" || user?.role === "SUPER_ADMIN";

  useEffect(() => {
    let cancelled = false;
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then((data) => {
        if (!cancelled) setCatalogs(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalogs(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const offices = useMemo(
    () =>
      (catalogs?.offices ?? []).filter(
        (item) => !department || !item.department || String(item.department) === department,
      ),
    [catalogs, department],
  );

  const confidentialityOptions = CONFIDENTIALITY_LEVELS.filter((level) => {
    if (level === "CONFIDENTIAL") return permissions.includes("file.read.confidential");
    if (level === "RESTRICTED") return permissions.includes("security.manage");
    return true;
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (subject.trim().length < 3) {
      setError("Subject must be at least 3 characters.");
      return;
    }
    if (!department) {
      setError("Select the owning department.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        subject: subject.trim(),
        priority,
        confidentiality,
        department,
      };
      if (description.trim()) payload.description = description.trim();
      if (category) payload.category = category;
      if (office) payload.originatingOffice = office;
      if (retentionDays) payload.retentionDays = Number(retentionDays);
      const result = await api.post<DigitalFileSummary>("/files", payload);
      router.push(`/files/${result._id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingCatalogs) return <LoadingBlock label="Preparing the file register" />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Register a digital file"
        description="Create a tracked file with a unique number, QR receipt and movement history."
        eyebrow="New file"
        actions={
          <Link href={backHref} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline size-3.5" aria-hidden />
            Back to files
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="card-surface space-y-4 p-5">
          <Field label="Subject" htmlFor="subject" required hint={`${subject.length}/250`}>
            <Input
              id="subject"
              value={subject}
              maxLength={250}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="What is this file about?"
            />
          </Field>
          <Field label="Description" htmlFor="description" hint={`${description.length}/5000`}>
            <Textarea
              id="description"
              rows={4}
              value={description}
              maxLength={5000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Brief context, references or instructions for the file."
            />
          </Field>
        </div>

        <div className="card-surface grid gap-4 p-5 sm:grid-cols-2">
          {canPickDepartment ? (
            <Field label="Owning department" htmlFor="department" required>
              <Select id="department" value={department} onChange={(event) => setDepartment(event.target.value)}>
                <option value="">Select a department</option>
                {(catalogs?.departments ?? []).map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Owning department" htmlFor="department" hint="Fixed to your department">
              <Input id="department" value={user?.departmentName ?? "Your department"} readOnly disabled />
            </Field>
          )}
          <Field label="File category" htmlFor="category">
            <Select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Select a category</option>
              {(catalogs?.fileCategories ?? []).map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Originating office" htmlFor="office">
            <Select id="office" value={office} onChange={(event) => setOffice(event.target.value)}>
              <option value="">Not specified</option>
              {offices.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="priority" required>
            <Select id="priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
              {toOptions(PRIORITIES).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Classification" htmlFor="confidentiality" required>
            <Select
              id="confidentiality"
              value={confidentiality}
              onChange={(event) => setConfidentiality(event.target.value)}
            >
              {toOptions(confidentialityOptions).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Retention (days)" htmlFor="retentionDays" hint="Optional">
            <Input
              id="retentionDays"
              type="number"
              min={1}
              max={36500}
              value={retentionDays}
              onChange={(event) => setRetentionDays(event.target.value)}
              placeholder="Use the category default"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
            Every movement, noting and decision on this file is recorded for audit.
          </p>
          <Button type="submit" disabled={submitting}>
            <FilePlus2 className="size-4" aria-hidden />
            {submitting ? "Registering…" : "Register file"}
          </Button>
        </div>
      </form>
    </div>
  );
}
