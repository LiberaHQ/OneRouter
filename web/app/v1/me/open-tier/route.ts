import { requireAccount } from "@/lib/gateway/request";
import { STORE, FREE_REQUESTS_PER_DAY, FREE_TOKENS_PER_DAY, FREE_MAX_OUTPUT } from "@/lib/gateway/store";

export function GET(req: Request) {
  const acct = requireAccount(req);
  if (acct instanceof Response) return acct;
  const quota = STORE.openTier(acct);
  const resetsAt = new Date(Date.now() + 86400_000);
  resetsAt.setUTCHours(0, 0, 0, 0);
  return Response.json({
    eligible: true,
    requests_remaining: Math.max(0, FREE_REQUESTS_PER_DAY - quota.requests),
    tokens_remaining: Math.max(0, FREE_TOKENS_PER_DAY - quota.tokens),
    resets_at: resetsAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    max_output_per_request: FREE_MAX_OUTPUT,
  });
}
