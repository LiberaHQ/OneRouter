import { readJson } from "@/lib/gateway/request";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { EMAIL_RE } from "@/lib/gateway/authRoutes";
import { STORE, digest } from "@/lib/gateway/store";
import * as auth from "@/lib/gateway/auth";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  const address = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(address)) {
    return jsonErrorWithMessage("invalid_request", "that does not look like an email address");
  }
  const code = auth.newCode();
  const ref = await STORE.stash("email", { email: address, code_hash: digest(code), tries: 0 });
  try {
    await auth.sendCode(address, code);
  } catch (err) {
    return jsonErrorWithMessage("internal_error", `could not send the code: ${(err as Error).message}`);
  }
  const out: Record<string, unknown> = { ref, expires_in: 600 };
  if (auth.EMAIL_ECHO) {
    // No mail sender is configured, so the code comes back instead. Development only.
    out.code = code;
    out.note = "no mail sender configured — code returned directly";
  }
  return Response.json(out);
}
