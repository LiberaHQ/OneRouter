---
title: Privacy policy
kicker: Legal
description: What we collect, what we deliberately do not, and how long any of it lasts.
updated: 9 September 2026
---

The engineering detail behind this page is in [data handling](/docs/privacy). This is the
policy statement.

## What we do not retain

Prompts, completions and tool content are **not retained by default**. For a key with debug
capture off, the storage path does not execute. This is a default, not a setting you have to
find.

## What we do retain

Billing and operational metadata for every request: timestamp, model id, host, token counts,
cost, latency, status code and the key that made it. This is what a receipt is made of, and
it contains no message content.

Retained for as long as the account exists, because it is the record of what you were charged.

## Opt-in debug capture

Enabled per key, off by default. Captured content is redacted for recognisable credentials,
truncated if large, deleted after **60 minutes**, and never used for training or analytics.
Administrator access to it is logged.

## Identity

An accountless key has no email, name or identity attached. If you sign in, we hold the
identifier you signed in with and nothing more. `HTTP-Referer` and `X-Title` are aggregated
for client attribution and are not used to identify anyone.

## Third parties

Your prompt transits the model host serving the request. Each host has its own retention
policy; every model page names the hosts that can serve it. Pin a route with `provider.only`
if this matters to you.

Payment rails see the transaction, not the traffic. Sanctions screening applies to deposits.

## Your choices

Delete an account and its metadata is deleted with it. There is nothing to export from an
accountless key beyond what the dashboard already shows you.
