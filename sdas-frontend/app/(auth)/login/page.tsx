"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { ROLE_HOME } from "@/lib/types";

interface Errors {
  identifier?: string;
  password?: string;
}

export default function LoginPage() {
  const { session, loading, login, logout } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("next");
    if (requested && requested.startsWith("/") && !requested.startsWith("//")) {
      setNextPath(requested);
    }
  }, []);

  useEffect(() => {
    if (!loading && session) {
      router.replace(nextPath ?? ROLE_HOME[session.user.role] ?? "/");
    }
  }, [loading, session, router, nextPath]);

  const validate = (): boolean => {
    const next: Errors = {};
    if (!identifier.trim()) next.identifier = "Enter your email address or mobile number";
    if (!password) next.password = "Enter your password";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const data = await login({ identifier: identifier.trim(), password, remember });
      router.replace(nextPath ?? ROLE_HOME[data.user.role] ?? data.dashboard ?? "/");
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (session) {
    return (
      <div className="animate-fade space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold">You are already signed in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Continue as {session.user.name} · {session.user.role.replaceAll("_", " ").toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.replace(nextPath ?? ROLE_HOME[session.user.role] ?? "/")}>
            Continue to dashboard
            <ArrowRight aria-hidden />
          </Button>
          <Button variant="secondary" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <div className="mb-7">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <LockKeyhole className="size-3" aria-hidden />
          Secure government access
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-[26px]">
          Sign in to your account
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Use the credentials issued by your district administrator.
        </p>
      </div>

      {serverError ? (
        <Alert variant="error" className="mb-5" title="Unable to sign in">
          {serverError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
        <Field label="Email or mobile number" htmlFor="identifier" error={errors.identifier} required>
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            inputMode="email"
            placeholder="name@district.gov.in"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              if (errors.identifier) setErrors((prev) => ({ ...prev, identifier: undefined }));
            }}
            aria-invalid={Boolean(errors.identifier)}
            aria-describedby={errors.identifier ? "identifier-error" : undefined}
            autoFocus
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password} required>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
        </Field>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="size-4 rounded border-input text-primary accent-[var(--primary)]"
            />
            Keep me signed in
          </label>
          <Link
            href="/forgot-password"
            className="text-[13px] font-semibold text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="mt-1 w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Signing in…" : "Sign in"}
          {!submitting ? <ArrowRight aria-hidden /> : null}
        </Button>
      </form>

      <div className="mt-6 rounded-lg border border-border bg-surface-muted/70 px-4 py-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
        New citizen?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create a citizen account
        </Link>{" "}
        to submit grievances and applications online.
      </div>

      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-muted-foreground">
        By signing in you agree to the acceptable use policy. Unauthorized access is prohibited and
        monitored.
      </p>
    </div>
  );
}
