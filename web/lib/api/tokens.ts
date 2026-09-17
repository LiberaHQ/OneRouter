"use client";

// The login session persists in localStorage. The API key does not: it is stored on
// the account server-side and held in module memory only while this page is open.
// getKey() performs a one-time migration of the old localStorage value by removing
// it immediately after reading it.
const KEY_STORAGE = "or-key";
const SESSION_STORAGE = "or-session";
const AUTH_CHANGE_EVENT = "onerouter:auth-change";
let memoryKey: string | null = null;

function announceAuthChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable — nothing persists this session
  }
}
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
}

export function getKey(): string | null {
  if (memoryKey) return memoryKey;
  const legacyKey = safeGet(KEY_STORAGE);
  if (legacyKey) {
    memoryKey = legacyKey;
    safeRemove(KEY_STORAGE);
  }
  return memoryKey;
}
export function setKey(key: string): void {
  memoryKey = key;
  safeRemove(KEY_STORAGE);
}
export function clearKey(): void {
  memoryKey = null;
  safeRemove(KEY_STORAGE);
}

export function getSession(): string | null {
  return safeGet(SESSION_STORAGE);
}
export function setSession(session: string): void {
  safeSet(SESSION_STORAGE, session);
  announceAuthChange();
}
export function clearSession(): void {
  safeRemove(SESSION_STORAGE);
  announceAuthChange();
}

export function onAuthChange(callback: () => void): () => void {
  window.addEventListener(AUTH_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** session() || key() — matches routes_auth.principal()'s preference order for the
 * dashboard-shaped endpoints that accept either. */
export function principal(): string | null {
  return getSession() || getKey();
}

export function hasKey(): boolean {
  return !!getKey();
}
export function hasSession(): boolean {
  return !!getSession();
}
