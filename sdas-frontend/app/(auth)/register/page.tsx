"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, UserRoundPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { ROLE_HOME, type Language } from "@/lib/types";

interface FormState {
  name: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  language: Language;
  accepted: boolean;
}

const initialForm: FormState = {
  name: "",
  email: "",
  mobile: "",
  password: "",
  confirmPassword: "",
  language: "en",
  accepted: false,
};

type Errors = Partial<Record<keyof FormState, string>>;

function validateForm(form: FormState): Errors {
  const errors: Errors = {};
  if (form.name.trim().length < 2) errors.name = "Enter your full name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Enter a valid email address";
  }
  if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) {
    errors.mobile = "Enter a valid 10 digit mobile number";
  }
  if (form.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  } else if (!/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/\d/.test(form.password)) {
    errors.password = "Include uppercase, lowercase and a number";
  }
  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = "Passwords do not match";
  }
  if (!form.accepted) errors.accepted = "Please accept the terms to continue";
  return errors;
}

export default function RegisterPage() {
  const { session, loading, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      router.replace(ROLE_HOME[session.user.role] ?? "/");
    }
  }, [loading, session, router]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    const next = validateForm(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const data = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        password: form.password,
        language: form.language,
      });
      router.replace(ROLE_HOME[data.user.role] ?? "/citizen");
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-rise py-4">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <UserRoundPlus className="size-3" aria-hidden />
          Citizen self-service
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-[26px]">
          Create your citizen account
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Register once to submit grievances, apply for services and track every request.
        </p>
      </div>

      {serverError ? (
        <Alert variant="error" className="mb-5" title="Registration failed">
          {serverError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name} required>
          <Input
            id="name"
            autoComplete="name"
            placeholder="As per your identity documents"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            aria-invalid={Boolean(errors.name)}
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address" htmlFor="email" error={errors.email} required>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
          </Field>
          <Field label="Mobile number" htmlFor="mobile" error={errors.mobile} required>
            <Input
              id="mobile"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              placeholder="10 digit number"
              value={form.mobile}
              onChange={(event) => update("mobile", event.target.value.replace(/\D/g, "").slice(0, 10))}
              aria-invalid={Boolean(errors.mobile)}
            />
          </Field>
        </div>

        <Field
          label="Password"
          htmlFor="password"
          hint="8+ chars, upper, lower, number"
          error={errors.password}
          required
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
            aria-invalid={Boolean(errors.password)}
          />
        </Field>

        <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword} required>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={form.confirmPassword}
            onChange={(event) => update("confirmPassword", event.target.value)}
            aria-invalid={Boolean(errors.confirmPassword)}
          />
        </Field>

        <Field label="Preferred language" htmlFor="language">
          <Select
            id="language"
            value={form.language}
            onChange={(event) => update("language", event.target.value as Language)}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="hinglish">Hinglish</option>
          </Select>
        </Field>

        <div className="space-y-1.5 pt-1">
          <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              checked={form.accepted}
              onChange={(event) => update("accepted", event.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
              aria-invalid={Boolean(errors.accepted)}
            />
            <span>
              I confirm that the information provided is accurate and I consent to its use for
              processing my requests as per the applicable citizen service rules.
            </span>
          </label>
          {errors.accepted ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.accepted}
            </p>
          ) : null}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Creating account…" : "Create account"}
          {!submitting ? <ArrowRight aria-hidden /> : null}
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
