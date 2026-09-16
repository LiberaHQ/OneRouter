---
title: Models
nav: Models
kicker: Build
description: List models from the API, copy the ID you need, or hand the choice to the auto router.
---

OneRouter currently serves **188 text-generation models**. Model IDs use
`author/name` form. Copy them exactly as the API returns them.

```
meta-llama/llama-3.3-70b-instruct
anthropic/claude-sonnet-5
deepseek/deepseek-v4-flash
```

There is no aliasing layer. `sonnet` and `opus` are client shorthands, not OneRouter
model IDs, and an unaliased id is what makes a receipt auditable.

## Let the router pick: `onerouter/auto`

If you do not know which model to send, send `onerouter/auto`. The gateway resolves an
ordered set of eligible models, prices **one worst-case hold**, and names the model
that answered in `x-onerouter-model`.

| Intent | Optimises for |
|---|---|
| `onerouter/auto` | Balanced default — the same as `:fast` |
| `onerouter/auto:fast` | Latency at good quality |
| `onerouter/auto:cheap` | Lowest input rate that clears a quality floor |
| `onerouter/auto:code` | Tool-calling and long-file editing |
| `onerouter/auto:long` | Largest usable context window |
| `onerouter/auto:free` | The [Open Tier](/docs/open-tier). Never falls back to paid. |

A pre-output failure of the first choice moves to the next eligible model **inside
the same request**, so the caller sees one response, not a retry loop. The current
resolution table is public at `GET /v1/auto` — it is data, not a promise, and it
changes as capacity does.

`503 auto_unresolvable` means every candidate for that intent was unavailable, not
allowed on your key, or unable to price the request. Name a model directly to bypass
the router.

::callout Auto resolves before pricing, not after
The hold is taken against the model that was chosen, so the worst case you are
quoted is the worst case you can be charged. A router that picked after pricing
would have to hold against the most expensive candidate every time.
::

## Source of truth

```http
GET /v1/models     OpenAI-shaped list, key-authenticated
GET /v1/catalog    public catalog with pricing and context, no key, CORS enabled
```

`/v1/models` is deliberately the OpenAI shape, because that is the path an SDK model
picker probes. `/v1/catalog` is the one to build a UI against.

```json
{
  "data": [
    {
      "id": "meta-llama/llama-3.3-70b-instruct",
      "name": "Llama 4 70B",
      "context_length": 262144,
      "architecture": {
        "modality": "text->text",
        "input_modalities": ["text"],
        "output_modalities": ["text"]
      },
      "pricing": {
        "prompt": "0.00000023",
        "completion": "0.00000092",
        "request": "0"
      },
      "top_provider": { "context_length": 262144, "max_completion_tokens": 32768 }
    }
  ]
}
```

Prices are USD per token as decimal strings, never floats — the string is the exact
rate the ledger meters against.

## Fallback models

`models` is an ordered list of acceptable fallback IDs. OneRouter never chooses a model
outside that list.

```json
{
  "model": "meta-llama/llama-3.3-70b-instruct",
  "messages": [{ "role": "user", "content": "ping" }],
  "models": ["meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-v4-flash"]
}
```

`onerouter/auto` cannot be combined with a caller-supplied fallback list. It already has
an ordered list, and two competing orderings would make the receipt meaningless.

## Unsupported model types

Text generation only. Image, video, speech, transcription, embedding, reranking and
realtime requests have no route and return `400 unsupported_endpoint`.

Unknown *fields* inside a supported request pass through to the upstream untouched.
That is what keeps tools, structured output and provider-specific options working
without OneRouter needing to know about them.

## When an ID is wrong

An unavailable ID returns `404 unknown_model` with a did-you-mean suggestion computed
from the closest published id, plus a link to the current list — so an agent can
correct itself without a human.
