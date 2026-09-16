import { readJson } from "@/lib/gateway/request";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { signedIn } from "@/lib/gateway/authRoutes";
import { STORE } from "@/lib/gateway/store";
import * as auth from "@/lib/gateway/auth";

export async function POST(req: Request) {
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
  const [acct, minted] = await STORE.signIn(`${row.chain}:${address.toLowerCase()}`);
  return signedIn(acct, minted, { label: address, chain: row.chain });
}
