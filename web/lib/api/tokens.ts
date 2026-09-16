"use client";

// or-key / or-session live separately in localStorage, matching the gateway's dual
// token model: /v1/me, /v1/me/open-tier, /v1/receipts/*, /v1/chat/completions and
// /v1/messages accept ONLY a raw key; /v1/auth/session, /v1/pay/deposit and
// /v1/auth/password/set accept EITHER, session preferred. Keeping these as distinct
// functions (rather than one "isLoggedIn" boolean) makes that asymmetry visible at
// every call site instead of a runtime-only convention.
const KEY_STORAGE = "or-key";
const SESSION_STORAGE = "or-session";

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
  return safeGet(KEY_STORAGE);
}
export function setKey(key: string): void {
  safeSet(KEY_STORAGE, key);
}
export function clearKey(): void {
  safeRemove(KEY_STORAGE);
}

export function getSession(): string | null {
  return safeGet(SESSION_STORAGE);
}
export function setSession(session: string): void {
  safeSet(SESSION_STORAGE, session);
}
export function clearSession(): void {
  safeRemove(SESSION_STORAGE);
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
