import type { Request, Response } from 'express';
import { created, ok } from '../utils/response';
import {
  closeConversation,
  escalateConversation,
  getConversation,
  listConversations,
  sendChatMessage,
  startConversation,
} from '../services/chat.service';
import {
  assignTicket,
  createTicket,
  getTicket,
  listMyTickets,
  listTickets,
  replyToTicket,
  ticketStats,
  updateTicketStatus,
} from '../services/helpdesk.service';

function id(req: Request): string {
  return (req.validatedParams as { id: string }).id;
}

export async function startConversationController(req: Request, res: Response): Promise<void> {
  created(res, await startConversation(req, req.body.language));
}

export async function listConversationsController(req: Request, res: Response): Promise<void> {
  ok(res, await listConversations(req));
}

export async function getConversationController(req: Request, res: Response): Promise<void> {
  ok(res, await getConversation(req, id(req)));
}

export async function sendMessageController(req: Request, res: Response): Promise<void> {
  ok(res, await sendChatMessage(req, id(req), req.body));
}

export async function escalateController(req: Request, res: Response): Promise<void> {
  created(res, await escalateConversation(req, id(req), req.body));
}

export async function closeConversationController(req: Request, res: Response): Promise<void> {
  ok(res, await closeConversation(req, id(req)));
}

/* -------------------------------- helpdesk -------------------------------- */

export async function createTicketController(req: Request, res: Response): Promise<void> {
  created(res, await createTicket(req.body, req));
}

export async function myTicketsController(req: Request, res: Response): Promise<void> {
  const result = await listMyTickets(req);
  ok(res, result.items, result.meta);
}

export async function ticketsController(req: Request, res: Response): Promise<void> {
  const result = await listTickets(req);
  ok(res, result.items, result.meta);
}

export async function ticketDetailController(req: Request, res: Response): Promise<void> {
  ok(res, await getTicket(req, id(req)));
}

export async function replyController(req: Request, res: Response): Promise<void> {
  ok(res, await replyToTicket(req, id(req), req.body));
}

export async function assignController(req: Request, res: Response): Promise<void> {
  ok(res, await assignTicket(req, id(req), req.body));
}

export async function statusController(req: Request, res: Response): Promise<void> {
  ok(res, await updateTicketStatus(req, id(req), req.body));
}

export async function statsController(req: Request, res: Response): Promise<void> {
  ok(res, await ticketStats(req));
}
