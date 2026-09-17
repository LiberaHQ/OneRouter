"use client";

// Chat history lives only in this browser's localStorage — never synced, never on the
// server. Each account gets its own key so users sharing a browser never share a
// conversation list. Histories are capped at 60 conversations per account.
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

const CONVOS_KEY_PREFIX = "or-convos:";
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

function conversationsKey(accountId: string): string {
  return CONVOS_KEY_PREFIX + encodeURIComponent(accountId);
}

export function loadConversations(accountId: string): Conversation[] {
  try {
    return safeParse<Conversation[]>(localStorage.getItem(conversationsKey(accountId)), []);
  } catch {
    return [];
  }
}

export function saveConversations(accountId: string, convos: Conversation[]): void {
  try {
    localStorage.setItem(conversationsKey(accountId), JSON.stringify(convos.slice(0, MAX_CONVOS)));
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
