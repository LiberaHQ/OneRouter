import { requireAccount } from "@/lib/gateway/request";

export function GET(req: Request) {
  const acct = requireAccount(req);
  if (acct instanceof Response) return acct;
  return Response.json({
    account: acct.id,
    balance_usd: Math.round(acct.balance_usd * 1e6) / 1e6,
    spent_usd: Math.round(acct.spent_usd * 1e6) / 1e6,
    requests: acct.requests,
    created: acct.created,
  });
}
