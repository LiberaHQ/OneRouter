import { requireAccount, readJson } from "@/lib/gateway/request";
import { STORE } from "@/lib/gateway/store";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { DEV_CREDIT } from "@/lib/gateway/config";

export async function POST(req: Request) {
  // Stands in for the payment rails. Real deposits settle on-chain or through the
  // card processor; this exists so the paid path can be exercised.
  if (!DEV_CREDIT) {
    return jsonErrorWithMessage(
      "unsupported_endpoint",
      "development crediting is off; set ONEROUTER_DEV_CREDIT=1 to enable it, or fund the key through a payment rail"
    );
  }
  const acct = requireAccount(req);
  if (acct instanceof Response) return acct;
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  const amount = Number(body.amount_usd ?? 0);
  if (!Number.isFinite(amount)) return jsonError("invalid_request", "amount_usd must be a number");
  if (!(amount > 0 && amount <= 1000)) return jsonError("invalid_request", "amount_usd must be 0-1000");
  await STORE.credit(acct, amount);
  return Response.json({ balance_usd: Math.round(acct.balance_usd * 1e6) / 1e6 });
}
