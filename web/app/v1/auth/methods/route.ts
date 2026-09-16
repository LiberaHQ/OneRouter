import * as auth from "@/lib/gateway/auth";
import { googleReady } from "@/lib/gateway/google";

export function GET() {
  const methods = auth.available() as Record<string, Record<string, unknown>>;
  methods.wallet.chains = ["arc", "solana"];
  methods.google = { ready: googleReady(), note: googleReady() ? "" : "not configured" };
  return Response.json({ methods, origins: auth.ORIGINS });
}
