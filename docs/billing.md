---
title: Billing
nav: Billing
kicker: Operate
description: Prepaid credit, metered in nano-USD. Every constraint here is stated before you pay.
---

Credit is prepaid and denominated in dollars. There is no plan, no subscription and
no invoice: you deposit, you spend, the balance goes down.

| Term | Value | Why |
|---|---|---|
| Unit | 1 credit = $1 | No second currency to reason about |
| Metering | nano-USD | A 500-token call does not round to zero |
| Minimum deposit | $0.50 direct, $5 via aggregator | Flat network fees set the floor |
| Withdrawals | None | Credit buys inference; there is no redemption path |
| Expiry | Never | Expiring credit is a dark pattern |
| Markup | 0% on open-weight routes | See below |

## What a request costs

Charges are metered in nano-USD, so nothing rounds to zero. Every response reports
its own charge — `x-onerouter-cost-usd` on a non-streaming response,
`usage.cost` in the final chunk of a stream. That figure is the customer charge,
provider cost plus markup, and it is the same number the dashboard shows.

You do not have to trust the pricing page. Every call carries its own receipt.

## Open Tier billing

The [Open Tier](/docs/open-tier) has a permanent $0 customer charge and takes no
money hold at all. Adding credit does not turn it into a paid request, and having a
balance does not make it fall back to a paid model.

Delivery can show as successful in Activity while provider-cost verification is still
pending. Your charge stays $0 either way; an unexpected provider cost is ours.

## Deposits only, by design

There is no withdrawal endpoint. **Not disabled — absent.**

::callout A service that pays money out is a money transmitter
Money transmitters must collect identity. That obligation is the thing that makes
every competing product ask for a name. Not having a withdrawal path is what lets
this one stay accountless and cheap. It is a trade, and this is the side of it.
::

Lose an accountless key and its recovery link, and the balance goes with them —
permanently. Stated here, before payment, rather than in the terms.

## Refunds

The remedy for our mistakes is service credit to your balance, never cash. There is
no cash path out, by design; see above. The full policy, including wrong-chain
deposit recovery, is in [the refunds policy](/legal/refunds).

## Cards and chargebacks

Where card checkout is configured it carries the processor's cost, passed through and
shown before payment, with a higher minimum than the crypto rails.

Card-funded credit is tracked separately. A chargeback posts a reversing ledger
transaction — taking the balance negative if the credit was already spent — and
suspends the account pending resolution with
[`account_suspended`](/docs/errors#account_suspended).

## Running low

Three things happen, in this order:

::steps
1. **`x-onerouter-balance-usd`** rides on every response. This is the signal to warn
   on. Everything after this point is already a degraded experience.
2. **`max_tokens` is clamped** to what the balance affords where possible, and the
   response is flagged with `x-onerouter-max-tokens-clamped: true`. Your last $0.30
   still works.
3. **A pre-request [`402`](/docs/errors#insufficient_credit)** once the balance is
   below the request's worst-case estimate. Nothing is sent and nothing is charged.
::

Accounts with a verified email can opt into low-balance alerts. Accountless keys
cannot — there is nothing to send them to — which is exactly why the header exists on
every single response.
