import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Grievance } from '../models/grievance';
import { DigitalFile } from '../models/file';
import { Application } from '../models/application';
import { MeetingTask } from '../models/meeting';
import { WeatherAlert } from '../models/disaster';
import { JobRun } from '../models/platform';
import { HelpdeskTicket } from '../models/platform';
import { notifyDepartment, notifyRole, notifyUsers } from './notification.service';
import { addDays } from '../utils/dates';

type JobTrigger = 'SCHEDULE' | 'MANUAL';
type JobStats = Record<string, number>;

const GRIEVANCE_COMPLETED = ['RESOLVED', 'CLOSED', 'REJECTED'];
const FILE_COMPLETED = ['COMPLETED', 'ARCHIVED'];
const APPLICATION_COMPLETED = ['APPROVED', 'REJECTED', 'CLOSED'];
const HELPDESK_COMPLETED = ['RESOLVED', 'CLOSED'];
const TASK_COMPLETED = ['COMPLETED', 'CANCELLED'];

const hours = (value: number): number => value * 60 * 60 * 1000;

function escalationLevelFor(overdueMs: number): number {
  const overdueHours = overdueMs / (60 * 60 * 1000);
  if (overdueHours >= 72) return 3;
  if (overdueHours >= 48) return 2;
  if (overdueHours >= 24) return 1;
  return 0;
}

interface SlaEvaluation {
  status: 'WITHIN_TIME' | 'DUE_SOON' | 'OVERDUE' | 'PAUSED';
  dueSoon: boolean;
  overdue: boolean;
  level: number;
}

function evaluateSla(dueAt: Date, now: Date, paused: boolean, dueSoonHours = 24): SlaEvaluation {
  if (paused) return { status: 'PAUSED', dueSoon: false, overdue: false, level: 0 };
  const remaining = dueAt.getTime() - now.getTime();
  if (remaining < 0) {
    return {
      status: 'OVERDUE',
      dueSoon: false,
      overdue: true,
      level: escalationLevelFor(-remaining),
    };
  }
  if (remaining <= hours(dueSoonHours)) {
    return { status: 'DUE_SOON', dueSoon: true, overdue: false, level: 0 };
  }
  return { status: 'WITHIN_TIME', dueSoon: false, overdue: false, level: 0 };
}

async function recordJob(
  jobName: string,
  trigger: JobTrigger,
  run: () => Promise<JobStats>,
): Promise<JobStats> {
  const record = await JobRun.create({
    jobName,
    startedAt: new Date(),
    status: 'RUNNING',
    trigger,
  });
  try {
    const stats = await run();
    await JobRun.updateOne(
      { _id: record._id } as never,
      { $set: { finishedAt: new Date(), status: 'SUCCESS', stats } } as never,
    );
    logger.info({ jobName, stats, trigger }, 'Scheduled job completed');
    return stats;
  } catch (error) {
    await JobRun.updateOne(
      { _id: record._id } as never,
      {
        $set: {
          finishedAt: new Date(),
          status: 'FAILED',
          error: error instanceof Error ? error.message.slice(0, 3000) : String(error).slice(0, 3000),
        },
      } as never,
    );
    logger.error({ err: error, jobName, trigger }, 'Scheduled job failed');
    throw error;
  }
}

async function notifyGrievanceSla(
  doc: {
    _id: unknown;
    grievanceId?: string | null;
    assignedOfficer?: unknown;
    department?: unknown;
    sla?: { dueAt?: Date | null };
  },
  evaluation: SlaEvaluation,
): Promise<void> {
  const label = doc.grievanceId ?? String(doc._id);
  const dueAt = doc.sla?.dueAt ? new Date(doc.sla.dueAt) : null;
  const dueText = dueAt ? dueAt.toISOString().slice(0, 16).replace('T', ' ') : 'the service deadline';
  const title = evaluation.overdue
    ? `Grievance ${label} is overdue`
    : `Grievance ${label} is due soon`;
  const body = evaluation.overdue
    ? `Grievance ${label} crossed ${dueText}. Immediate action is required.`
    : `Grievance ${label} is approaching its deadline of ${dueText}.`;
  const type = evaluation.overdue ? 'GRIEVANCE_OVERDUE' : 'TASK_DEADLINE';
  const dedupeKey = evaluation.overdue
    ? `sla:grievance:${String(doc._id)}:overdue:${evaluation.level}`
    : `sla:grievance:${String(doc._id)}:due-soon`;

  if (doc.assignedOfficer) {
    await notifyUsers([String(doc.assignedOfficer)], {
      type,
      title,
      body,
      entityType: 'Grievance',
      entityId: String(doc._id),
      link: `/officer/grievances/${String(doc._id)}`,
      dedupeKey,
    });
  }
  if (doc.department) {
    await notifyDepartment(String(doc.department), ['DEPARTMENT_HEAD'], {
      type,
      title,
      body,
      entityType: 'Grievance',
      entityId: String(doc._id),
      link: `/dept-head/grievances/${String(doc._id)}`,
      dedupeKey,
    });
  }
  if (evaluation.overdue && evaluation.level >= 2) {
    await notifyRole('DISTRICT_ADMIN', {
      type: 'ESCALATION_ALERT',
      title: `Escalated: grievance ${label}`,
      body: `Grievance ${label} remains overdue beyond ${evaluation.level * 24} hours and requires district review.`,
      entityType: 'Grievance',
      entityId: String(doc._id),
      link: `/district/grievances/${String(doc._id)}`,
      dedupeKey: `sla:grievance:${String(doc._id)}:escalation:${evaluation.level}`,
    });
  }
}

export async function runGrievanceSlaMonitor(now = new Date()): Promise<JobStats> {
  const stats = { evaluated: 0, dueSoon: 0, overdue: 0, escalated: 0, paused: 0 };
  const cursor = Grievance.find({
    'sla.dueAt': { $ne: null },
    status: { $nin: GRIEVANCE_COMPLETED },
  } as never).cursor();

  for await (const doc of cursor) {
    stats.evaluated += 1;
    const dueAt = doc.sla?.dueAt ? new Date(doc.sla.dueAt) : null;
    if (!dueAt) continue;
    const paused = Boolean(doc.sla?.pausedAt && !doc.sla?.resumedAt);
    const evaluation = evaluateSla(dueAt, now, paused);
    if (evaluation.status === 'PAUSED') stats.paused += 1;

    const update: Record<string, unknown> = { 'sla.status': evaluation.status };
    const currentLevel = doc.sla?.escalationLevel ?? 0;
    if (evaluation.overdue) {
      stats.overdue += 1;
      if (evaluation.level > currentLevel) {
        update['sla.escalationLevel'] = evaluation.level;
        if (evaluation.level > 0) stats.escalated += 1;
      }
      if (!doc.sla?.escalatedAt) update['sla.escalatedAt'] = now;
    }
    if (evaluation.dueSoon) stats.dueSoon += 1;

    await Grievance.updateOne(
      { _id: doc._id, status: { $nin: GRIEVANCE_COMPLETED } } as never,
      { $set: update } as never,
    );
    if (evaluation.dueSoon || evaluation.overdue) {
      await notifyGrievanceSla(doc, evaluation);
    }
  }

  return stats;
}

export async function runFileSlaMonitor(now = new Date()): Promise<JobStats> {
  const stats = { evaluated: 0, dueSoon: 0, overdue: 0, escalated: 0, paused: 0 };
  const cursor = DigitalFile.find({
    'sla.dueAt': { $ne: null },
    status: { $nin: FILE_COMPLETED },
  } as never).cursor();

  for await (const doc of cursor) {
    stats.evaluated += 1;
    const dueAt = doc.sla?.dueAt ? new Date(doc.sla.dueAt) : null;
    if (!dueAt) continue;
    const paused = Boolean(doc.sla?.pausedAt && !doc.sla?.resumedAt);
    const evaluation = evaluateSla(dueAt, now, paused);
    if (evaluation.status === 'PAUSED') stats.paused += 1;

    const update: Record<string, unknown> = { 'sla.status': evaluation.status };
    const currentLevel = doc.sla?.escalationLevel ?? 0;
    if (evaluation.overdue) {
      stats.overdue += 1;
      if (evaluation.level > currentLevel) {
        update['sla.escalationLevel'] = evaluation.level;
        if (evaluation.level > 0) stats.escalated += 1;
      }
      if (!doc.sla?.escalatedAt) update['sla.escalatedAt'] = now;
    }
    if (evaluation.dueSoon) stats.dueSoon += 1;

    await DigitalFile.updateOne(
      { _id: doc._id, status: { $nin: FILE_COMPLETED } } as never,
      { $set: update } as never,
    );

    if (!evaluation.dueSoon && !evaluation.overdue) continue;
    const label = doc.fileNumber ?? doc.fileId ?? String(doc._id);
    const title = evaluation.overdue
      ? `File ${label} is overdue`
      : `File ${label} is due soon`;
    const body = evaluation.overdue
      ? `Digital file ${label} has crossed its service deadline and needs immediate action.`
      : `Digital file ${label} is approaching its service deadline.`;
    const type = evaluation.overdue ? 'ESCALATION_ALERT' : 'TASK_DEADLINE';
    const dedupeKey = evaluation.overdue
      ? `sla:file:${String(doc._id)}:overdue:${evaluation.level}`
      : `sla:file:${String(doc._id)}:due-soon`;

    if (doc.currentCustodian) {
      await notifyUsers([String(doc.currentCustodian)], {
        type,
        title,
        body,
        entityType: 'DigitalFile',
        entityId: String(doc._id),
        link: `/officer/files/${String(doc._id)}`,
        dedupeKey,
      });
    }
    if (doc.department) {
      await notifyDepartment(String(doc.department), ['DEPARTMENT_HEAD'], {
        type,
        title,
        body,
        entityType: 'DigitalFile',
        entityId: String(doc._id),
        link: `/dept-head/files/${String(doc._id)}`,
        dedupeKey,
      });
    }
    if (evaluation.overdue && evaluation.level >= 2) {
      await notifyRole('DISTRICT_ADMIN', {
        type: 'ESCALATION_ALERT',
        title: `Escalated: file ${label}`,
        body: `Digital file ${label} remains overdue beyond ${evaluation.level * 24} hours.`,
        entityType: 'DigitalFile',
        entityId: String(doc._id),
        link: `/district/files/${String(doc._id)}`,
        dedupeKey: `sla:file:${String(doc._id)}:escalation:${evaluation.level}`,
      });
    }
  }

  return stats;
}

export async function runApplicationSlaMonitor(now = new Date()): Promise<JobStats> {
  const stats = { evaluated: 0, dueSoon: 0, overdue: 0, escalated: 0, paused: 0 };
  const cursor = Application.find({
    'sla.dueAt': { $ne: null },
    status: { $nin: APPLICATION_COMPLETED },
  } as never).cursor();

  for await (const doc of cursor) {
    stats.evaluated += 1;
    const dueAt = doc.sla?.dueAt ? new Date(doc.sla.dueAt) : null;
    if (!dueAt) continue;
    const paused = Boolean(doc.sla?.pausedAt);
    const evaluation = evaluateSla(dueAt, now, paused);
    if (evaluation.status === 'PAUSED') stats.paused += 1;

    const update: Record<string, unknown> = { 'sla.status': evaluation.status };
    const currentLevel = doc.sla?.escalationLevel ?? 0;
    if (evaluation.overdue) {
      stats.overdue += 1;
      if (evaluation.level > currentLevel) {
        update['sla.escalationLevel'] = evaluation.level;
        if (evaluation.level > 0) stats.escalated += 1;
      }
    }
    if (evaluation.dueSoon) stats.dueSoon += 1;

    await Application.updateOne(
      { _id: doc._id, status: { $nin: APPLICATION_COMPLETED } } as never,
      { $set: update } as never,
    );

    if (!evaluation.dueSoon && !evaluation.overdue) continue;
    const label = doc.applicationId ?? String(doc._id);
    const title = evaluation.overdue
      ? `Application ${label} is overdue`
      : `Application ${label} is due soon`;
    const body = evaluation.overdue
      ? `Application ${label} has crossed its service deadline and needs a decision.`
      : `Application ${label} is approaching its service deadline.`;
    const type = evaluation.overdue ? 'ESCALATION_ALERT' : 'TASK_DEADLINE';
    const dedupeKey = evaluation.overdue
      ? `sla:application:${String(doc._id)}:overdue:${evaluation.level}`
      : `sla:application:${String(doc._id)}:due-soon`;

    if (doc.assignedOfficer) {
      await notifyUsers([String(doc.assignedOfficer)], {
        type,
        title,
        body,
        entityType: 'Application',
        entityId: String(doc._id),
        link: `/officer/applications/${String(doc._id)}`,
        dedupeKey,
      });
    }
    if (doc.assignedClerk) {
      await notifyUsers([String(doc.assignedClerk)], {
        type,
        title,
        body,
        entityType: 'Application',
        entityId: String(doc._id),
        link: `/clerk/applications/${String(doc._id)}`,
        dedupeKey,
      });
    }
    if (doc.department) {
      await notifyDepartment(String(doc.department), ['DEPARTMENT_HEAD'], {
        type,
        title,
        body,
        entityType: 'Application',
        entityId: String(doc._id),
        link: `/dept-head/applications/${String(doc._id)}`,
        dedupeKey,
      });
    }
    if (evaluation.overdue && evaluation.level >= 2) {
      await notifyRole('DISTRICT_ADMIN', {
        type: 'ESCALATION_ALERT',
        title: `Escalated: application ${label}`,
        body: `Application ${label} remains overdue beyond ${evaluation.level * 24} hours.`,
        entityType: 'Application',
        entityId: String(doc._id),
        link: `/district/applications/${String(doc._id)}`,
        dedupeKey: `sla:application:${String(doc._id)}:escalation:${evaluation.level}`,
      });
    }
  }

  return stats;
}

export async function runHelpdeskSlaMonitor(now = new Date()): Promise<JobStats> {
  const stats = { evaluated: 0, overdue: 0 };
  const cursor = HelpdeskTicket.find({
    'sla.dueAt': { $ne: null },
    status: { $nin: HELPDESK_COMPLETED },
  } as never).cursor();

  for await (const ticket of cursor) {
    stats.evaluated += 1;
    const dueAt = ticket.sla?.dueAt ? new Date(ticket.sla.dueAt) : null;
    if (!dueAt) continue;
    const evaluation = evaluateSla(dueAt, now, false);
    const update: Record<string, unknown> = { 'sla.status': evaluation.status };
    if (evaluation.overdue) {
      stats.overdue += 1;
      const currentLevel = ticket.sla?.escalationLevel ?? 0;
      if (evaluation.level > currentLevel) update['sla.escalationLevel'] = evaluation.level;
    }
    await HelpdeskTicket.updateOne(
      { _id: ticket._id, status: { $nin: HELPDESK_COMPLETED } } as never,
      { $set: update } as never,
    );

    if (!evaluation.dueSoon && !evaluation.overdue) continue;
    const label = ticket.ticketId ?? String(ticket._id);
    const title = evaluation.overdue
      ? `Helpdesk ticket ${label} is overdue`
      : `Helpdesk ticket ${label} is due soon`;
    const body = evaluation.overdue
      ? `Helpdesk ticket ${label} has crossed its response deadline.`
      : `Helpdesk ticket ${label} is approaching its response deadline.`;
    const dedupeKey = evaluation.overdue
      ? `sla:helpdesk:${String(ticket._id)}:overdue:${evaluation.level}`
      : `sla:helpdesk:${String(ticket._id)}:due-soon`;
    if (ticket.assignedTo) {
      await notifyUsers([String(ticket.assignedTo)], {
        type: evaluation.overdue ? 'ESCALATION_ALERT' : 'TASK_DEADLINE',
        title,
        body,
        entityType: 'HelpdeskTicket',
        entityId: String(ticket._id),
        link: `/helpdesk/${String(ticket._id)}`,
        dedupeKey,
      });
    }
    if (ticket.department) {
      await notifyDepartment(String(ticket.department), ['DEPARTMENT_HEAD'], {
        type: evaluation.overdue ? 'ESCALATION_ALERT' : 'TASK_DEADLINE',
        title,
        body,
        entityType: 'HelpdeskTicket',
        entityId: String(ticket._id),
        link: `/helpdesk/${String(ticket._id)}`,
        dedupeKey,
      });
    }
  }

  return stats;
}

export async function runTaskDeadlineMonitor(now = new Date()): Promise<JobStats> {
  const stats = { evaluated: 0, overdue: 0, dueSoon: 0 };
  const cursor = MeetingTask.find({
    status: { $in: ['OPEN', 'IN_PROGRESS'] },
  } as never).cursor();

  for await (const task of cursor) {
    stats.evaluated += 1;
    const dueDate = new Date(task.dueDate);
    const evaluation = evaluateSla(dueDate, now, false);
    if (evaluation.overdue) {
      stats.overdue += 1;
      await MeetingTask.updateOne(
        { _id: task._id, status: { $in: ['OPEN', 'IN_PROGRESS'] } } as never,
        { $set: { status: 'OVERDUE' } } as never,
      );
    } else if (evaluation.dueSoon) {
      stats.dueSoon += 1;
    } else {
      continue;
    }

    const label = task.taskId ?? String(task._id);
    await notifyUsers([String(task.assignedTo)], {
      type: 'TASK_DEADLINE',
      title: evaluation.overdue ? `Task ${label} is overdue` : `Task ${label} is due soon`,
      body: evaluation.overdue
        ? `Task ${label} crossed its due date and is now overdue.`
        : `Task ${label} is approaching its due date.`,
      entityType: 'TASK',
      entityId: String(task._id),
      link: `/tasks/${String(task._id)}`,
      dedupeKey: evaluation.overdue
        ? `task:${String(task._id)}:overdue`
        : `task:${String(task._id)}:due-soon`,
    });
  }

  return stats;
}

export async function runWeatherAlertExpiry(now = new Date()): Promise<JobStats> {
  const result = await WeatherAlert.updateMany(
    { active: true, validTo: { $lt: now } } as never,
    { $set: { active: false, status: 'EXPIRED' } } as never,
  );
  return { expired: result.modifiedCount ?? 0 };
}

export async function runRetentionArchival(now = new Date()): Promise<JobStats> {
  const stats = { evaluated: 0, archived: 0 };
  const cursor = DigitalFile.find({
    retentionDays: { $ne: null },
    completedAt: { $ne: null },
    archivedAt: null,
  } as never).cursor();

  for await (const file of cursor) {
    stats.evaluated += 1;
    const retentionDays = file.retentionDays ?? 0;
    if (!file.completedAt || retentionDays <= 0) continue;
    const archiveAt = addDays(new Date(file.completedAt), retentionDays);
    if (archiveAt > now) continue;
    await DigitalFile.updateOne(
      { _id: file._id, archivedAt: null } as never,
      { $set: { status: 'ARCHIVED', archivedAt: now } } as never,
    );
    stats.archived += 1;
  }

  return stats;
}

export async function runSlaMonitor(trigger: JobTrigger = 'MANUAL'): Promise<JobStats> {
  return recordJob('sla-monitor', trigger, async () => {
    const grievance = await runGrievanceSlaMonitor();
    const file = await runFileSlaMonitor();
    const application = await runApplicationSlaMonitor();
    const helpdesk = await runHelpdeskSlaMonitor();
    return {
      grievances: grievance.evaluated,
      grievancesOverdue: grievance.overdue,
      files: file.evaluated,
      filesOverdue: file.overdue,
      applications: application.evaluated,
      applicationsOverdue: application.overdue,
      helpdesk: helpdesk.evaluated,
      helpdeskOverdue: helpdesk.overdue,
    };
  });
}

export async function runTaskMonitor(trigger: JobTrigger = 'MANUAL'): Promise<JobStats> {
  return recordJob('task-deadline', trigger, async () => runTaskDeadlineMonitor());
}

export async function runWeatherMonitor(trigger: JobTrigger = 'MANUAL'): Promise<JobStats> {
  return recordJob('weather-expiry', trigger, async () => runWeatherAlertExpiry());
}

export async function runRetentionMonitor(trigger: JobTrigger = 'MANUAL'): Promise<JobStats> {
  return recordJob('retention-archival', trigger, async () => runRetentionArchival());
}

export const JOB_NAMES = [
  'sla-monitor',
  'task-deadline',
  'weather-expiry',
  'retention-archival',
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export async function runJobByName(name: JobName, trigger: JobTrigger = 'MANUAL'): Promise<JobStats> {
  switch (name) {
    case 'sla-monitor':
      return runSlaMonitor(trigger);
    case 'task-deadline':
      return runTaskMonitor(trigger);
    case 'weather-expiry':
      return runWeatherMonitor(trigger);
    case 'retention-archival':
      return runRetentionMonitor(trigger);
  }
}

const scheduled: ScheduledTask[] = [];

export function startScheduledJobs(): void {
  if (!env.CRON_ENABLED) {
    logger.info('Scheduled jobs are disabled by configuration');
    return;
  }
  if (scheduled.length > 0) return;

  const timezone = 'Asia/Kolkata';
  const guard = (name: string) => async () => {
    try {
      if (name === 'sla-monitor') await runSlaMonitor('SCHEDULE');
      if (name === 'task-deadline') await runTaskMonitor('SCHEDULE');
      if (name === 'weather-expiry') await runWeatherMonitor('SCHEDULE');
      if (name === 'retention-archival') await runRetentionMonitor('SCHEDULE');
    } catch {
      // The failure is recorded in JobRun; keep the scheduler alive.
    }
  };

  scheduled.push(
    cron.schedule('*/15 * * * *', guard('sla-monitor'), { name: 'sla-monitor', noOverlap: true, timezone }),
    cron.schedule('5 * * * *', guard('task-deadline'), { name: 'task-deadline', noOverlap: true, timezone }),
    cron.schedule('*/30 * * * *', guard('weather-expiry'), { name: 'weather-expiry', noOverlap: true, timezone }),
    cron.schedule('15 2 * * *', guard('retention-archival'), { name: 'retention-archival', noOverlap: true, timezone }),
  );
  logger.info('Scheduled maintenance jobs started');
}

export function stopScheduledJobs(): void {
  for (const task of scheduled) {
    void task.stop();
  }
  scheduled.length = 0;
}
