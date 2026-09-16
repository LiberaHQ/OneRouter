import { principal } from "@/lib/gateway/authRoutes";
import { STORE } from "@/lib/gateway/store";
import * as arc from "@/lib/gateway/arc";

export async function GET(req: Request) {
  const acct = principal(req);
  if (acct instanceof Response) return acct;
  return Response.json({
    account: acct.id,
    balance_usd: Math.round(acct.balance_usd * 1e6) / 1e6,
    spent_usd: Math.round(acct.spent_usd * 1e6) / 1e6,
    requests: acct.requests,
    identities: acct.identities ?? [],
    arc_address: await STORE.arcAddress(acct),
    arc_chain_id: arc.CHAIN_ID,
  });
}
