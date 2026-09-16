import type { Metadata } from "next";
import { loadModels } from "@/lib/content/data";
import { ChatApp } from "@/components/chat/ChatApp";
import { BRAND, API } from "@/lib/content/nav";
import type { ChatModel } from "@/components/chat/types";

export const metadata: Metadata = {
  title: `Chat · ${BRAND}`,
  description: "Talk to any model in the catalog from the browser, over the same OpenAI-compatible endpoint your code uses.",
  alternates: { canonical: "/chat" },
};

export default function ChatPage() {
  const models = loadModels();
  const chatModels: ChatModel[] = models.map((m) => ({
    id: m.id,
    name: m.name,
    author: m.author,
    in: m.per_m.in,
    out: m.per_m.out,
    ctx: m.context_length,
    free: m.tags.includes("free"),
  }));
  const defaultModel =
    models.find((m) => m.id === "openai/gpt-4o-mini") ?? models.find((m) => m.per_m.in > 0) ?? models[0];

  return <ChatApp models={chatModels} defaultModelId={defaultModel.id} apiUrl={API} brand={BRAND} />;
}
