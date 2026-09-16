import { NextResponse } from "next/server";
import { subst, SITE, BRAND, API } from "@/lib/content/nav";

export function GET() {
  const text = subst(`# Configuring ${BRAND}

Base URL: ${API}
Auth header: Authorization: Bearer or-live-<32 base58>
Environment variable used in every example: ONEROUTER_KEY
Get a key: ${SITE}/keys (no account required, keys exist before payment)

## Working request

curl ${API}/chat/completions \\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"meta-llama/llama-3.3-70b-instruct","messages":[{"role":"user","content":"ping"}]}'

## Rules that prevent the common failures

1. The base URL already ends in /v1. Never append /chat/completions to a base-URL field.
2. Model IDs are author/name. Client aliases such as "sonnet" are not model IDs.
3. Confirm any model id against ${SITE}/api/v1/catalog before using it.
4. Send onerouter/auto to let the gateway choose; onerouter/auto:free costs $0.
5. Every error carries a stable code documented at ${SITE}/docs/errors#<code>.

## Recovery

401 invalid_api_key      -> the key is wrong or revoked; mint a new one.
402 insufficient_credit  -> add credit; the message names the shortfall.
404 unknown_model        -> use the did-you-mean id from the message.
429 rate_limited         -> honour Retry-After, then retry unchanged.
503 model_unavailable    -> retry, or use an alternative named in the message.

Full corpus: ${SITE}/llms-full.txt
`);
  return new NextResponse(text, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
