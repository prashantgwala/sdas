"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, ApiError, errorMessage } from "@/lib/api";

interface DistrictConfig {
  _id?: string;
  name: string;
  code?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  timezone?: string;
  workingDays?: string[];
  holidays?: string[];
  locale?: string;
}

const WEEKDAYS = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];

const DEFAULTS: DistrictConfig = {
  name: "",
  code: "",
  address: "",
  contactEmail: "",
  contactPhone: "",
  timezone: "Asia/Kolkata",
  workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
  holidays: [],
  locale: "en",
};

function toDateInput(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function DistrictConfigForm() {
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    contactEmail: "",
    contactPhone: "",
    timezone: "Asia/Kolkata",
    workingDays: DEFAULTS.workingDays as string[],
    holidays: "",
    locale: "en",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<DistrictConfig>("/admin/district-config")
      .then((config) => {
        if (cancelled) return;
        setForm({
          name: config.name ?? "",
          code: config.code ?? "",
          address: config.address ?? "",
          contactEmail: config.contactEmail ?? "",
          contactPhone: config.contactPhone ?? "",
          timezone: config.timezone ?? "Asia/Kolkata",
          workingDays: config.workingDays?.length ? config.workingDays : (DEFAULTS.workingDays as string[]),
          holidays: (config.holidays ?? []).map(toDateInput).filter(Boolean).join("\n"),
          locale: config.locale ?? "en",
        });
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setForm((current) => ({ ...current, name: "District Office" }));
        } else {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleDay(day: string) {
    setForm((current) => ({
      ...current,
      workingDays: current.workingDays.includes(day)
        ? current.workingDays.filter((value) => value !== day)
        : [...current.workingDays, day],
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    if (form.name.trim().length < 2) {
      setFormError("Enter the district name.");
      return;
    }
    if (!form.workingDays.length) {
      setFormError("Select at least one working day.");
      return;
    }
    const holidays = form.holidays
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (holidays.some((value) => !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime()))) {
      setFormError("Holidays must use the YYYY-MM-DD format, one per line.");
      return;
    }
    setSaving(true);
    try {
      await api.put("/admin/district-config", {
        name: form.name.trim(),
        code: form.code.trim(),
        address: form.address.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        timezone: form.timezone.trim() || "Asia/Kolkata",
        workingDays: form.workingDays,
        holidays,
        locale: form.locale,
      });
      setNotice("District profile saved.");
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading district profile…" />;

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold text-foreground">District profile</h2>
        <p className="text-[11.5px] text-muted-foreground">
          Identity, contact channels and the working calendar used for SLA calculations.
        </p>
      </div>

      {error ? <div className="mb-3"><Alert variant="error">{error}</Alert></div> : null}
      {formError ? <div className="mb-3"><Alert variant="error">{formError}</Alert></div> : null}
      {notice ? <div className="mb-3"><Alert variant="success">{notice}</Alert></div> : null}

      <form onSubmit={save} className="card-surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="District name" htmlFor="district-name" required>
            <Input id="district-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={200} />
          </Field>
          <Field label="District code" htmlFor="district-code" hint="Optional">
            <Input id="district-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={40} />
          </Field>
          <Field label="Contact email" htmlFor="district-email" hint="Public contact shown on notices">
            <Input id="district-email" type="email" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} maxLength={200} />
          </Field>
          <Field label="Contact phone" htmlFor="district-phone" hint="Helpdesk number">
            <Input id="district-phone" value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} maxLength={20} />
          </Field>
          <Field label="Timezone" htmlFor="district-timezone" hint="IANA timezone">
            <Input id="district-timezone" value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} maxLength={60} />
          </Field>
          <Field label="Default language" htmlFor="district-locale">
            <Select id="district-locale" value={form.locale} onChange={(event) => setForm((current) => ({ ...current, locale: event.target.value }))}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Office address" htmlFor="district-address" hint="Optional">
            <Textarea id="district-address" rows={2} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} maxLength={500} />
          </Field>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[12px] font-medium text-foreground">Working days</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const checked = form.workingDays.includes(day.value);
              return (
                <label
                  key={day.value}
                  className={
                    checked
                      ? "cursor-pointer rounded-lg border border-primary bg-primary-soft px-3 py-1.5 text-[12px] font-semibold text-primary"
                      : "cursor-pointer rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:border-ring/40"
                  }
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleDay(day.value)}
                  />
                  {day.label}
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            SLA clocks pause outside working days and on listed holidays.
          </p>
        </div>

        <div className="mt-5">
          <Field label="Holidays" htmlFor="district-holidays" hint="One YYYY-MM-DD date per line">
            <Textarea
              id="district-holidays"
              rows={4}
              value={form.holidays}
              onChange={(event) => setForm((current) => ({ ...current, holidays: event.target.value }))}
              placeholder={"2026-01-26\n2026-08-15"}
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save district profile"}
          </Button>
        </div>
      </form>
    </div>
  );
}
