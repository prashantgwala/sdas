export function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

export function parseDuration(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? 0);
}

export function startOfDay(date = new Date()): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date = new Date()): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function isWithinHours(date: Date, hours: number): boolean {
  return date.getTime() - Date.now() <= hours * 60 * 60 * 1000;
}

export type ComputedSlaStatus = 'WITHIN_TIME' | 'DUE_SOON' | 'OVERDUE' | 'PAUSED' | 'COMPLETED';

export function computeSlaStatus(
  dueAt: Date | null | undefined,
  options: { paused?: boolean; completed?: boolean; dueSoonHours?: number; now?: Date } = {},
): ComputedSlaStatus {
  if (options.completed) return 'COMPLETED';
  if (options.paused) return 'PAUSED';
  if (!dueAt) return 'WITHIN_TIME';
  const now = options.now ?? new Date();
  if (dueAt.getTime() < now.getTime()) return 'OVERDUE';
  const dueSoonHours = options.dueSoonHours ?? 24;
  if (dueAt.getTime() - now.getTime() <= dueSoonHours * 60 * 60 * 1000) return 'DUE_SOON';
  return 'WITHIN_TIME';
}

export function daysPending(date: Date | null | undefined): number {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}
