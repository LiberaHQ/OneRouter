---
title: Data handling
nav: Privacy
kicker: Operate
description: No content retention by default. Debug capture is opt-in, per key, and expires in an hour.
---

OneRouter does not retain prompts, completions or tool content by default. The
storage path is not merely unused — for a key with capture off, it does not run.

What is always kept is billing metadata: token counts, model id, host, cost, latency
and status. That is what a receipt is made of, and it contains no content.

## Opt-in debug capture

Debugging a tool loop without seeing the tool calls is guesswork, so capture exists —
as a switch you throw, on the key you are debugging:

```bash
curl -X PATCH {{API}}/keys/or_7f2 \
  -H "Authorization: Bearer $ONEROUTER_SESSION" \
  -d '{"debug_capture": true}'
```

| Property | Value |
|---|---|
| Default | Off |
| Scope | One key |
| Retention | 60 minutes, then deleted |
| Redaction | Recognisable credentials stripped before write |
| Truncation | Large captures truncated, not stored whole |
| Access | Administrator views are audited |

Captured content is never sent to analytics and never used for training. It is not a
separate promise — there is no pipeline pointed at it.

## Identity

No account is required. An accountless key has no email, no name and no identity
attached: the key *is* the identity. See [Authentication](/docs/authentication).

`HTTP-Referer` and `X-Title`, if your client sends them, are used for aggregate
client attribution — which clients are in use, in what proportion — and never to
identify an account.

## The provider boundary

This is the honest limit of anything above.

::callout warn Your prompt still transits the upstream that serves it
OneRouter's retention policy governs OneRouter. It does not extend to the host on the
other side, and no gateway's can. Each upstream has its own policy, and every model
page names the hosts that can serve that model so you can go and read theirs.
::

Pinning a route with `provider.only` is the mechanism if this matters to you: it
guarantees which host sees the request, or refuses to send it. See
[Failover](/docs/failover).

## What "no retention" does not mean

No retention and no account are **privacy properties, not permission**. The
[acceptable-use policy](/legal/acceptable-use) applies to every request, and sanctions
screening applies to every deposit.
