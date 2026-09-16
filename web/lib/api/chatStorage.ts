"use client";

// Chat history lives only in this browser's localStorage — never synced, never on the
// server. Capped at 60 conversations, matching the original.
export interface ChatTurn {
  role: "user" | "assistant" | "error";
  content: string;
  model?: string;
  meta?: { provider?: string; cost_usd?: number; ttft_ms?: number; receipt?: string };
}

export interface Conversation {
  id: string;
  title: string;
  turns: ChatTurn[];
}

const CONVOS_KEY = "or-convos";
const MODEL_KEY = "or-model";
const MAX_CONVOS = 60;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadConversations(): Conversation[] {
  try {
    return safeParse<Conversation[]>(localStorage.getItem(CONVOS_KEY), []);
  } catch {
    return [];
  }
}

export function saveConversations(convos: Conversation[]): void {
  try {
    localStorage.setItem(CONVOS_KEY, JSON.stringify(convos.slice(0, MAX_CONVOS)));
  } catch {
    // storage unavailable — history just won't persist
  }
}

export function getLastModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

export function setLastModel(id: string): void {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // storage unavailable
  }
}

export function newConversationId(): string {
  return "c_" + Math.random().toString(36).slice(2, 10);
}
