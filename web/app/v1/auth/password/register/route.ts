import { readJson } from "@/lib/gateway/request";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { EMAIL_RE, passwordProblem, signedIn } from "@/lib/gateway/authRoutes";
import { STORE } from "@/lib/gateway/store";

// Whether an address is already registered is not a secret worth keeping here: the
// alternative is telling someone their new account exists when it does not, and then
// failing them at every login. It is stated plainly instead.
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  const address = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!EMAIL_RE.test(address)) {
    return jsonErrorWithMessage("invalid_request", "that does not look like an email address");
  }
  const problem = passwordProblem(password);
  if (problem) return jsonErrorWithMessage("invalid_request", problem);
  if (STORE.byIdentity(`email:${address}`)) {
    return jsonErrorWithMessage("invalid_request", "that address already has an account — log in instead");
  }

  const [acct, minted] = await STORE.signIn(`email:${address}`);
  await STORE.setPassword(acct, password);
  return signedIn(acct, minted, { label: address });
}
