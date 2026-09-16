---
title: The Open Tier
nav: Open Tier
kicker: Start here
description: A $0 charge with no deposit and no money hold, subject to availability and account-wide quotas.
---

Send `onerouter/auto:free` and the request is served at a **$0 customer charge**, with
no deposit and no money hold. It exists so a client can be proved correct before
any money is involved.

::callout warn The Open Tier never falls back to paid
Not when your balance is healthy, not when free capacity is exhausted. If no free
route can serve the request you get `503 no_free_route` and nothing is charged.
Bare `onerouter/auto` is the paid router and always was.
::

## Get started

::steps
1. Check availability at [`/models/auto/free`](/models/auto/free).
2. Create a key. Save the key and its recovery link.
3. Set `ONEROUTER_KEY` locally and send the request below.
::

```bash
curl {{API}}/chat/completions \
  -H "Authorization: Bearer $ONEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"onerouter/auto:free",
       "messages":[{"role":"user","content":"Explain an API gateway in one sentence."}],
       "max_tokens":256}'
```

The response names the answering model in `x-onerouter-model` and reports zero in
`x-onerouter-cost-usd` and `usage.cost`. No balance header is sent, because no balance
was consulted.

## Supported requests

Chat Completions (`/v1/chat/completions`) and Messages (`/v1/messages`) both accept
JSON and SSE. Start with text. Responses (`/v1/responses`) is not implemented and
answers [400 unsupported_endpoint](/docs/errors#unsupported_endpoint).

- Use `max_tokens` on either shape.
- Add `stream: true` for SSE.
- Do **not** send routing overrides — `models`, `provider`, `route` or `fallbacks`.
  A free request that also asks to be routed somewhere specific is refused with
  `400 invalid_request` rather than silently ignored.

Features the free route cannot validate are refused rather than approximated.

## Account limits

Quotas are per **account**, not per key. Creating a second key does not create a
second allowance, and adding credit does not raise one.

| Limit | Allowance |
|---|---|
| Concurrent requests | 1 |
| Requests per minute | 5 |
| Requests per UTC day | 50 |
| Input + output tokens per UTC day | 100,000 |
| Estimated input per request | 16,000 tokens |
| Output per request | 2,048 max, 1,024 by default |

The router reserves the input/output token bound **before** dispatch and reconciles
against verified usage afterwards, so concurrent requests cannot slip past a cap a
serial request would have hit. A dispatched failure still consumes request quota.

Daily allowances reset at 00:00 UTC. `GET /v1/me/open-tier` returns eligibility,
remaining requests and tokens, `resets_at`, and the current per-request caps.

## Refusals

| Code | Meaning |
|---|---|
| `429 free_quota_exceeded` | Allowance spent. Wait for `Retry-After`. Adding credit does not help. |
| `503 no_free_route` | No verified free capacity right now. Retry later; it will not switch to paid. |
| `400 invalid_request` | An unsupported feature or a routing override. Simplify the request. |

## Open Tier, chat trial, and paid auto

Three different things share the word "free". They are not interchangeable:

::cards
- **Open Tier** — `onerouter/auto:free` in the API and the signed-in playground. Daily
  quotas, permanent $0 charge.
- **Chat trial** — a small message allowance in the browser chat at
  [`/chat`](/chat). Covers browser chat only, never integration API requests.
- **Paid auto** — `onerouter/auto` and the `:fast` / `:cheap` / `:code` / `:long`
  intents. Uses your balance and takes a normal hold.
::

::callout warn A $0 catalog price is not the Open Tier
A model priced at zero in the catalog is still a paid route: it takes a hold, it
counts against your key's limits, and it is not admitted without a balance. Only
`onerouter/auto:free` and the model it currently resolves to use the free path.
::
