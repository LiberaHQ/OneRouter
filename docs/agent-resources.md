---
title: Agent resources
nav: Agent resources
kicker: Resources
description: Give an agent one setup file, one documentation page, or the whole corpus. Public, no key, clean Markdown.
---

Every endpoint on this page is public, requires no account, and returns Markdown
rather than an HTML page an agent has to strip.

## Agent onboarding

[`/agents.md`](/agents.md) tells an agent how to find a key, configure the base URL,
send a real request, and recover from the errors it is most likely to hit. It is the
one file to hand an agent that has never seen OneRouter.

## One page at a time

Append `.md` to any docs URL:

```bash
curl {{SITE}}/docs/models.md
```

Or ask for it by content type, using the normal URL:

```bash
curl -H "Accept: text/markdown" {{SITE}}/docs/models
```

## Index, or the whole corpus

```bash
# Short index: fetch only the pages you need
curl {{SITE}}/llms.txt

# Every documentation page in one response
curl {{SITE}}/llms-full.txt
```

Use the index when the agent can fetch individual pages on demand. Use the full file
when a tool needs the entire corpus in a single request and you would rather spend
context than round trips.

## Documentation MCP server

Point a Streamable HTTP MCP client at the public endpoint:

```
{{SITE}}/mcp

Tools:     search_docs, get_doc
Resources: every documentation page
```

All operations are read-only. Server metadata is at
`/.well-known/mcp/server-card.json`.

## Agent skill

The reusable skill lives at `/skills/onerouter/SKILL.md`, discoverable from
`/.well-known/agent-skills/index.json`.

## Machine-readable catalogs

| Endpoint | Contents |
|---|---|
| `{{API}}/catalog` | Every model with context window, modalities and current price |
| `/api/v1/auto` | The live `onerouter/auto` resolution table, per intent |
| `/api/v1/status` | Host health, per model family |

::callout These are data, not promises
They change as capacity does. An agent that reads `/api/v1/auto` before a run gets
the picks that are live now; one that hardcoded last month's picks gets
`auto_unresolvable` and deserves to.
::
