import { STORE } from "@/lib/gateway/store";
import { jsonErrorWithMessage } from "@/lib/gateway/errors";

// One-shot pickup for the OAuth callback's redirect handoff (see
// app/v1/auth/oauth/google/callback/route.ts) — the signin page fetches this exactly
// once, then the ref is gone.
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const row = await STORE.take(ref, "oauth_result");
  if (!row) return jsonErrorWithMessage("invalid_request", "that sign-in result has already been read or expired");
  return Response.json(row.result);
}
