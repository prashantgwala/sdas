"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { rememberResetIdentifier } from "@/lib/auth-storage";

interface ForgotResponse {
  message: string;
  masked: string;
  delivery: string;
  devCode?: string;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<ForgotResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    if (identifier.trim().length < 3) {
      setError("Enter your registered email address or mobile number");
      return;
    }
    setSubmitting(true);
    try {
      const data = await api.post<ForgotResponse>("/auth/forgot-password", {
        identifier: identifier.trim(),
      });
      rememberResetIdentifier(identifier.trim());
      setResult(data);
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="animate-rise">
        <span className="grid size-12 place-items-center rounded-2xl bg-success-soft text-success">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{result.message}</p>

        <div className="mt-5 rounded-lg border border-border bg-surface-muted/70 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sent to
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">{result.masked}</p>
        </div>

        {result.devCode ? (
          <Alert variant="warning" className="mt-4" title="Development delivery">
            Email/SMS delivery is not configured, so the verification code is shown here:{" "}
            <span className="font-mono text-base font-bold tracking-[0.2em]">{result.devCode}</span>
          </Alert>
        ) : null}

        <div className="mt-6 space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={() => router.push(result.devCode ? `/reset-password?code=${result.devCode}` : "/reset-password")}
          >
            Enter verification code
            <ArrowRight aria-hidden />
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setResult(null);
              setSubmitting(false);
            }}
          >
            Use a different email or mobile
          </Button>
        </div>

        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <KeyRound className="size-3" aria-hidden />
          Account recovery
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-[26px]">Forgot your password?</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Enter the email address or mobile number registered with your account. We will send a
          6-digit verification code.
        </p>
      </div>

      {serverError ? (
        <Alert variant="error" className="mb-5" title="Could not send code">
          {serverError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
        <Field label="Email or mobile number" htmlFor="identifier" error={error ?? undefined} required>
          <Input
            id="identifier"
            autoComplete="username"
            placeholder="name@example.com or 9876543210"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            autoFocus
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Sending code…" : "Send verification code"}
        </Button>
      </form>

      <div className="mt-6 text-center text-[13px] text-muted-foreground">
        <Link href="/login" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
