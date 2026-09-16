import { readJson } from "@/lib/gateway/request";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { principal, passwordProblem } from "@/lib/gateway/authRoutes";
import { STORE, Store } from "@/lib/gateway/store";

export async function POST(req: Request) {
  const acct = principal(req);
  if (acct instanceof Response) return acct;
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");

  const password = String(body.password ?? "");
  const problem = passwordProblem(password);
  if (problem) return jsonErrorWithMessage("invalid_request", problem);
  if (acct.password && !Store.passwordMatches(acct, String(body.current_password ?? ""))) {
    return jsonErrorWithMessage("invalid_request", "the current password is wrong");
  }
  if (!(acct.identities ?? []).some((i) => i.startsWith("email:"))) {
    return jsonErrorWithMessage(
      "invalid_request",
      "attach an email to this account first — a password needs something to log in with"
    );
  }
  await STORE.setPassword(acct, password);
  return Response.json({ account: acct.id, password_set: true });
}
