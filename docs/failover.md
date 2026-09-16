---
title: Failover and the first byte
nav: Failover
kicker: Operate
description: OneRouter moves between hosts of the same model, never between models — and only before the first byte.
---

OneRouter routes between **hosts of the same model**, never between models. When an
upstream degrades before a response starts, the request moves to the next healthy
host. `x-onerouter-provider` names the host that actually served it.

The one exception is `onerouter/auto`, which resolves to a single named model
*before* the request is priced. After that resolution it behaves like any other
named model: hosts may change, the model does not.

## The first-byte boundary

Everything about failover follows from one line:

::callout Before the first content byte, OneRouter can abort and try the next route. After it, it cannot.
An SSE stream is one logical response. Splicing a second host's tokens into a stream
already in flight would corrupt the output, the tool-call framing, and the client's
parser state — and the client has no way to detect that it happened.
::

| Event | Before first byte | After first byte |
|---|---|---|
| TTFT timeout | Abort, retry the next route | Cannot occur |
| Upstream 5xx | Retry; you pay only the successful attempt | Terminal error; settle what was produced |
| Fallback chain | Full route list still available | Route is committed |

TTFT — time to first token — is the primary health signal precisely because it is
measured while the gateway can still act on it. A metric you can only observe after
you have lost the ability to respond to it is a report, not a signal.

## What it costs you

A retried attempt that produced nothing is not billed. You pay for the attempt that
succeeded.

If an upstream fails *after* streaming began but before it had produced anything
usable — under 50 tokens — the charge is written off automatically. Above that, the
tokens were delivered and they settle: you have output you can use, even if you did
not want it to stop there.

## Pinning a route

Set `provider` to refuse failover and stay on one host:

```json
{
  "model": "meta-llama/llama-3.3-70b-instruct",
  "messages": [{ "role": "user", "content": "ping" }],
  "provider": { "only": ["together"] }
}
```

Pinned means pinned. The request is served on that host or refused with
`503 model_unavailable`, and nothing is charged. It is never quietly moved — a pin
that silently falls back is worse than no pin, because you would stop checking.

## Receipts

Every response carries `x-onerouter-receipt`, a stable id for the route decision that
served it. The dashboard resolves it to the ordered candidate list, which host was
tried, why each earlier one was skipped, and the TTFT of the one that answered.

A failover is a fact recorded on the request, not a claim in a status page.

## Errors on this path

| Code | Meaning |
|---|---|
| [`request_timeout`](/docs/errors#request_timeout) | No first token from any host within the window |
| [`upstream_error`](/docs/errors#upstream_error) | Failure after streaming began; the route was committed |
| [`model_unavailable`](/docs/errors#model_unavailable) | Every host failed. The response names live alternatives |
