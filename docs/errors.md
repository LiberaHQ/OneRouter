---
title: Errors
nav: Errors
kicker: Build
description: Every code the gateway can return, generated from the same catalog the gateway itself uses.
---

Every API error carries a stable `code` and a message that ends in a URL. Each URL
resolves to an anchor on this page, and the anchor id *is* the code.

This page is generated from the same catalog the gateway serves from. It cannot
drift, because there is nothing to keep in sync.

```json
{
  "error": {
    "message": "Rate limited: this key allows 60 requests/minute. Raise it at {{SITE}}/keys",
    "type": "rate_limit_error",
    "code": "rate_limited",
    "param": null
  }
}
```

::callout Retryable means the identical request may succeed later
Not that you should retry immediately. Honour `Retry-After` where it is present, and
back off where it is not. A non-retryable error needs a change from you first —
retrying it unchanged will fail the same way.
::

::errors
