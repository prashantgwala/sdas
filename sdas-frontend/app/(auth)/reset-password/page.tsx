"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { forgetResetIdentifier, readResetIdentifier } from "@/lib/auth-storage";

type Errors = Partial<Record<"identifier" | "code" | "newPassword" | "confirmPassword", string>>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setIdentifier(readResetIdentifier());
    const params = new URLSearchParams(window.location.search);
    const presetCode = params.get("code");
    if (presetCode) setCode(presetCode.replace(/\D/g, "").slice(0, 6));
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    const next: Errors = {};
    if (identifier.trim().length < 3) next.identifier = "Enter your registered email or mobile";
    if (!/^\d{6}$/.test(code)) next.code = "Enter the 6 digit verification code";
    if (newPassword.length < 8) next.newPassword = "Password must be at least 8 characters";
    else if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      next.newPassword = "Include uppercase, lowercase and a number";
    }
    if (confirmPassword !== newPassword) next.confirmPassword = "Passwords do not match";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await api.post<{ message: string }>("/auth/reset-password", {
        identifier: identifier.trim(),
        code,
        newPassword,
      });
      forgetResetIdentifier();
      setDone(true);
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="animate-rise text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Password reset successful</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your password has been changed and all other sessions have been signed out. Use your new
          password to continue.
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={() => router.replace("/login")}>
          Sign in with new password
          <ArrowRight aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <ShieldCheck className="size-3" aria-hidden />
          Secure reset
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-[26px]">Set a new password</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Enter the 6-digit code sent to your registered email or mobile, then choose a strong new
          password.
        </p>
      </div>

      {serverError ? (
        <Alert variant="error" className="mb-5" title="Password reset failed">
          {serverError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
        <Field label="Email or mobile number" htmlFor="identifier" error={errors.identifier} required>
          <Input
            id="identifier"
            autoComplete="username"
            placeholder="Registered email or mobile"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              if (errors.identifier) setErrors((prev) => ({ ...prev, identifier: undefined }));
            }}
            aria-invalid={Boolean(errors.identifier)}
          />
        </Field>

        <Field label="Verification code" htmlFor="code" hint="6 digits" error={errors.code} required>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              if (errors.code) setErrors((prev) => ({ ...prev, code: undefined }));
            }}
            aria-invalid={Boolean(errors.code)}
            className="font-mono text-base tracking-[0.35em]"
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          hint="8+ chars, upper, lower, number"
          error={errors.newPassword}
          required
        >
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            placeholder="Enter a new password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: undefined }));
            }}
            aria-invalid={Boolean(errors.newPassword)}
          />
        </Field>

        <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword} required>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Re-enter the new password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
            }}
            aria-invalid={Boolean(errors.confirmPassword)}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Updating password…" : "Reset password"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        Didn&apos;t receive a code?{" "}
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          Request a new one
        </Link>
      </p>
    </div>
  );
}
