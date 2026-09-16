---
title: Authentication
nav: Authentication
kicker: Start here
description: One header, one key format, no OAuth. Keys exist before any payment, with or without an account.
---

One header:

```http
Authorization: Bearer or-live-<32 base58>
```

There are two equal ways in: **accountless**, or an account signed in with an email
or a wallet. Same prices, same key format, same API behaviour. We store the
12-character prefix and a SHA-256 hash. **The key itself is never stored** — the
plaintext is returned only when the key is created or rotated.

## Accountless mode

No email, no wallet, no identity. Setup returns two bearer secrets:

::cards
- **The API key** — `or-live-…`, for your clients.
- **A recovery link** — a separately hashed, permanent dashboard URL.
::

Both must be saved before a payment address is shown. The recovery link stays valid
when the API key is rotated and can mint a replacement, which is the whole point of
having two secrets rather than one.

::callout warn Lose both and there is no recovery path
Not a support process, not a delay — an absence. There is no identity attached to
recover *to*. This is stated before payment rather than after it.
::

## Account mode

Sign in with an email or a wallet, passwordless either way. An account adds
personal recovery and key replacement. Existing plaintext keys still cannot be
recovered, because only their hashes were ever stored — but a signed-in session can
always mint a new one.

## Claim an account later

`POST /v1/me/claim` attaches an email or a wallet to an accountless balance. The API
key is the proof of control, and it keeps working unchanged.

```bash
curl {{API}}/me/claim \
  -H "Authorization: Bearer $ONEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

## Rotation, with a 24-hour grace window

`POST /v1/keys/{id}/rotate` returns the new key and the old key's expiry, 24 hours
out. The old key keeps working for that window.

Instant-kill rotation would brick a running agent mid-task, so it is not the
default — but it is available: **Revoke** stops a key on the very next request. Use
rotate when you are tidying up, revoke when a key has leaked. After the grace window
the old key returns `401 invalid_api_key`.

## Per-key controls

Every key carries its own limits and its own model allowlist:

| Field | Enforces |
|---|---|
| `rpm_limit` | Requests per minute |
| `tpm_limit` | Estimated input + output tokens per minute |
| `daily_limit_usd` | Spend per UTC day |
| `monthly_limit_usd` | Spend per calendar month |
| `allowed_models` | The only model ids this key may call |
| `budget` | A named [budget](/docs/budgets) this key draws from |

Spend caps are **on by default**, and lower by default for accountless keys. Raise
any of them per key in the dashboard. Open reservations count immediately, so a
burst of concurrent requests cannot bypass a cap.

Keys are free and require no account. Mint one per agent — a cap on a shared key
contains nothing useful, because when it trips everything stops and you cannot tell
which process was looping.
