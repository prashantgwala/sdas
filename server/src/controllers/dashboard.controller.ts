import type { Request, Response } from 'express';
import { ok } from '../utils/response';
import { getDashboard } from '../services/dashboard.service';

export async function dashboardController(req: Request, res: Response): Promise<void> {
  const data = await getDashboard(req);
  ok(res, data);
}
