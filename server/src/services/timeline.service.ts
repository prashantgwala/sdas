import type { ClientSession } from 'mongoose';
import { TimelineEvent } from '../models/grievance';
import type { TimelineVisibility } from '../config/constants';

interface TimelineInput {
  entityType: 'GRIEVANCE' | 'FILE' | 'APPLICATION' | 'MEETING' | 'INCIDENT' | 'ROAD_REPORT' | 'TASK';
  entityId: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  actor?: string | null;
  visibility?: TimelineVisibility;
  message?: string;
  metadata?: Record<string, unknown>;
}

export async function addTimeline(
  input: TimelineInput,
  session?: ClientSession,
): Promise<void> {
  await TimelineEvent.create(
    [
      {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actor: input.actor ?? null,
        visibility: input.visibility ?? 'INTERNAL',
        message: input.message,
        metadata: input.metadata,
      },
    ],
    { session },
  );
}
