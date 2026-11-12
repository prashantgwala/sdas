import type { Metadata } from "next";
import { ChatbotPanel } from "@/components/support/chatbot-panel";

export const metadata: Metadata = { title: "AI assistant" };

export default function CitizenChatbotPage() {
  return <ChatbotPanel />;
}
