---
title: Streaming
nav: Streaming
kicker: Build
description: Server-sent events, unbuffered end to end, with pre-stream failures surfaced as real HTTP errors.
---

Set `"stream": true` on `POST /v1/chat/completions`. The response is server-sent
events, unbuffered end to end, terminated by `data: [DONE]`.

```bash
curl -N {{API}}/chat/completions \
  -H "Authorization: Bearer $ONEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/llama-3.3-70b-instruct",
    "messages": [{"role":"user","content":"ping"}],
    "stream": true,
    "stream_options": {"include_usage": true}
  }'
```

Buffering is disabled at every layer that could introduce it, so tokens reach you as
the upstream produces them rather than in bursts.

## A pre-stream failure is a real HTTP error

OneRouter pulls the **first chunk before returning the response**. That one detail
decides how your client sees a failure:

| When it fails | What your client sees |
|---|---|
| Before the first chunk | A normal HTTP status and an error envelope |
| After the first chunk | `200 OK`, then a terminal error chunk, then `[DONE]` |

Without that first pull, every failure would arrive as `200 OK` with the error
buried inside the event stream — which most SDK error handlers never look at.

## Cost arrives in the final chunk

A stream's headers are written before the first token, so the charge cannot be known
when they are sent. Send `stream_options.include_usage` and the last chunk before
`[DONE]` carries it:

```json
{"usage":{"prompt_tokens":18,"completion_tokens":242,"total_tokens":260,
          "cost":0.000417}}
```

::callout warn On a stream, `x-onerouter-balance-usd` is the balance *before* the request
It is a head-of-response header, so it cannot include a charge that has not happened
yet. Non-streaming responses carry the settled figures in `x-onerouter-cost-usd` and
`x-onerouter-balance-usd` instead.
::

## Aborting

Close the connection and OneRouter aborts the upstream with it, immediately. You are
charged for the tokens generated before the abort, not for the completion you did not
wait for. The usage record is marked `usage_source: estimated_on_abort` — an
estimate, flagged as one, rather than a precise-looking number nobody can verify.

## Running out mid-stream

If the balance reaches zero while tokens are flowing, the stream ends with an
OpenAI-shaped error chunk whose code is `insufficient_credit`, followed by `[DONE]`
and a clean close. Never a silent truncation: a stream that just stops is
indistinguishable from a network fault, and your retry logic cannot tell those apart.

## Retries

Before the first content byte, OneRouter retries another upstream automatically. After
it, the route is committed — see [Failover](/docs/failover) for why that boundary
exists and what it costs you.
