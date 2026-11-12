"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  KeyRound,
  Mail,
  ShieldCheck,
  Smartphone,
  UserCog,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABELS, type ReferenceCatalogs, type Role } from "@/lib/types";
import { formatDateTime, initials } from "@/lib/utils";
import type { AdminUser } from "@/components/admin/user-list";

const ROLES: Array<{ value: Role; label: string }> = (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

const STATUSES = ["ACTIVE", "PENDING_VERIFICATION", "INACTIVE", "SUSPENDED"];

export function UserDetail({ userId }: { userId: string }) {
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [profile, setProfile] = useState({ name: "", email: "", mobile: "", department: "", office: "", designation: "", tehsil: "" });
  const [roleForm, setRoleForm] = useState({ role: "CITIZEN" as Role, department: "", designation: "" });
  const [statusForm, setStatusForm] = useState({ status: "ACTIVE", reason: "" });
  const [passwordForm, setPasswordForm] = useState({ password: "", reason: "" });

  useEffect(() => {
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then(setCatalogs)
      .catch(() => undefined);
  }, []);

  function hydrate(next: AdminUser) {
    setUser(next);
    setProfile({
      name: next.name ?? "",
      email: next.email ?? "",
      mobile: next.mobile ?? "",
      department: next.department?._id ?? "",
      office: next.office?._id ?? "",
      designation: next.designation ?? "",
      tehsil: next.tehsil?._id ?? "",
    });
    setRoleForm({
      role: next.role,
      department: next.department?._id ?? "",
      designation: next.designation ?? "",
    });
    setStatusForm((current) => ({ ...current, status: next.status, reason: "" }));
    setPasswordForm({ password: "", reason: "" });
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<AdminUser>(`/admin/users/${userId}`);
      hydrate(data);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const officeOptions = useMemo(() => {
    const offices = catalogs?.offices ?? [];
    return offices
      .filter((office) => !profile.department || String(office.department ?? "") === profile.department)
      .map((office) => ({ value: office._id, label: office.name }));
  }, [catalogs, profile.department]);

  if (loading) {
    return (
      <div className="card-surface p-5">
        <LoadingBlock label="Loading user…" />
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <Alert variant="error">{error || "User not found."}</Alert>
        <Link href="/admin/users" className="mt-4 inline-block text-[12px] font-semibold text-primary hover:underline">
          Back to users
        </Link>
      </div>
    );
  }

  const isSelf = currentUser?.id === user._id;
  const isCitizen = user.role === "CITIZEN";

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("profile", async () => {
      await api.patch(`/admin/users/${user!._id}`, {
        name: profile.name.trim(),
        email: profile.email.trim(),
        mobile: profile.mobile.trim(),
        ...(profile.department ? { department: profile.department } : { department: "" }),
        ...(profile.office ? { office: profile.office } : { office: "" }),
        ...(profile.tehsil ? { tehsil: profile.tehsil } : { tehsil: "" }),
        designation: profile.designation.trim(),
      });
      await load();
      setNotice("User profile updated.");
    });
  }

  async function saveRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("role", async () => {
      await api.post(`/admin/users/${user!._id}/role`, {
        role: roleForm.role,
        ...(roleForm.department ? { department: roleForm.department } : {}),
        designation: roleForm.designation.trim(),
      });
      await load();
      setNotice("Role assignment updated. Permission changes apply on the next request.");
    });
  }

  async function saveStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("status", async () => {
      await api.post(`/admin/users/${user!._id}/status`, {
        status: statusForm.status,
        ...(statusForm.reason.trim() ? { reason: statusForm.reason.trim() } : {}),
      });
      await load();
      setNotice("Account status updated.");
    });
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordForm.password.length < 10 || !/[A-Z]/.test(passwordForm.password) || !/[a-z]/.test(passwordForm.password) || !/\d/.test(passwordForm.password) || !/[^A-Za-z0-9]/.test(passwordForm.password)) {
      setError("Password must be at least 10 characters with upper case, lower case, a number and a symbol.");
      return;
    }
    await run("password", async () => {
      await api.post(`/admin/users/${user!._id}/reset-password`, {
        password: passwordForm.password,
        ...(passwordForm.reason.trim() ? { reason: passwordForm.reason.trim() } : {}),
      });
      setPasswordForm({ password: "", reason: "" });
      setNotice("Password reset. All sessions for this account were revoked.");
    });
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
        title={user.name}
        description={`${ROLE_LABELS[user.role]}${user.department?.name ? ` · ${user.department.name}` : ""}`}
        eyebrow="User account"
        actions={<StatusBadge status={user.status} />}
      />

      {error ? <div className="mb-4"><Alert variant="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert variant="success">{notice}</Alert></div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <SectionCard title="Profile details" description="Contact and organisational information">
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="detail-name" required>
                  <Input id="detail-name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} maxLength={120} />
                </Field>
                <Field label="Mobile" htmlFor="detail-mobile" required>
                  <Input
                    id="detail-mobile"
                    value={profile.mobile}
                    onChange={(event) => setProfile((current) => ({ ...current, mobile: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    inputMode="numeric"
                    maxLength={10}
                  />
                </Field>
              </div>
              <Field label="Email" htmlFor="detail-email" required>
                <Input id="detail-email" type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} maxLength={200} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Department" htmlFor="detail-department">
                  <Select
                    id="detail-department"
                    value={profile.department}
                    onChange={(event) => setProfile((current) => ({ ...current, department: event.target.value, office: "" }))}
                  >
                    <option value="">Not assigned</option>
                    {(catalogs?.departments ?? []).map((item) => (
                      <option key={item._id} value={item._id}>{item.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Office" htmlFor="detail-office" hint="Optional">
                  <Select
                    id="detail-office"
                    value={profile.office}
                    onChange={(event) => setProfile((current) => ({ ...current, office: event.target.value }))}
                    disabled={!profile.department}
                  >
                    <option value="">Not assigned</option>
                    {officeOptions.map((office) => (
                      <option key={office.value} value={office.value}>{office.label}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tehsil" htmlFor="detail-tehsil" hint={isCitizen ? undefined : "Optional"}>
                  <Select id="detail-tehsil" value={profile.tehsil} onChange={(event) => setProfile((current) => ({ ...current, tehsil: event.target.value }))}>
                    <option value="">Not assigned</option>
                    {(catalogs?.administrativeUnits ?? []).map((unit) => (
                      <option key={unit._id} value={unit._id}>{unit.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Designation" htmlFor="detail-designation" hint="Staff only">
                  <Input id="detail-designation" value={profile.designation} onChange={(event) => setProfile((current) => ({ ...current, designation: event.target.value }))} maxLength={120} />
                </Field>
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" disabled={busy === "profile"}>
                  {busy === "profile" ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Role & scope" description="Changing a role changes API permissions on the next request">
            <form onSubmit={saveRole} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role" htmlFor="detail-role" required>
                  <Select
                    id="detail-role"
                    value={roleForm.role}
                    onChange={(event) => setRoleForm((current) => ({ ...current, role: event.target.value as Role }))}
                    disabled={isSelf}
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Department" htmlFor="detail-role-department" hint={roleForm.role === "CITIZEN" ? "Not required" : "Required for staff"}>
                  <Select
                    id="detail-role-department"
                    value={roleForm.department}
                    onChange={(event) => setRoleForm((current) => ({ ...current, department: event.target.value }))}
                    disabled={roleForm.role === "CITIZEN" || isSelf}
                  >
                    <option value="">Not assigned</option>
                    {(catalogs?.departments ?? []).map((item) => (
                      <option key={item._id} value={item._id}>{item.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Designation" htmlFor="detail-role-designation" hint="Shown on assignments">
                <Input
                  id="detail-role-designation"
                  value={roleForm.designation}
                  onChange={(event) => setRoleForm((current) => ({ ...current, designation: event.target.value }))}
                  maxLength={120}
                  disabled={isSelf}
                />
              </Field>
              {isSelf ? (
                <Alert variant="info">You cannot change your own role. Ask another super administrator.</Alert>
              ) : null}
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" variant="secondary" disabled={busy === "role" || isSelf}>
                  <UserCog className="size-3.5" aria-hidden />
                  {busy === "role" ? "Updating…" : "Update role"}
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Account" description="Identity and activity">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{user.name}</p>
                <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-3 text-[12px]">
              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="break-all font-medium">{user.email}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Smartphone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Mobile</dt>
                  <dd className="font-medium">{user.mobile}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Placement</dt>
                  <dd className="font-medium">
                    {user.department?.name ?? "—"}
                    {user.office?.name ? ` · ${user.office.name}` : ""}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Last sign-in</dt>
                  <dd className="font-medium">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">{formatDateTime(user.createdAt)}</dd>
                </div>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Account status" description="Suspending an account revokes its sessions">
            <form onSubmit={saveStatus} className="space-y-4">
              <Field label="Status" htmlFor="detail-status">
                <Select
                  id="detail-status"
                  value={statusForm.status}
                  onChange={(event) => setStatusForm((current) => ({ ...current, status: event.target.value }))}
                  disabled={isSelf}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Reason" htmlFor="detail-status-reason" hint="Optional">
                <Input
                  id="detail-status-reason"
                  value={statusForm.reason}
                  onChange={(event) => setStatusForm((current) => ({ ...current, reason: event.target.value }))}
                  maxLength={500}
                  placeholder="Recorded in the audit log"
                />
              </Field>
              {isSelf ? <Alert variant="info">You cannot change your own account status.</Alert> : null}
              <Button type="submit" variant="secondary" className="w-full" disabled={busy === "status" || isSelf}>
                {busy === "status" ? "Updating…" : "Update status"}
              </Button>
            </form>
          </SectionCard>

          <SectionCard title="Reset password" description="Sets a new password and signs the user out everywhere">
            <form onSubmit={resetPassword} className="space-y-4">
              <Field label="New password" htmlFor="detail-new-password" hint="Min 10 chars" required>
                <Input
                  id="detail-new-password"
                  type="text"
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  autoComplete="new-password"
                  maxLength={128}
                />
              </Field>
              <Field label="Reason" htmlFor="detail-password-reason" hint="Optional">
                <Input
                  id="detail-password-reason"
                  value={passwordForm.reason}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, reason: event.target.value }))}
                  maxLength={500}
                />
              </Field>
              <Button type="submit" variant="danger" className="w-full" disabled={busy === "password"}>
                <KeyRound className="size-3.5" aria-hidden />
                {busy === "password" ? "Resetting…" : "Reset password"}
              </Button>
            </form>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
