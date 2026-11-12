"use client";

import Link from "next/link";
import { BadgeCheck, Building2, Mail, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader, SectionCard } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABELS, type Language } from "@/lib/types";
import { formatDateTime, initials } from "@/lib/utils";

const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "hinglish", label: "Hinglish" },
];

export function ProfileForm() {
  const { user, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    designation: "",
    address: "",
    tehsil: "",
    language: "en" as Language,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name ?? "",
      mobile: user.mobile ?? "",
      designation: user.designation ?? "",
      address: user.citizenProfile?.address ?? "",
      tehsil: user.citizenProfile?.tehsil ?? "",
      language: (user.citizenProfile?.language as Language | undefined) ?? user.preferences?.language ?? "en",
    });
  }, [user]);

  if (!user) {
    return (
      <div className="card-surface p-5">
        <LoadingBlock label="Loading profile…" />
      </div>
    );
  }

  const isCitizen = user.role === "CITIZEN";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (form.name.trim().length < 2) {
      setError("Enter your full name (at least 2 characters).");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) {
      setError("Enter a valid 10 digit mobile number starting with 6-9.");
      return;
    }

    setSaving(true);
    try {
      await api.patch<{ user: unknown }>("/auth/profile", {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        ...(isCitizen
          ? {
              citizenProfile: {
                address: form.address.trim(),
                tehsil: form.tehsil.trim(),
                language: form.language,
              },
            }
          : { designation: form.designation.trim() }),
      });
      await refreshProfile();
      setNotice("Profile updated successfully.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="My profile"
        description="Keep your contact details current so departments can reach you about your cases."
        eyebrow="Account"
        actions={
          <Link
            href="/settings"
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            Security & preferences
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
        <div className="space-y-5">
          <SectionCard title="Account" description="Identity and access details">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              </div>
            </div>

            <dl className="mt-4 space-y-3 text-[12px]">
              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="break-all font-medium text-foreground">{user.email}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Smartphone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Mobile</dt>
                  <dd className="font-medium text-foreground">{user.mobile}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Department / office</dt>
                  <dd className="font-medium text-foreground">
                    {user.departmentName ?? user.office ?? "District administration"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Account status</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-foreground">
                    <Badge variant={user.status === "ACTIVE" ? "success" : "warning"}>{user.status}</Badge>
                    <span className="text-[10.5px] text-muted-foreground">
                      Last sign-in {formatDateTime(user.lastLoginAt)}
                    </span>
                  </dd>
                </div>
              </div>
              {user.designation ? (
                <div className="flex items-start gap-2.5">
                  <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <dt className="text-muted-foreground">Designation</dt>
                    <dd className="font-medium text-foreground">{user.designation}</dd>
                  </div>
                </div>
              ) : null}
            </dl>

            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Email address and role are managed by a system administrator. Contact the district office if they need
              correction.
            </p>
          </SectionCard>
        </div>

        <SectionCard title="Contact details" description="Updates take effect immediately across the system">
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error ? <Alert variant="error">{error}</Alert> : null}
            {notice ? <Alert variant="success">{notice}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="profile-name" required>
                <Input
                  id="profile-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  autoComplete="name"
                  maxLength={120}
                />
              </Field>
              <Field label="Mobile number" htmlFor="profile-mobile" hint="10 digits" required>
                <Input
                  id="profile-mobile"
                  value={form.mobile}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, mobile: event.target.value.replace(/\D/g, "").slice(0, 10) }))
                  }
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                />
              </Field>
            </div>

            <Field label="Email address" htmlFor="profile-email" hint="Managed by administrator">
              <Input id="profile-email" value={user.email} disabled />
            </Field>

            {!isCitizen ? (
              <Field label="Designation" htmlFor="profile-designation">
                <Input
                  id="profile-designation"
                  value={form.designation}
                  onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))}
                  maxLength={120}
                  placeholder="e.g. Junior Engineer"
                />
              </Field>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tehsil" htmlFor="profile-tehsil">
                    <Input
                      id="profile-tehsil"
                      value={form.tehsil}
                      onChange={(event) => setForm((current) => ({ ...current, tehsil: event.target.value }))}
                      maxLength={120}
                      placeholder="e.g. Sadar"
                    />
                  </Field>
                  <Field label="Preferred language" htmlFor="profile-language">
                    <Select
                      id="profile-language"
                      value={form.language}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, language: event.target.value as Language }))
                      }
                    >
                      {LANGUAGES.map((language) => (
                        <option key={language.value} value={language.value}>
                          {language.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Address" htmlFor="profile-address">
                  <Textarea
                    id="profile-address"
                    rows={3}
                    value={form.address}
                    onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                    maxLength={500}
                    placeholder="House, street, locality"
                  />
                </Field>
              </>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button type="submit" disabled={saving}>
                <UserRound className="size-3.5" aria-hidden />
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
