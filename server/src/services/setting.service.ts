import { SystemSetting } from '../models/platform';
import { logger } from '../config/logger';

const CACHE_TTL_MS = 15_000;

let cache: Record<string, unknown> | null = null;
let loadedAt = 0;
let inflight: Promise<Record<string, unknown>> | null = null;

async function loadSettings(): Promise<Record<string, unknown>> {
  const rows = await SystemSetting.find({}).select('key value').lean();
  const map: Record<string, unknown> = {};
  for (const row of rows) map[row.key] = row.value;
  cache = map;
  loadedAt = Date.now();
  return map;
}

async function allSettings(): Promise<Record<string, unknown>> {
  if (cache && Date.now() - loadedAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = loadSettings()
    .catch((error) => {
      logger.warn({ err: error }, 'Unable to load system settings; using defaults');
      return cache ?? {};
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const settings = await allSettings();
  return Object.prototype.hasOwnProperty.call(settings, key) ? (settings[key] as T) : fallback;
}

export async function getPositiveNumberSetting(key: string, fallback: number): Promise<number> {
  const value = await getSetting<unknown>(key, fallback);
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function invalidateSettingCache(): void {
  cache = null;
  loadedAt = 0;
}
