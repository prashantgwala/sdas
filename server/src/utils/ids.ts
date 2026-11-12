import { Counter } from '../models/platform';

export async function nextSequence(prefix: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = `${prefix}-${year}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  const value = counter?.value ?? 1;
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
}
