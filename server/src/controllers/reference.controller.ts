import type { Request, Response } from 'express';
import { ok } from '../utils/response';
import { getCatalogs, listOfficers } from '../services/reference.service';

export async function catalogsController(_req: Request, res: Response): Promise<void> {
  ok(res, await getCatalogs());
}

export async function officersController(req: Request, res: Response): Promise<void> {
  ok(res, await listOfficers(req));
}
