import { STORE, type Account } from "./store";
import { jsonError } from "./errors";

export function bearer(req: Request): string {
  const header = req.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

/** Returns the account for a raw API key, or a ready-to-return error Response. A key
 * that resolves to a revoked account is told so, rather than called invalid — the
 * holder has the right secret and needs to know why it's refused. */
export function requireAccount(req: Request): Account | Response {
  const token = bearer(req);
  if (!token) return jsonError("missing_api_key");
  const acct = STORE.resolve(token);
  if (!acct) {
    return jsonError(STORE.revoked(token) ? "account_suspended" : "invalid_api_key");
  }
  return acct;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}
