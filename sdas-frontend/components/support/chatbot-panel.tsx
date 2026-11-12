"use client";

import Link from "next/link";
import { Bot, Headset, MessageCirclePlus, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import type { ChatConversation, ChatLanguage, ChatSendResult, HelpdeskTicketSummary } from "./types";

const LANGUAGES: Array<{ value: ChatLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "hinglish", label: "Hinglish" },
];

const SUGGESTIONS = [
  "How do I track the status of my grievance?",
  "Which documents are needed for a birth certificate application?",
  "How can I reopen a closed grievance?",
  "What is the service deadline for my complaint?",
];

interface EscalationResult {
  conversation: ChatConversation;
  ticket?: HelpdeskTicketSummary | null;
  alreadyEscalated?: boolean;
}

export function ChatbotPanel() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<ChatLanguage>("en");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .list<ChatConversation>("/chat/conversations", { signal: controller.signal })
      .then((result) => {
        setConversations(result.items);
        const open = result.items.find((item) => item.status === "ACTIVE") ?? result.items.find((item) => item.status === "ESCALATED");
        setActiveId(open?._id ?? result.items[0]?._id ?? null);
        if (open?.language) setLanguage(open.language);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const active = conversations.find((item) => item._id === activeId) ?? null;
  const handoff =
    typeof active?.handoffTicket === "string"
      ? { _id: active.handoffTicket }
      : active?.handoffTicket ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeId, active?.messages.length]);

  async function startConversation(): Promise<ChatConversation> {
    const conversation = await api.post<ChatConversation>("/chat/conversations", { language });
    setConversations((current) => [conversation, ...current.filter((item) => item._id !== conversation._id)]);
    setActiveId(conversation._id);
    return conversation;
  }

  async function send(content: string) {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      let conversation = active;
      if (!conversation || conversation.status === "CLOSED") {
        conversation = await startConversation();
      }
      const result = await api.post<ChatSendResult>(`/chat/conversations/${conversation._id}/messages`, {
        content: text,
        language,
      });
      setConversations((current) => [
        result.conversation,
        ...current.filter((item) => item._id !== result.conversation._id),
      ]);
      setActiveId(result.conversation._id);
      setInput("");
      if (result.answer.escalated) {
        setNotice("I could not find an approved knowledge article for this. Use “Talk to a human” to raise a support ticket.");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  async function escalate() {
    if (!active) return;
    setEscalating(true);
    setError("");
    setNotice("");
    try {
      const result = await api.post<EscalationResult>(`/chat/conversations/${active._id}/escalate`, {});
      setConversations((current) =>
        current.map((item) =>
          item._id === result.conversation._id
            ? {
                ...result.conversation,
                handoffTicket: result.ticket
                  ? {
                      _id: result.ticket._id,
                      ticketId: result.ticket.ticketId,
                      status: result.ticket.status,
                      subject: result.ticket.subject,
                    }
                  : result.conversation.handoffTicket,
              }
            : item,
        ),
      );
      if (result.ticket) {
        setNotice(
          `Support ticket ${result.ticket.ticketId ?? ""} has been created. You can follow the conversation from your helpdesk.`,
        );
      } else {
        setNotice("This conversation is already linked to a support ticket.");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setEscalating(false);
    }
  }

  async function closeConversation() {
    if (!active) return;
    setError("");
    try {
      const conversation = await api.post<ChatConversation>(`/chat/conversations/${active._id}/close`);
      setConversations((current) =>
        current.map((item) => (item._id === conversation._id ? conversation : item)),
      );
      setNotice("Conversation closed. You can start a new one any time.");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div>
      <PageHeader
        title="AI assistant"
        description="Ask about grievances, applications, documents and district services. Answers are generated only from approved knowledge articles."
        eyebrow="Support"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setError("");
              setNotice("");
              void startConversation().catch((cause) => setError(errorMessage(cause)));
            }}
          >
            <MessageCirclePlus className="size-3.5" aria-hidden />
            New conversation
          </Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4">
          <Alert variant="info">{notice}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <SectionCard title="Conversations" description="Your recent chats" contentClassName="p-3 sm:p-3">
          {loading ? (
            <LoadingBlock label="Loading chats…" />
          ) : conversations.length === 0 ? (
            <p className="px-1 py-4 text-center text-[11.5px] text-muted-foreground">
              No conversations yet. Ask a question to begin.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {conversations.map((conversation) => {
                const lastMessage = conversation.messages[conversation.messages.length - 1];
                return (
                  <li key={conversation._id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(conversation._id);
                        setNotice("");
                        setError("");
                      }}
                      className={cn(
                        "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                        activeId === conversation._id
                          ? "border-primary/35 bg-primary-soft/60"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11.5px] font-semibold text-foreground">
                          {lastMessage?.content?.slice(0, 42) ?? "New conversation"}
                        </span>
                        <StatusBadge status={conversation.status} />
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {conversation.messages.length} messages · {relativeTime(conversation.updatedAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="District assistant"
          description="Answers cite approved articles only. Verify important information with the concerned office."
          action={
            active ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label="Assistant language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as ChatLanguage)}
                  className="h-8 rounded-lg border border-input bg-surface px-2 text-[11.5px]"
                >
                  {LANGUAGES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {active.status !== "CLOSED" ? (
                  <Button variant="ghost" size="sm" onClick={() => void closeConversation()}>
                    Close chat
                  </Button>
                ) : null}
              </div>
            ) : null
          }
          contentClassName="p-0"
        >
          {loading ? (
            <LoadingBlock label="Loading assistant…" />
          ) : !active ? (
            <div className="px-5 py-10">
              <EmptyState
                title="Ask the district assistant"
                description="Start a conversation to get answers about services, documents and service deadlines."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setError("");
                      void startConversation().catch((cause) => setError(errorMessage(cause)));
                    }}
                  >
                    <Bot className="size-3.5" aria-hidden />
                    Start conversation
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="flex h-[560px] flex-col">
              <div className="scrollbar-slim flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
                {active.messages.map((message, index) => {
                  const isUser = message.role === "USER";
                  return (
                    <div key={`${message.at ?? ""}-${index}`} className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
                      <span
                        className={cn(
                          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                          isUser ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
                        )}
                      >
                        {isUser ? <UserRound className="size-3.5" aria-hidden /> : <Bot className="size-3.5" aria-hidden />}
                      </span>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                          isUser
                            ? "rounded-tr-sm bg-primary text-primary-foreground"
                            : "rounded-tl-sm border border-border bg-surface text-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        {!isUser ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            {typeof message.confidence === "number" && message.confidence < 1 ? (
                              <span className="inline-flex items-center gap-1">
                                <ShieldCheck className="size-3" aria-hidden />
                                Knowledge confidence {Math.round(message.confidence * 100)}%
                              </span>
                            ) : null}
                            {message.sources?.length ? (
                              <span className="inline-flex items-center gap-1">
                                <Sparkles className="size-3" aria-hidden />
                                {message.sources.length} approved source{message.sources.length > 1 ? "s" : ""}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {active.status === "CLOSED" ? (
                <div className="border-t border-border px-4 py-4 sm:px-5">
                  <p className="mb-2 text-[11.5px] text-muted-foreground">
                    This conversation is closed. Start a new conversation to continue.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      setError("");
                      void startConversation().catch((cause) => setError(errorMessage(cause)));
                    }}
                  >
                    Start new conversation
                  </Button>
                </div>
              ) : (
                <div className="border-t border-border px-4 py-3 sm:px-5">
                  {active.messages.filter((message) => message.role === "USER").length === 0 ? (
                    <div className="mb-2.5 flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => void send(suggestion)}
                          disabled={sending}
                          className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void send(input);
                    }}
                    className="flex items-end gap-2"
                  >
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void send(input);
                        }
                      }}
                      rows={2}
                      maxLength={5000}
                      placeholder="Type your question…"
                      aria-label="Message"
                      className="scrollbar-slim min-h-[42px] flex-1 resize-none rounded-lg border border-input bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
                    />
                    <Button type="submit" size="sm" disabled={sending || !input.trim()} className="h-[42px]">
                      <Send className="size-3.5" aria-hidden />
                      {sending ? "Sending…" : "Send"}
                    </Button>
                  </form>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground">
                      AI answers are suggestions. Always confirm with the concerned office.
                    </p>
                    {handoff?._id ? (
                      <Link
                        href={`/citizen/helpdesk/${handoff._id}`}
                        className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary hover:underline"
                      >
                        <Headset className="size-3" aria-hidden />
                        {handoff.ticketId ?? "Support ticket"}
                      </Link>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => void escalate()} disabled={escalating}>
                        <Headset className="size-3.5" aria-hidden />
                        {escalating ? "Creating ticket…" : "Talk to a human"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
