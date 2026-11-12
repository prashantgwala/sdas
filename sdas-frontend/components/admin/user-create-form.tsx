"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, UserPlus, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, SectionCard } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABELS, type ReferenceCatalogs, type Role } from "@/lib/types";

const ROLES: Array<{ value: Role; label: string }> = (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

const STATUSES = ["ACTIVE", "PENDING_VERIFICATION", "INACTIVE", "SUSPENDED"];

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  window.crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${body.slice(0, 4)}-${body.slice(4, 9)}-${body.slice(9)}7!`;
}

export function UserCreateForm() {
  const router = useRouter();
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    role: "CLERK" as Role,
    status: "ACTIVE",
    department: "",
    office: "",
    tehsil: "",
    designation: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then(setCatalogs)
      .catch((cause) => setError(errorMessage(cause)));
  }, []);

  const isCitizen = form.role === "CITIZEN";

  const officeOptions = useMemo(() => {
    const offices = catalogs?.offices ?? [];
    return offices
      .filter((office) => !form.department || String(office.department ?? "") === form.department)
      .map((office) => ({ value: office._id, label: office.name }));
  }, [catalogs, form.department]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (form.name.trim().length < 2) {
      setError("Enter the user's full name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) {
      setError("Enter a valid 10 digit mobile number.");
      return;
    }
    if (form.password.length < 10 || !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password)) {
      setError("Password must be at least 10 characters with upper case, lower case, a number and a symbol.");
      return;
    }
    if (!isCitizen && !form.department) {
      setError("Select a department for staff accounts.");
      return;
    }

    setSaving(true);
    try {
      const created = await api.post<{ _id: string }>("/admin/users", {
        name: form.name.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        password: form.password,
        role: form.role,
        status: form.status,
        ...(form.department ? { department: form.department } : {}),
        ...(form.office ? { office: form.office } : {}),
        ...(form.tehsil ? { tehsil: form.tehsil } : {}),
        ...(form.designation.trim() ? { designation: form.designation.trim() } : {}),
      });
      router.push(`/admin/users/${created._id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to users
        </Link>
      </div>
      <PageHeader
        title="Create user"
        description="Staff accounts require a department. Citizens can sign in immediately with the credentials you set."
        eyebrow="Access control"
      />

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" noValidate>
        <div className="space-y-5">
          <SectionCard title="Identity" description="Personal and contact details">
            {error ? <div className="mb-4"><Alert variant="error">{error}</Alert></div> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="user-name" required>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  autoComplete="off"
                  maxLength={120}
                />
              </Field>
              <Field label="Mobile number" htmlFor="user-mobile" hint="10 digits" required>
                <Input
                  id="user-mobile"
                  value={form.mobile}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, mobile: event.target.value.replace(/\D/g, "").slice(0, 10) }))
                  }
                  inputMode="numeric"
                  maxLength={10}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Email address" htmlFor="user-email" required>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  autoComplete="off"
                  maxLength={200}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Assignment" description="Role and organisational placement">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" htmlFor="user-role" required>
                <Select
                  id="user-role"
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as Role,
                      department: event.target.value === "CITIZEN" ? "" : current.department,
                      office: event.target.value === "CITIZEN" ? "" : current.office,
                    }))
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Account status" htmlFor="user-status">
                <Select
                  id="user-status"
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {isCitizen ? (
              <div className="mt-4">
                <Field label="Tehsil" htmlFor="user-tehsil">
                  <Select
                    id="user-tehsil"
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
            ) : (
              <>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Department" htmlFor="user-department" required>
                    <Select
                      id="user-department"
                      value={form.department}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, department: event.target.value, office: "" }))
                      }
                    >
                      <option value="">Select department</option>
                      {(catalogs?.departments ?? []).map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Office" htmlFor="user-office" hint="Optional">
                    <Select
                      id="user-office"
                      value={form.office}
                      onChange={(event) => setForm((current) => ({ ...current, office: event.target.value }))}
                      disabled={!form.department}
                    >
                      <option value="">Not specified</option>
                      {officeOptions.map((office) => (
                        <option key={office.value} value={office.value}>
                          {office.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Designation" htmlFor="user-designation" hint="Optional">
                    <Input
                      id="user-designation"
                      value={form.designation}
                      onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))}
                      maxLength={120}
                      placeholder="e.g. Junior Engineer"
                    />
                  </Field>
                </div>
              </>
            )}

            {form.role === "SUPER_ADMIN" ? (
              <div className="mt-4">
                <Alert variant="warning" title="Full platform access">
                  Super administrators can manage every department, role and configuration setting. Grant this role
                  sparingly.
                </Alert>
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Initial password" description="Share it securely; the user should change it after first sign-in">
            <Field label="Password" htmlFor="user-password" hint="Min 10 chars" required>
              <Input
                id="user-password"
                type="text"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="new-password"
                maxLength={128}
              />
            </Field>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => setForm((current) => ({ ...current, password: generatePassword() }))}
            >
              <Wand2 className="size-3.5" aria-hidden />
              Generate strong password
            </Button>
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Must include upper case, lower case, a number and a symbol. The password is hashed before storage.
            </p>
          </SectionCard>

          <SectionCard title="Account activation" description="The account is usable immediately">
            <ul className="space-y-2 text-[11.5px] text-muted-foreground">
              <li>• Everyone receives an in-app welcome notification.</li>
              <li>• The role determines API permissions and data scope.</li>
              <li>• Creating a user is recorded in the audit trail.</li>
            </ul>
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
              <Button type="submit" disabled={saving}>
                <UserPlus className="size-3.5" aria-hidden />
                {saving ? "Creating…" : "Create user"}
              </Button>
              <Link href="/admin/users" className="text-center text-[12px] font-semibold text-muted-foreground hover:text-foreground">
                Cancel
              </Link>
            </div>
          </SectionCard>

          <div className="card-surface p-4">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground">
              <KeyRound className="size-3.5 text-primary" aria-hidden />
              Password policy
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Staff passwords are stored as bcrypt hashes with a cost factor of 12. Password resets revoke all active
              sessions for the account.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
