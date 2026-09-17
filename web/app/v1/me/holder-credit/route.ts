import { principal } from "@/lib/gateway/authRoutes";
import { jsonErrorWithMessage } from "@/lib/gateway/errors";
import { holderSnapshot, HOLDER_TOKEN } from "@/lib/gateway/holderCredits";
import { STORE } from "@/lib/gateway/store";

export async function GET(req: Request) {
  const acct = principal(req);
  if (acct instanceof Response) return acct;
  const wallet = acct.identities.find((identity) => identity.startsWith("arc:"))?.slice(4) ?? "";
  const period = new Date().toISOString().slice(0, 7);
  const claimed = wallet ? STORE.holderClaim(wallet, HOLDER_TOKEN, period)?.credited_usd ?? 0 : 0;
  try {
    return Response.json(await holderSnapshot(acct, claimed));
  } catch {
    return jsonErrorWithMessage("upstream_error", "Arc could not read the ONE balance. Try again shortly.");
  }
}

export async function POST(req: Request) {
  const acct = principal(req);
  if (acct instanceof Response) return acct;
  let snapshot;
  try {
    const wallet = acct.identities.find((identity) => identity.startsWith("arc:"))?.slice(4) ?? "";
    const period = new Date().toISOString().slice(0, 7);
    const claimed = wallet ? STORE.holderClaim(wallet, HOLDER_TOKEN, period)?.credited_usd ?? 0 : 0;
    snapshot = await holderSnapshot(acct, claimed);
  } catch {
    return jsonErrorWithMessage("upstream_error", "Arc could not read the ONE balance. Try again shortly.");
  }
  if (!snapshot.wallet) return jsonErrorWithMessage("invalid_request", snapshot.reason ?? "An Arc wallet is required.");
  if (snapshot.claimable_usd <= 0) {
    return Response.json({ ...snapshot, credited_usd: 0, balance_usd: acct.balance_usd });
  }
  try {
    const result = await STORE.applyHolderCredit(
      acct.id,
      snapshot.wallet,
      snapshot.token,
      snapshot.period,
      snapshot.entitlement_usd,
      snapshot.token_balance
    );
    return Response.json({ ...snapshot, ...result, claimable_usd: 0 });
  } catch (error) {
    return jsonErrorWithMessage("invalid_request", (error as Error).message);
  }
}
