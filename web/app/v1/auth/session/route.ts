import { principal } from "@/lib/gateway/authRoutes";
import { STORE } from "@/lib/gateway/store";
import * as arc from "@/lib/gateway/arc";

export async function GET(req: Request) {
  const acct = principal(req);
  if (acct instanceof Response) return acct;
  const storedKey = await STORE.keyFor(acct);
  return Response.json({
    account: acct.id,
    key: storedKey.key,
    balance_usd: Math.round(acct.balance_usd * 1e6) / 1e6,
    spent_usd: Math.round(acct.spent_usd * 1e6) / 1e6,
    requests: acct.requests,
    identities: acct.identities ?? [],
    email: acct.email ?? emailFromIdentities(acct.identities),
    arc_address: await STORE.arcAddress(acct),
    arc_chain_id: arc.CHAIN_ID,
  });
}

function emailFromIdentities(identities: string[] | undefined): string | null {
  const identity = identities?.find((value) => value.startsWith("email:"));
  return identity ? identity.slice("email:".length) : null;
}
