import { timingSafeEqual } from "node:crypto";
import { bearer } from "@/lib/gateway/request";
import { jsonErrorWithMessage } from "@/lib/gateway/errors";
import { sweepDue, configured, sweepThresholdUsd } from "@/lib/gateway/treasury";

// Manual/cron trigger for the batched treasury settlement — real on-chain transfers,
// so it needs its own shared-secret gate rather than the account-scoped session/key
// auth every other route uses. Unset ONEROUTER_ADMIN_TOKEN refuses every call, not
// just unauthenticated ones — there is no safe default here.
export async function POST(req: Request) {
  const expected = process.env.ONEROUTER_ADMIN_TOKEN || "";
  const given = bearer(req);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const authorized = expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  if (!authorized) return jsonErrorWithMessage("missing_api_key", "admin token missing or wrong");

  const [ready, why] = configured();
  if (!ready) return jsonErrorWithMessage("invalid_request", `treasury sweep is not available: ${why}`);

  const url = new URL(req.url);
  const minUsd = Number(url.searchParams.get("min_usd") ?? sweepThresholdUsd());
  const results = await sweepDue(minUsd);
  const total = Math.round(results.reduce((sum, r) => sum + r.swept_usd, 0) * 1e6) / 1e6;
  return Response.json({ swept_accounts: results.length, total_usd: total, results });
}
