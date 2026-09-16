---
title: Client setup
nav: Integrations
kicker: Resources
description: Literal configuration for the clients people actually use. The base URL and the key never change.
---

The setup changes slightly per client. The base URL and the key do not.

```
Base URL:   {{API}}
Key:        or-live-...
Env var:    ONEROUTER_KEY
```

Verify the connection **outside** your client first. One request, literal values — if
this works and the client does not, the problem is the client's configuration, and
you have just halved the search space:

```bash
curl {{API}}/chat/completions \
  -H "Authorization: Bearer $ONEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"meta-llama/llama-3.3-70b-instruct","messages":[{"role":"user","content":"ping"}]}'
```

## Coding agents

::tabs
--- Claude Code
# Shell, or "env" in ~/.claude/settings.json.
# Use the BARE host: Claude Code appends /v1/messages itself.

export ONEROUTER_KEY=or-live-YOUR-KEY-HERE
export ANTHROPIC_BASE_URL=https://api.onerouter.dev
export ANTHROPIC_AUTH_TOKEN="$ONEROUTER_KEY"
export ANTHROPIC_MODEL="deepseek/deepseek-v4-flash"

claude --model "$ANTHROPIC_MODEL"
--- Codex
# ~/.codex/config.toml, with ONEROUTER_KEY in the environment

model = "deepseek/deepseek-v4-flash"
model_provider = "onerouter"

[model_providers.onerouter]
name = "OneRouter"
base_url = "https://api.onerouter.dev/v1"
env_key = "ONEROUTER_KEY"
wire_api = "responses"
--- OpenCode
// opencode.json — project root, or ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "onerouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OneRouter",
      "options": {
        "baseURL": "https://api.onerouter.dev/v1",
        "apiKey": "{env:ONEROUTER_KEY}"
      },
      "models": {
        "deepseek/deepseek-v4-flash": { "name": "DeepSeek V4 Flash" },
        "meta-llama/llama-3.3-70b-instruct": { "name": "Llama 4 70B" }
      }
    }
  }
}
--- Cursor
Cursor Settings → Models → OpenAI API Key → Override OpenAI Base URL

OpenAI API Key:            or-live-YOUR-KEY-HERE
Override OpenAI Base URL:  https://api.onerouter.dev/v1
Model ID:                  deepseek/deepseek-v4-flash
::

## Editors and extensions

::tabs
--- Continue
# ~/.continue/config.yaml
models:
  - name: DeepSeek V4 Flash (OneRouter)
    provider: openai
    model: deepseek/deepseek-v4-flash
    apiBase: https://api.onerouter.dev/v1
    apiKey: or-live-YOUR-KEY-HERE
    roles: [chat, edit, apply]
--- Zed
// settings.json (cmd-,) → language_models
{
  "language_models": {
    "openai_compatible": {
      "onerouter": {
        "api_url": "https://api.onerouter.dev/v1",
        "available_models": [
          {
            "name": "deepseek/deepseek-v4-flash",
            "display_name": "DeepSeek V4 Flash (OneRouter)",
            "max_tokens": 262144
          }
        ]
      }
    }
  }
}
--- Cline / Kilo Code
Sidebar → ⚙ Settings → API Configuration

API Provider:  OpenAI Compatible
Base URL:      https://api.onerouter.dev/v1
API Key:       or-live-YOUR-KEY-HERE
Model ID:      deepseek/deepseek-v4-flash

Leave "Use custom base URL" ON. Do not append /chat/completions.
::

## SDKs and proxies

::tabs
--- Aider
export OPENAI_API_BASE=https://api.onerouter.dev/v1
export OPENAI_API_KEY=or-live-YOUR-KEY-HERE

aider --model openai/deepseek/deepseek-v4-flash
--- LiteLLM
# config.yaml for the proxy
model_list:
  - model_name: deepseek-v4-flash
    litellm_params:
      model: openai/deepseek/deepseek-v4-flash
      api_base: https://api.onerouter.dev/v1
      api_key: os.environ/ONEROUTER_KEY
--- SillyTavern
API Connections (the plug icon)

API:            Chat Completion
Source:         Custom (OpenAI-compatible)
Endpoint URL:   https://api.onerouter.dev/v1
API Key:        or-live-YOUR-KEY-HERE

Click Connect, then pick a model from the list it fetches.
::

## The three failures that eat the most time

::cards
- **`/v1` trimmed, or the endpoint appended.** The base URL field takes
  `{{API}}` and nothing else. The client adds `/chat/completions`.
- **A client alias used as a model id.** `sonnet` and `opus` are shorthands. Send a
  full `author/name` id from the catalog.
- **The variable never exported.** The shell that launched the client did not have
  it. Echo it in *that* shell, then restart the client from there.
::
