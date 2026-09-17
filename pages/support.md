---
title: Support
kicker: Help
description: What to send, where to send it, and what will get you an answer fastest.
---

## Read this first

Most problems are one of three things, and all three are documented:

::cards
- **A setup failure** — usually a trimmed `/v1`, an appended endpoint, or an unexported
  environment variable. See [client setup](/docs/integrations).
- **An error code** — every message ends in a URL. The [errors page](/docs/errors) has the
  cause and the fix for all 18 of them.
- **An unexpected charge** — every response reports its own cost. See
  [billing](/docs/billing).
::

## What to send

One thing makes a support request answerable immediately:

```
x-onerouter-receipt: rcp_8fa2e1c0
```

That receipt id resolves to the ordered candidate list, the host that answered, the TTFT,
the token counts and the exact charge. With it, most questions are settled in one reply.
Without it, we are both guessing.

Also useful: the model id, the client and version, and the time in UTC.

::callout warn Never send us your API key
Not in a message, not in a screenshot, not "just the first few characters plus the rest".
We can identify any request from its receipt id. If you have already sent a key anywhere,
rotate it — the old one keeps working for 24 hours, so nothing breaks while you do.
::

## Reaching us

| Channel | Use it for |
|---|---|
| `support@onerouter.dev` | Billing, account, refunds, anything with a receipt id |
| `security@onerouter.dev` | Vulnerability reports. We do not pursue good-faith research. |
| `abuse@onerouter.dev` | Acceptable-use reports |

Live host health is on the [providers page](/providers) — check it before reporting an outage;
if a host is already marked down, we already know.
