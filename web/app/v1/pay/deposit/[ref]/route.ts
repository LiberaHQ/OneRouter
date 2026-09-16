import { jsonErrorWithMessage } from "@/lib/gateway/errors";
import { principal } from "@/lib/gateway/authRoutes";
import { STORE } from "@/lib/gateway/store";
import * as arc from "@/lib/gateway/arc";

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const acct = principal(req);
  if (acct instanceof Response) return acct;
  const { ref } = await params;

  const deposit = STORE.state.deposits[ref];
  if (!deposit || deposit.account !== acct.id) {
    return jsonErrorWithMessage("invalid_request", "no such deposit");
  }

  let newUnits = 0;
  try {
    const result = await arc.check(deposit);
    newUnits = result[1];
  } catch (err) {
    if (err instanceof arc.ChainError) {
      return Response.json({ ...deposit, chain_error: err.message });
    }
    throw err;
  }

  // Credit what actually arrived, once per transaction. arc.check only reports a
  // transfer once it is buried, and never reports the same hash twice.
  if (newUnits) await STORE.credit(acct, arc.usd(newUnits));
  await STORE.persist();
  return Response.json({ ...deposit, balance_usd: Math.round(acct.balance_usd * 1e6) / 1e6 });
}
