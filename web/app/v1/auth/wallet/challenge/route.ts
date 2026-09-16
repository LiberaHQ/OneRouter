import { randomBytes } from "node:crypto";
import { readJson } from "@/lib/gateway/request";
import { jsonError, jsonErrorWithMessage } from "@/lib/gateway/errors";
import { STORE } from "@/lib/gateway/store";
import * as auth from "@/lib/gateway/auth";
import { DOMAIN } from "@/lib/content/nav";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  const chain = String(body.chain ?? "arc").toLowerCase();
  const address = String(body.address ?? "").trim();
  if (chain !== "arc" && chain !== "solana") {
    return jsonErrorWithMessage("invalid_request", `unknown chain "${chain}"`);
  }
  if (!address) return jsonErrorWithMessage("invalid_request", "no wallet address was given");

  const nonce = randomBytes(12).toString("hex");
  const message = auth.walletStatement(nonce, DOMAIN, chain);
  const ref = await STORE.stash("wallet", { chain, address, message });
  return Response.json({ ref, message, chain });
}
