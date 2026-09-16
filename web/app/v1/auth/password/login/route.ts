import { readJson } from "@/lib/gateway/request";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { MAX_FAILURES, signedIn } from "@/lib/gateway/authRoutes";
import { STORE, Store } from "@/lib/gateway/store";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  const address = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const subject = `pw:${address}`;

  if (STORE.failures(subject) >= MAX_FAILURES) {
    return jsonErrorWithMessage(
      "rate_limited",
      "too many failed attempts on this address; wait fifteen minutes or sign in with a one-time code instead"
    );
  }

  const acct = STORE.byIdentity(`email:${address}`);
  // The same answer either way: a login form should not double as a way to find out
  // which addresses are registered.
  if (!acct || !acct.password || !Store.passwordMatches(acct, password)) {
    const count = await STORE.noteFailure(subject);
    const remaining = MAX_FAILURES - count;
    const suffix = count >= MAX_FAILURES - 3 ? ` (${remaining} attempt${remaining === 1 ? "" : "s"} left)` : "";
    return jsonErrorWithMessage("invalid_api_key", `that email and password do not match${suffix}`);
  }

  await STORE.clearFailures(subject);
  return signedIn(acct, null, { label: address });
}
