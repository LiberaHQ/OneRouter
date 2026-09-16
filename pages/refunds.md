---
title: Refunds
kicker: Legal
description: Service credit, never cash — and exactly which situations qualify.
updated: 9 September 2026
---

::callout The remedy is service credit. There is no cash path out.
Paying money out would make us a money transmitter, and money transmitters must collect
identity. Not having that path is what keeps this accountless. It is a trade, and this is
the side of it.
::

## What we credit back

- **Our error.** A request billed twice, priced against the wrong model, or charged after a
  failure that produced nothing usable. Credited automatically where detected, on request
  otherwise.
- **A failure before output.** An upstream that dies before the first byte is not billed at
  all. If output had barely started — under 50 tokens — the charge is written off.
- **A wrong-chain deposit**, where recovery is technically possible. Recovery costs are
  deducted. Where the funds are unrecoverable, they are unrecoverable; we will say so rather
  than leave a ticket open.

## What we do not credit back

- Spend you did not intend — a loop, a runaway agent, a prompt larger than you meant. The
  tools to bound this exist before the fact: [per-key limits and budgets](/docs/budgets).
- Output quality. We deliver what the model produced; we do not grade it.
- A change of mind about an unspent balance. Credit does not expire, so there is no deadline
  to be rescued from.

## How to ask

Contact [support](/support) with the receipt id from `x-onerouter-receipt`. That id resolves
to the exact route decision and charge, which is usually enough to settle the question in one
message.
