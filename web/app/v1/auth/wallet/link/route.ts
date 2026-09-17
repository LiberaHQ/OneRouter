import { readJson } from "@/lib/gateway/request";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { principal } from "@/lib/gateway/authRoutes";
import { STORE } from "@/lib/gateway/store";
import * as auth from "@/lib/gateway/auth";

// Distinct from /v1/auth/wallet/verify: that route signs *in*, which for a wallet
// address the store hasn't seen before means minting a brand-new account — wrong for
// someone who's already signed in (by email, Google, or another wallet) and just
// wants to attach this wallet to prove token holdings for the *current* account. This
// links the verified address as an additional identity instead, refusing if it's
// already claimed by a different account (STORE.link's existing guard).
export async function POST(req: Request) {
  const acct = principal(req);
  if (acct instanceof Response) return acct;

  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  const row = await STORE.take(String(body.ref ?? ""), "wallet");
  if (!row) return jsonErrorWithMessage("invalid_request", "that challenge has expired; start again");

  const signature = String(body.signature ?? "");
  let address: string;
  try {
    address =
      row.chain === "arc"
        ? auth.verifyEvmWallet(row.address as string, row.message as string, signature)
        : auth.verifyWallet(row.address as string, row.message as string, signature);
  } catch (err) {
    if (err instanceof auth.AuthError) return jsonErrorWithMessage("invalid_request", err.message);
    throw err;
  }

  const identity = `${row.chain}:${address.toLowerCase()}`;
  try {
    await STORE.link(acct, identity);
  } catch (err) {
    return jsonErrorWithMessage("invalid_request", (err as Error).message);
  }
  return Response.json({ linked: true, chain: row.chain, address, identities: acct.identities });
}
