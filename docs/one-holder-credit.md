---
title: ONE holder credit
nav: ONE credit
kicker: Operate
description: A monthly balance credit for accounts that link an Arc wallet holding ONE. Checked live on-chain, no snapshot to game.
---

Holding ONE on Arc is worth a monthly credit toward your OneRouter balance. There is
no snapshot date to time and no staking contract to lock into — the credit is read
from your wallet's live balance each time you check or claim.

## Tiers

| ONE held | Monthly credit |
|---|---|
| 1,000 | $0.50 |
| 10,000 | $2.00 |
| 100,000 | $5.00 |
| 1,000,000 | $15.00 |
| 10,000,000 | $40.00 |

Your tier is whichever row your current balance clears — no accumulation across
tiers, no reward for holding above the top row beyond the top row's credit.

## Get started

::steps
1. Sign in (or create a key) at [`/keys`](/keys).
2. Open your [dashboard](/dashboard) and find the ONE holder benefit card.
3. Connect an Arc wallet. A signature proves you hold it — it authorises nothing
   else, no transaction, no transfer, no spend.
4. If your balance clears a tier, claim the month's credit.
::

::callout note One wallet, one account
Connecting a wallet here links it to your signed-in account as an additional
identity. If that wallet already belongs to a different account, linking is
refused rather than merging the two.
::

## How the check works

`GET /v1/me/holder-credit` reads your linked wallet's ONE balance directly from
Arc via `balanceOf` — not a cached snapshot — and reports the tier it clears, this
month's entitlement, and how much of it is still unclaimed.

```bash
curl {{API}}/me/holder-credit \
  -H "Authorization: Bearer $ONEROUTER_KEY"
```

`POST` the same path to claim whatever is currently claimable. A month's credit can
only be claimed once; claiming again before the next period reports `$0` rather than
erroring.

```bash
curl -X POST {{API}}/me/holder-credit \
  -H "Authorization: Bearer $ONEROUTER_KEY"
```

## Refusals

| Reason | Meaning |
|---|---|
| No wallet linked | Connect an Arc wallet from the dashboard first. |
| Balance under the first tier | Hold at least 1,000 ONE to qualify. |
| Nothing claimable | This month's credit for your tier is already claimed. |

Credit lands as ordinary prepaid balance — the same balance every request draws
down, with the same [no-withdrawal terms](/pricing) as a deposit.
