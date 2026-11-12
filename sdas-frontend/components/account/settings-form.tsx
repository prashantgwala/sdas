"use client";

import { Check, KeyRound, Monitor, Moon, Palette, Save, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { PageHeader, SectionCard } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { Language } from "@/lib/types";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
type Layout = "comfortable" | "compact";

const SIDEBAR_KEY = "sdas:sidebar-collapsed";

const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "hinglish", label: "Hinglish" },
];

export function SettingsForm() {
  const { user, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [layout, setLayout] = useState<Layout>("comfortable");
  const [language, setLanguage] = useState<Language>("en");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [preferenceNotice, setPreferenceNotice] = useState("");

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  useEffect(() => {
    if (!user) return;
    setLayout(user.preferences?.layout ?? "comfortable");
    setLanguage(user.preferences?.language ?? "en");
    setSidebarCollapsed(
      user.preferences?.sidebarCollapsed ?? window.localStorage.getItem(SIDEBAR_KEY) === "1",
    );
  }, [user]);

  if (!user) {
    return (
      <div className="card-surface p-5">
        <LoadingBlock label="Loading preferences…" />
      </div>
    );
  }

  async function savePreferences() {
    setPreferenceError("");
    setPreferenceNotice("");
    setSavingPreferences(true);
    try {
      await api.patch<{ preferences: unknown }>("/auth/preferences", {
        theme,
        layout,
        language,
        sidebarCollapsed,
      });
      window.localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0");
      await refreshProfile();
      setPreferenceNotice("Preferences saved.");
    } catch (cause) {
      setPreferenceError(errorMessage(cause));
    } finally {
      setSavingPreferences(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");

    if (!passwords.current) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (passwords.next.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (!/[a-z]/.test(passwords.next) || !/[A-Z]/.test(passwords.next) || !/\d/.test(passwords.next)) {
      setPasswordError("New password must include upper case, lower case and a number.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    if (passwords.next === passwords.current) {
      setPasswordError("Choose a password different from your current password.");
      return;
    }

    setSavingPassword(true);
    try {
      await api.post<{ message: string }>("/auth/change-password", {
        currentPassword: passwords.current,
        newPassword: passwords.next,
      });
      setPasswords({ current: "", next: "", confirm: "" });
      setPasswordNotice("Password changed. Other active sessions have been signed out.");
    } catch (cause) {
      setPasswordError(errorMessage(cause));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Choose how SDAS looks for you and keep your sign-in secure."
        eyebrow="Account"
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <SectionCard title="Appearance" description="Theme, density and sidebar defaults">
            <div className="space-y-5">
              {preferenceError ? <Alert variant="error">{preferenceError}</Alert> : null}
              {preferenceNotice ? <Alert variant="success">{preferenceNotice}</Alert> : null}

              <div>
                <Label>Theme</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {THEMES.map((option) => {
                    const Icon = option.icon;
                    const active = theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex h-11 items-center gap-2 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors",
                          active
                            ? "border-primary/45 bg-primary-soft text-primary"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {option.label}
                        {active ? <Check className="ml-auto size-3.5" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Theme is applied immediately and remembered on this device.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Layout density" htmlFor="settings-layout">
                  <Select
                    id="settings-layout"
                    value={layout}
                    onChange={(event) => setLayout(event.target.value as Layout)}
                  >
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </Select>
                </Field>
                <Field label="Preferred language" htmlFor="settings-language">
                  <Select
                    id="settings-language"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value as Language)}
                  >
                    {LANGUAGES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={sidebarCollapsed}
                  onChange={(event) => setSidebarCollapsed(event.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                />
                <span>
                  <span className="block text-[12.5px] font-semibold text-foreground">Collapse sidebar by default</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Shows icon-only navigation on desktop. You can still expand it from the header.
                  </span>
                </span>
              </label>

              <div className="flex justify-end border-t border-border pt-4">
                <Button onClick={() => void savePreferences()} disabled={savingPreferences}>
                  <Save className="size-3.5" aria-hidden />
                  {savingPreferences ? "Saving…" : "Save preferences"}
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Change password" description="Use a strong password that you do not reuse elsewhere">
            <form onSubmit={changePassword} className="space-y-4" noValidate>
              {passwordError ? <Alert variant="error">{passwordError}</Alert> : null}
              {passwordNotice ? <Alert variant="success">{passwordNotice}</Alert> : null}

              <Field label="Current password" htmlFor="current-password" required>
                <Input
                  id="current-password"
                  type="password"
                  value={passwords.current}
                  onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))}
                  autoComplete="current-password"
                  maxLength={128}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="New password" htmlFor="new-password" hint="Min 8 chars" required>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwords.next}
                    onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))}
                    autoComplete="new-password"
                    maxLength={128}
                  />
                </Field>
                <Field label="Confirm new password" htmlFor="confirm-password" required>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={passwords.confirm}
                    onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))}
                    autoComplete="new-password"
                    maxLength={128}
                  />
                </Field>
              </div>
              <p className="rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Use at least 8 characters with upper case, lower case and a number. Changing your password signs out
                other sessions.
              </p>
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" variant="secondary" disabled={savingPassword}>
                  <KeyRound className="size-3.5" aria-hidden />
                  {savingPassword ? "Updating…" : "Update password"}
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>

        <SectionCard title="Session & security" description="What this account can do">
          <dl className="space-y-3 text-[12px]">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2.5">
              <dt className="text-muted-foreground">Signed in as</dt>
              <dd className="text-right font-semibold text-foreground">{user.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2.5">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-semibold text-foreground">{user.role.replaceAll("_", " ")}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2.5">
              <dt className="text-muted-foreground">Department</dt>
              <dd className="text-right font-semibold text-foreground">{user.departmentName ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Account status</dt>
              <dd className="font-semibold text-foreground">{user.status}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-lg border border-border bg-surface-muted/60 p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground">
              <Palette className="size-3.5 text-primary" aria-hidden />
              Accessibility
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Compact density reduces whitespace in lists and headers. System theme follows your operating system
              setting automatically.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
