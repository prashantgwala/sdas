"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { GrievanceSummary, ReferenceCatalogs } from "@/lib/types";
import { PRIORITIES, toOptions } from "@/lib/workflow";

const MOBILE_RE = /^[6-9]\d{9}$/;

export function GrievanceCreateForm({ backHref }: { backHref: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const isStaff = Boolean(user && user.role !== "CITIZEN");
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [priority, setPriority] = useState("");
  const [location, setLocation] = useState("");
  const [tehsil, setTehsil] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<GrievanceSummary | null>(null);

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

  const categories = useMemo(
    () => (catalogs?.grievanceCategories ?? []).filter((item) => !item.parent),
    [catalogs],
  );
  const subcategories = useMemo(
    () =>
      (catalogs?.grievanceCategories ?? []).filter(
        (item) => item.parent && (!category || String(item.parent) === category),
      ),
    [catalogs, category],
  );
  const tehsils = useMemo(
    () => (catalogs?.administrativeUnits ?? []).filter((unit) => !unit.type || unit.type === "TEHSIL"),
    [catalogs],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (subject.trim().length < 5) {
      setError("Subject must be at least 5 characters.");
      return;
    }
    if (description.trim().length < 20) {
      setError("Please describe the issue in at least 20 characters.");
      return;
    }
    if (isStaff && (contactName.trim().length < 2 || !MOBILE_RE.test(contactMobile.trim()))) {
      setError("Enter the complainant's name and a valid 10 digit mobile number.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        subject: subject.trim(),
        description: description.trim(),
      };
      if (category) payload.category = category;
      if (subcategory) payload.subcategory = subcategory;
      if (priority) payload.priority = priority;
      if (location.trim()) payload.location = location.trim();
      if (tehsil) payload.tehsil = tehsil;
      if (isStaff) {
        payload.contact = {
          name: contactName.trim(),
          mobile: contactMobile.trim(),
          ...(contactEmail.trim() ? { email: contactEmail.trim() } : {}),
        };
      }
      const result = await api.post<GrievanceSummary>("/grievances", payload);
      setCreated(result);
      router.push(`/grievances/${result._id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingCatalogs) {
    return <LoadingBlock label="Preparing the grievance form" />;
  }

  if (created) {
    return (
      <div className="card-surface mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-foreground">Grievance registered</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Reference <span className="font-mono font-semibold text-foreground">{created.grievanceId}</span> has been
          submitted. You will receive updates as the grievance moves through verification and action.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={`/grievances/${created._id}`} className="text-[13px] font-semibold text-primary hover:underline">
            View grievance
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={isStaff ? "Register a grievance on behalf of a citizen" : "Submit a grievance"}
        description={
          isStaff
            ? "Record a walk-in or phone complaint. The complainant will be identified by name and mobile number."
            : "Describe the issue clearly. Staff will verify and route it to the responsible department."
        }
        eyebrow="New grievance"
        actions={
          <Link href={backHref} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline size-3.5" aria-hidden />
            Back to list
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="card-surface space-y-4 p-5">
          <Field label="Subject" htmlFor="subject" required hint={`${subject.length}/200`}>
            <Input
              id="subject"
              value={subject}
              maxLength={200}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Short summary of the issue"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            required
            hint={`${description.length}/5000`}
          >
            <Textarea
              id="description"
              rows={6}
              value={description}
              maxLength={5000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Explain what happened, when, and where. Include any reference numbers."
            />
          </Field>
        </div>

        <div className="card-surface grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="category" hint="Optional — staff will verify">
            <Select
              id="category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setSubcategory("");
              }}
            >
              <option value="">Select a category</option>
              {categories.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategory" htmlFor="subcategory">
            <Select
              id="subcategory"
              value={subcategory}
              onChange={(event) => setSubcategory(event.target.value)}
              disabled={subcategories.length === 0}
            >
              <option value="">{subcategories.length ? "Select a subcategory" : "None available"}</option>
              {subcategories.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="priority" hint="Urgency is confirmed during verification">
            <Select id="priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="">Default for category</option>
              {toOptions(PRIORITIES).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tehsil" htmlFor="tehsil">
            <Select id="tehsil" value={tehsil} onChange={(event) => setTehsil(event.target.value)}>
              <option value="">Select a tehsil</option>
              {tehsils.map((unit) => (
                <option key={unit._id} value={unit._id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" htmlFor="location" className="sm:col-span-2" hint="Village, ward, landmark">
            <Input
              id="location"
              value={location}
              maxLength={500}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Where did the issue occur?"
            />
          </Field>
        </div>

        {isStaff ? (
          <div className="card-surface space-y-4 p-5">
            <div>
              <h2 className="text-[13.5px] font-semibold text-foreground">Complainant details</h2>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Required for assisted registrations so the citizen can be contacted.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="contactName" required>
                <Input
                  id="contactName"
                  value={contactName}
                  maxLength={120}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="Complainant name"
                />
              </Field>
              <Field label="Mobile number" htmlFor="contactMobile" required>
                <Input
                  id="contactMobile"
                  value={contactMobile}
                  maxLength={10}
                  inputMode="numeric"
                  onChange={(event) => setContactMobile(event.target.value.replace(/\D/g, ""))}
                  placeholder="10 digit mobile"
                />
              </Field>
              <Field label="Email" htmlFor="contactEmail" className="sm:col-span-2" hint="Optional">
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
            Information you submit is visible to the handling department and recorded in the audit trail.
          </p>
          <Button type="submit" disabled={submitting}>
            <Send className="size-4" aria-hidden />
            {submitting ? "Submitting…" : "Submit grievance"}
          </Button>
        </div>
      </form>
    </div>
  );
}
