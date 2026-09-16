import { readJson } from "@/lib/gateway/request";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { principal } from "@/lib/gateway/authRoutes";
import { STORE } from "@/lib/gateway/store";
import * as arc from "@/lib/gateway/arc";

// Opens a deposit against the account's own Arc address. Attribution is by address, so
// any amount credits — there is no exact figure to match.
export async function POST(req: Request) {
  const acct = principal(req);
  if (acct instanceof Response) return acct;
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");

  const wanted = Number(body.amount_usd ?? arc.MIN_USD);
  if (!Number.isFinite(wanted)) return jsonErrorWithMessage("invalid_request", "amount_usd must be a number");
  if (wanted < arc.MIN_USD || wanted > 100_000) {
    return jsonErrorWithMessage("invalid_request", `amount_usd must be between ${arc.MIN_USD} and 100000`);
  }

  let deposit;
  try {
    const address = await STORE.arcAddress(acct);
    deposit = await arc.openDeposit(acct.id, address, wanted);
  } catch (err) {
    return jsonErrorWithMessage("invalid_request", `deposits are not available: ${(err as Error).message}`);
  }
  STORE.state.deposits[deposit.reference] = deposit;
  await STORE.persist();
  return Response.json(deposit, { status: 201 });
}
