---
title: Budgets and rate limits
nav: Budgets
kicker: Operate
description: Four per-key limits, plus named budgets that several keys can share. All enforced at the edge.
---

Three ceilings sit between a runaway agent and your balance: the balance itself,
the limits on the key, and the budget the key draws from.

## 1. The balance is a hard ceiling

Credit is prepaid, so the worst case is bounded by what you deposited. There is no
credit line to exceed and no invoice arriving afterwards.

The corollary is worth stating plainly: there are **no withdrawals**, so keep the
balance small deliberately rather than treating it as a cash position.

## 2. Per-key limits

Enforced at the edge, per key:

| Field | Enforces |
|---|---|
| `rpm_limit` | Requests per minute |
| `tpm_limit` | Estimated input + output tokens per minute |
| `daily_limit_usd` | Spend per UTC day |
| `monthly_limit_usd` | Spend per calendar month |

Defaults are lower for accountless keys, and every limit can be raised per key.

::callout Open reservations count immediately
A request's worst-case estimate is reserved before dispatch, not after settlement.
That is what stops a burst of ten concurrent requests slipping past a cap that a
serial request would have hit — the tenth request sees the first nine's holds.
::

## 3. Named budgets

A budget is a spend ceiling that several keys share. It is the answer to "I want my
six agents to cost at most $20 a day *between them*", which per-key caps cannot
express.

```bash
curl {{API}}/budgets \
  -H "Authorization: Bearer $ONEROUTER_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"name":"nightly-agents","daily_limit_usd":20,"keys":["or_7f2","or_9d1"]}'
```

A key belongs to at most one budget. When the budget is spent, every key on it stops
with `429 budget_exhausted`, naming the budget and the figure. Keys with no budget
are bounded only by their own limits and the balance.

## What a 429 must tell you

Every 429 carries `Retry-After` and names both the limit that was reached and where
to change it.

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 12

{"error":{"message":"Rate limited: this key allows 60 requests/minute.
 Raise it at {{SITE}}/keys",
 "type":"rate_limit_error","code":"rate_limited"}}
```

A 429 that names neither the limit nor the knob is a dead end, and an agent hitting
one has no move except to sleep and hope.

## Setting the number

Cost one turn, multiply by the turns you expect in a day, set the cap above that and
below what you would mind losing. Round up.

::callout warn A cap that trips during normal operation is worse than no cap
It trains you to raise it without reading it. Then the one time it fires for a real
reason, you raise it without reading it.
::

## Size limits

| Limit | Behaviour |
|---|---|
| Request body over 10 MB | `413 payload_too_large`, refused before the body is read in full |
| Prompt over the model's window | `400 context_too_long`, naming both token counts |

## What hitting a ceiling looks like

- **Before any tokens** — `402` naming the shortfall, nothing sent, nothing charged.
- **Mid-stream** — a terminal error chunk stating the exact charge for tokens already
  delivered, then `[DONE]` and a clean close. Never a silent truncation.
- **At a rate cap** — `429` with `Retry-After`, naming the limit and where to raise it.

Every response carries `x-onerouter-balance-usd`. That is the signal to warn on, well
before the 402.
