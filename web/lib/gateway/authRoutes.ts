// Shared helpers for the sign-in and deposit routes. Ported from routes_auth.py.
import { timingSafeEqual } from "node:crypto";
import { STORE, digest, type Account } from "./store";
import { bearer } from "./request";
import { jsonErrorWithMessage } from "./errors";

const SESSION_PREFIX = "or-sess-";

/** The account behind either a session token or an API key — both identify the same
 * account, and either is enough for the dashboard-shaped routes. */
export function principal(req: Request): Account | Response {
  const token = bearer(req);
  if (!token) return jsonErrorWithMessage("missing_api_key", "sign in or send a key");
  if (token.startsWith(SESSION_PREFIX)) {
    const acct = STORE.session(token);
    return acct ?? jsonErrorWithMessage("invalid_api_key", "session expired — sign in again");
  }
  const acct = STORE.resolve(token);
  return acct ?? jsonErrorWithMessage("invalid_api_key", "invalid key");
}

/** One shape for every successful sign-in, so the front end has one thing to read. */
export async function signedInBody(
  acct: Account,
  minted: { key: string; recovery: string } | null,
  extra: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const token = await STORE.openSession(acct);
  const storedKey = minted?.key ?? (await STORE.keyFor(acct)).key;
  const body: Record<string, unknown> = {
    session: token,
    key: storedKey,
    account: acct.id,
    balance_usd: Math.round(acct.balance_usd * 1e6) / 1e6,
    identities: acct.identities ?? [],
    new_account: Boolean(minted),
  };
  // The recovery secret exists for exactly one response. The API key is account data
  // and is returned again after authenticated sign-in.
  if (minted) {
    body.recovery = minted.recovery;
  }
  return { ...body, ...extra };
}

export async function signedIn(
  acct: Account,
  minted: { key: string; recovery: string } | null,
  extra: Record<string, unknown> = {}
): Promise<Response> {
  return Response.json(await signedInBody(acct, minted, extra));
}

export const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/** Shared by verify and attach. Returns the pending row, or an error Response. */
export async function checkCode(body: Record<string, unknown>): Promise<Record<string, unknown> | Response> {
  const ref = String(body.ref ?? "");
  const row = STORE.peek(ref, "email");
  if (!row) return jsonErrorWithMessage("invalid_request", "that code has expired; ask for a new one");
  if ((await STORE.bump(ref, "tries")) > 5) {
    await STORE.take(ref, "email");
    return jsonErrorWithMessage("invalid_request", "too many attempts; ask for a new code");
  }
  const given = digest(String(body.code ?? "").trim());
  const expected = row.code_hash as string;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const matches = a.length === b.length && timingSafeEqual(a, b);
  if (!matches) return jsonErrorWithMessage("invalid_request", "that code is not right");
  await STORE.take(ref, "email");
  return row;
}

// ── Passwords ─────────────────────────────────────────────────────────────────
export const MIN_PASSWORD = 10;
export const MAX_FAILURES = 8;
const OBVIOUS = new Set([
  "password", "password123", "12345678901", "qwertyuiop", "letmein123", "changeme123", "administrator",
]);

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `a password needs at least ${MIN_PASSWORD} characters`;
  if (OBVIOUS.has(password.toLowerCase())) return "that password is one of the first anyone tries";
  if (new Set(password).size < 4) return "that password repeats too few distinct characters";
  return null;
}
