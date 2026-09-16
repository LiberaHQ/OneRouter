---
title: From key to first token
nav: Quickstart
kicker: Start here
description: One base URL. One key. A complete request you can run in about a minute, without creating an account.
time: About 60 seconds
---

OneRouter is an OpenAI-compatible gateway. You change the base URL and the key.
Nothing else in your code moves.

Every value below is literal except the key itself.

## Start without a deposit

The [Open Tier](/docs/open-tier) serves a small daily allowance at a $0 charge,
with no deposit and no money hold. It is the fastest way to prove your client is
wired correctly before any money is involved.

The example on this page uses a paid model, so it also exercises the billing path.

## Your first request, end to end

::steps
1. **Set your key** — one bearer key. Accountless keys work.
2. **Set the base URL** — keep `/v1`; your client appends the endpoint.
3. **Send a request** — choose a client, copy, then stream.
::

::tabs
--- cURL
curl {{API}}/chat/completions \
  -H "Authorization: Bearer $ONEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/llama-3.3-70b-instruct",
    "messages": [{"role":"user","content":"ping"}],
    "stream": true
  }'
--- Python
from openai import OpenAI

client = OpenAI(
    base_url="{{API}}",
    api_key="or-live-...",
)

stream = client.chat.completions.create(
    model="meta-llama/llama-3.3-70b-instruct",
    messages=[{"role": "user", "content": "ping"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
--- Node.js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "{{API}}",
  apiKey: process.env.ONEROUTER_KEY,
});

const stream = await client.chat.completions.create({
  model: "meta-llama/llama-3.3-70b-instruct",
  messages: [{ role: "user", content: "ping" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
--- Go
client := openai.NewClient(
    option.WithBaseURL("{{API}}"),
    option.WithAPIKey(os.Getenv("ONEROUTER_KEY")),
)

stream := client.Chat.Completions.NewStreaming(ctx,
    openai.ChatCompletionNewParams{
        Model: "meta-llama/llama-3.3-70b-instruct",
        Messages: []openai.ChatCompletionMessageParamUnion{
            openai.UserMessage("ping"),
        },
    })
::

::callout The base URL is `{{API}}`
Keep the `/v1`. Do not append `/chat/completions` to a client's base-URL field —
the client adds the endpoint itself. Trimming the `/v1`, or adding the endpoint by
hand, is the most common setup failure by a wide margin.
::

## Read the receipt

Every response carries the facts you need to reconcile it. Nothing about the body
changes: it is the upstream's response, byte for byte.

| Header | Meaning |
|---|---|
| `x-onerouter-model` | The model that actually answered |
| `x-onerouter-provider` | The host that served it |
| `x-onerouter-cost-usd` | Exact charge for this request |
| `x-onerouter-balance-usd` | Balance after it settled |
| `x-onerouter-ttft-ms` | Time to first token, measured at the edge |
| `x-onerouter-receipt` | Stable id for this route decision |

A stream reports its charge as `usage.cost` in the final usage chunk instead —
send `stream_options.include_usage`. See [Streaming](/docs/streaming).

## Per client

[Client setup](/docs/integrations) has literal configuration for Claude Code,
Codex, Cline, Continue, Zed, Aider, LiteLLM, SillyTavern and any other
OpenAI-compatible client.

## When it fails

Every error uses OpenAI's error envelope and carries a stable `code`, and every
message ends in a URL that resolves to an anchor on
[the errors page](/docs/errors).
