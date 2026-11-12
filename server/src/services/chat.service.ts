import { Types } from 'mongoose';
import type { Request } from 'express';
import { ChatConversation } from '../models/platform';
import { User } from '../models/user';
import { AppError } from '../middleware/error';
import { answerFromKnowledge } from './ai.service';
import { createTicket } from './helpdesk.service';
import { recordAudit } from './audit.service';

type Language = 'en' | 'hi' | 'hinglish';

async function preferredLanguage(req: Request): Promise<Language> {
  const user = await User.findById(req.user!.id).select('preferences.language').lean();
  const language = (user?.preferences as { language?: Language } | undefined)?.language;
  return language ?? 'en';
}

function toObjectId(id: string): Types.ObjectId | null {
  return /^[a-f\d]{24}$/i.test(id) ? new Types.ObjectId(id) : null;
}

export async function startConversation(req: Request, language?: Language) {
  const existing = await ChatConversation.findOne({
    user: req.user!.id,
    status: { $in: ['ACTIVE', 'ESCALATED'] },
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (existing) return existing;

  const conversation = await ChatConversation.create({
    user: new Types.ObjectId(req.user!.id),
    language: language ?? (await preferredLanguage(req)),
    status: 'ACTIVE',
    messages: [
      {
        role: 'ASSISTANT',
        content:
          'Namaste! I can help with grievances, applications, file tracking and district services using approved knowledge articles. Ask your question or request a human agent.',
        language: language ?? 'en',
        confidence: 1,
      },
    ],
  });
  return conversation.toObject();
}

export async function listConversations(req: Request) {
  return ChatConversation.find({ user: req.user!.id } as never)
    .populate('handoffTicket', 'ticketId status subject')
    .sort({ updatedAt: -1 })
    .limit(30)
    .lean();
}

export async function getConversation(req: Request, id: string) {
  const conversation = await ChatConversation.findOne({ _id: id, user: req.user!.id } as never)
    .populate('handoffTicket', 'ticketId status subject')
    .lean();
  if (!conversation) throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  return conversation;
}

export async function sendChatMessage(
  req: Request,
  id: string,
  input: { content: string; language?: Language },
) {
  const conversation = await ChatConversation.findOne({ _id: id, user: req.user!.id } as never);
  if (!conversation) throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  if (conversation.status === 'CLOSED') {
    throw new AppError(422, 'This conversation is closed. Start a new conversation.', 'INVALID_STATE');
  }

  const language = (input.language ?? conversation.language ?? 'en') as Language;
  conversation.language = language;
  conversation.messages.push({
    role: 'USER',
    content: input.content,
    language,
    at: new Date(),
  });

  const answer = await answerFromKnowledge(input.content, language);
  conversation.messages.push({
    role: 'ASSISTANT',
    content: answer.answer,
    language,
    sources: answer.sources
      .map((source) => toObjectId(source.id))
      .filter((value): value is Types.ObjectId => value !== null),
    confidence: answer.confidence,
    at: new Date(),
  });
  if (answer.escalated && conversation.status === 'ACTIVE') {
    conversation.status = 'ESCALATED';
  }
  await conversation.save();

  return {
    conversation: conversation.toObject(),
    answer,
  };
}

export async function escalateConversation(
  req: Request,
  id: string,
  input: { subject?: string; description?: string },
) {
  const conversation = await ChatConversation.findOne({ _id: id, user: req.user!.id } as never);
  if (!conversation) throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  if (conversation.handoffTicket) {
    const ticket = await ChatConversation.findById(conversation._id)
      .populate('handoffTicket')
      .lean();
    return { conversation, ticket: ticket?.handoffTicket ?? null, alreadyEscalated: true };
  }

  const lastUserMessage = [...conversation.messages]
    .reverse()
    .find((message) => message.role === 'USER' && message.content.trim().length > 0);
  const subject = input.subject ?? `Chatbot handoff: ${req.user!.name}`;
  const description =
    input.description ??
    (lastUserMessage?.content
      ? `Citizen requested a human agent after asking: ${lastUserMessage.content.slice(0, 1500)}`
      : 'Citizen requested human assistance from the chatbot.');

  const ticket = await createTicket(
    {
      subject: subject.slice(0, 250),
      category: 'CHATBOT_HANDOFF',
      description,
      priority: 'NORMAL',
    },
    req,
  );

  conversation.handoffTicket = new Types.ObjectId(String(ticket._id));
  conversation.status = 'ESCALATED';
  await conversation.save();

  await recordAudit(req, {
    action: 'CHATBOT_ESCALATED',
    entityType: 'ChatConversation',
    entityId: String(conversation._id),
    entityLabel: subject,
    after: { ticketId: ticket.ticketId },
  });
  return { conversation: conversation.toObject(), ticket, alreadyEscalated: false };
}

export async function closeConversation(req: Request, id: string) {
  const conversation = await ChatConversation.findOne({ _id: id, user: req.user!.id } as never);
  if (!conversation) throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  conversation.status = 'CLOSED';
  await conversation.save();
  return conversation.toObject();
}
