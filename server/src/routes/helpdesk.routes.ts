import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error';
import { idParam } from '../validators/common';
import {
  chatCreateSchema,
  chatEscalateSchema,
  chatMessageSchema,
  createTicketSchema,
  ticketAssignSchema,
  ticketListQuery,
  ticketReplySchema,
  ticketStatusSchema,
} from '../validators/helpdesk';
import {
  assignController,
  closeConversationController,
  createTicketController,
  escalateController,
  getConversationController,
  listConversationsController,
  myTicketsController,
  replyController,
  sendMessageController,
  startConversationController,
  statsController,
  statusController,
  ticketDetailController,
  ticketsController,
} from '../controllers/helpdesk.controller';

export const chatRouter = Router();

chatRouter.use(authenticate, requirePermission('chatbot.use'));

chatRouter.post(
  '/conversations',
  validate({ body: chatCreateSchema }),
  asyncHandler(startConversationController),
);
chatRouter.get('/conversations', asyncHandler(listConversationsController));
chatRouter.get(
  '/conversations/:id',
  validate({ params: idParam }),
  asyncHandler(getConversationController),
);
chatRouter.post(
  '/conversations/:id/messages',
  validate({ params: idParam, body: chatMessageSchema }),
  asyncHandler(sendMessageController),
);
chatRouter.post(
  '/conversations/:id/escalate',
  validate({ params: idParam, body: chatEscalateSchema }),
  asyncHandler(escalateController),
);
chatRouter.post(
  '/conversations/:id/close',
  validate({ params: idParam }),
  asyncHandler(closeConversationController),
);

export const helpdeskRouter = Router();

helpdeskRouter.use(authenticate);

helpdeskRouter.get(
  '/mine',
  requirePermission('helpdesk.read.own'),
  validate({ query: ticketListQuery }),
  asyncHandler(myTicketsController),
);
helpdeskRouter.get(
  '/stats',
  requireAnyPermission('helpdesk.read.dept', 'helpdesk.read.district'),
  asyncHandler(statsController),
);
helpdeskRouter.get(
  '/',
  requireAnyPermission('helpdesk.read.dept', 'helpdesk.read.district'),
  validate({ query: ticketListQuery }),
  asyncHandler(ticketsController),
);
helpdeskRouter.post(
  '/',
  requirePermission('helpdesk.create'),
  validate({ body: createTicketSchema }),
  asyncHandler(createTicketController),
);
helpdeskRouter.get(
  '/:id',
  requireAnyPermission('helpdesk.read.own', 'helpdesk.read.dept', 'helpdesk.read.district'),
  validate({ params: idParam }),
  asyncHandler(ticketDetailController),
);
helpdeskRouter.post(
  '/:id/messages',
  requireAnyPermission('helpdesk.reply', 'helpdesk.create'),
  validate({ params: idParam, body: ticketReplySchema }),
  asyncHandler(replyController),
);
helpdeskRouter.post(
  '/:id/assign',
  requirePermission('helpdesk.assign'),
  validate({ params: idParam, body: ticketAssignSchema }),
  asyncHandler(assignController),
);
helpdeskRouter.post(
  '/:id/status',
  requirePermission('helpdesk.close'),
  validate({ params: idParam, body: ticketStatusSchema }),
  asyncHandler(statusController),
);
