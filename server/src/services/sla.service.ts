import type { Priority } from '../config/constants';
import { SLARule } from '../models/grievance';
import { addHours, computeSlaStatus, type ComputedSlaStatus } from '../utils/dates';

const DEFAULT_RESOLUTION_HOURS: Record<Priority, number> = {
  URGENT: 24,
  HIGH: 72,
  NORMAL: 168,
  LOW: 360,
};

const DEFAULT_RESPONSE_HOURS: Record<Priority, number> = {
  URGENT: 2,
  HIGH: 8,
  NORMAL: 24,
  LOW: 48,
};

export interface SlaDefinition {
  responseHours: number;
  resolutionHours: number;
  dueSoonHours: number;
  escalationHours: number[];
}

export async function getSlaDefinition(
  entityType: 'GRIEVANCE' | 'FILE' | 'APPLICATION' | 'TASK',
  categoryId: string | null | undefined,
  priority: Priority,
): Promise<SlaDefinition> {
  const rule =
    (categoryId
      ? await SLARule.findOne({ entityType, category: categoryId, priority, active: true }).lean()
      : null) ??
    (await SLARule.findOne({ entityType, category: null, priority, active: true }).lean());

  if (rule) {
    return {
      responseHours: rule.responseHours,
      resolutionHours: rule.resolutionHours,
      dueSoonHours: rule.dueSoonHours,
      escalationHours: rule.escalationHours,
    };
  }

  return {
    responseHours: DEFAULT_RESPONSE_HOURS[priority],
    resolutionHours: DEFAULT_RESOLUTION_HOURS[priority],
    dueSoonHours: 24,
    escalationHours: [24, 48, 72],
  };
}

export async function calculateDueDate(
  entityType: 'GRIEVANCE' | 'FILE' | 'APPLICATION' | 'TASK',
  categoryId: string | null | undefined,
  priority: Priority,
  baseDate = new Date(),
): Promise<{ dueAt: Date; definition: SlaDefinition }> {
  const definition = await getSlaDefinition(entityType, categoryId, priority);
  return {
    dueAt: addHours(baseDate, definition.resolutionHours),
    definition,
  };
}

export function slaStatusFor(
  dueAt: Date | null | undefined,
  options: { paused?: boolean; completed?: boolean; dueSoonHours?: number } = {},
): ComputedSlaStatus {
  return computeSlaStatus(dueAt, options);
}
