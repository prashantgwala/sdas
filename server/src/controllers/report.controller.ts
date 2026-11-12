import type { Request, Response } from 'express';
import { ok } from '../utils/response';
import {
  exportReport,
  getDepartmentPerformance,
  getOfficerWorkload,
  getReportSummary,
} from '../services/report.service';

type RangeQuery = { from?: Date; to?: Date; department?: string };

export async function summaryController(req: Request, res: Response): Promise<void> {
  ok(res, await getReportSummary(req, req.validatedQuery as RangeQuery));
}

export async function departmentsController(req: Request, res: Response): Promise<void> {
  ok(res, await getDepartmentPerformance(req, req.validatedQuery as RangeQuery));
}

export async function officersController(req: Request, res: Response): Promise<void> {
  ok(res, await getOfficerWorkload(req, req.validatedQuery as RangeQuery));
}

export async function exportController(req: Request, res: Response): Promise<void> {
  const result = await exportReport(req, req.validatedQuery as never);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', String(result.buffer.length));
  res.send(result.buffer);
}
