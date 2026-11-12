"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, ShieldQuestion } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { rememberResetIdentifier } from "@/lib/auth-storage";

type Purpose = "RESET_PASSWORD" | "VERIFY_CONTACT";

export default function VerifyOtpPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("RESET_PASSWORD");
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    if (identifier.trim().length < 3) {
      setError("Enter the email or mobile number the code was sent to");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6 digit verification code");
      return;
    }
    setSubmitting(true);
    try {
      await api.post<{ valid: boolean }>("/auth/verify-otp", {
        identifier: identifier.trim(),
        code,
        purpose,
      });
      rememberResetIdentifier(identifier.trim());
      if (purpose === "RESET_PASSWORD") {
        router.push(`/reset-password?code=${code}`);
      } else {
        setVerified(true);
      }
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (verified) {
    return (
      <div className="animate-rise text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
          <BadgeCheck className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Contact verified</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The verification code was accepted. You can now close this page or continue to your
          account.
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={() => router.push("/login")}>
          Continue to sign in
          <ArrowRight aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <ShieldQuestion className="size-3" aria-hidden />
          Verification
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-[26px]">Verify a code</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Enter the one-time code sent to your registered contact to continue.
        </p>
      </div>

      {serverError ? (
        <Alert variant="error" className="mb-5" title="Verification failed">
          {serverError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
        <Field label="Verification purpose" htmlFor="purpose">
          <Select
            id="purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value as Purpose)}
          >
            <option value="RESET_PASSWORD">Password reset</option>
            <option value="VERIFY_CONTACT">Contact verification</option>
          </Select>
        </Field>

        <Field label="Email or mobile number" htmlFor="identifier" error={error?.includes("email") ? error : undefined} required>
          <Input
            id="identifier"
            autoComplete="username"
            placeholder="Registered email or mobile"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              if (error) setError(null);
            }}
            autoFocus
          />
        </Field>

        <Field label="Verification code" htmlFor="code" error={error?.includes("code") ? error : undefined} required>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              if (error) setError(null);
            }}
            className="font-mono text-base tracking-[0.35em]"
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Verifying…" : "Verify code"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        Need a new code?{" "}
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          Request one
        </Link>
      </p>
    </div>
  );
}
