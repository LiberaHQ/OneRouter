import { API, BRAND } from "./nav";
import type { Model } from "./data";

export function heroTabs(): Array<[string, string]> {
  return [
    [
      "cURL",
      `curl ${API}/chat/completions \\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "onerouter/auto",
    "messages": [{"role":"user","content":"ping"}],
    "stream": true
  }'`,
    ],
    [
      "Python",
      `from openai import OpenAI

client = OpenAI(
    base_url="${API}",
    api_key="or-live-...",
)

client.chat.completions.create(
    model="onerouter/auto",
    messages=[{"role": "user", "content": "ping"}],
    stream=True,
)`,
    ],
    [
      "Node.js",
      `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${API}",
  apiKey: process.env.ONEROUTER_KEY,
});

await client.chat.completions.create({
  model: "onerouter/auto",
  messages: [{ role: "user", content: "ping" }],
  stream: true,
});`,
    ],
    [
      "Agent env",
      `ONEROUTER_KEY=or-live-...
OPENAI_BASE_URL=https://onerouter.network/v1
OPENAI_API_KEY=$ONEROUTER_KEY
OPENAI_MODEL=deepseek/deepseek-v4-flash`,
    ],
  ];
}

export function modelTabs(m: Model): Array<[string, string]> {
  const mid = m.id;
  const host = API.replace(/\/v1$/, "");
  return [
    [
      "cURL",
      `curl ${API}/chat/completions \\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${mid}",
    "messages": [{"role":"user","content":"ping"}],
    "stream": true
  }'`,
    ],
    [
      "Python",
      `from openai import OpenAI

client = OpenAI(
    base_url="${API}",
    api_key="or-live-...",
)

client.chat.completions.create(
    model="${mid}",
    messages=[{"role": "user", "content": "ping"}],
    stream=True,
)`,
    ],
    [
      "Node.js",
      `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${API}",
  apiKey: process.env.ONEROUTER_KEY,
});

await client.chat.completions.create({
  model: "${mid}",
  messages: [{ role: "user", content: "ping" }],
  stream: true,
});`,
    ],
    [
      "Claude Code",
      `# Shell, or "env" in ~/.claude/settings.json.
# Use the BARE host: Claude Code appends /v1/messages itself.

export ONEROUTER_KEY=or-live-YOUR-KEY-HERE
export ANTHROPIC_BASE_URL=${host}
export ANTHROPIC_AUTH_TOKEN="$ONEROUTER_KEY"
export ANTHROPIC_MODEL="${mid}"

claude --model "$ANTHROPIC_MODEL"`,
    ],
    [
      "Codex",
      `# ~/.codex/config.toml, with ONEROUTER_KEY in the environment

model = "${mid}"
model_provider = "onerouter"

[model_providers.onerouter]
name = "${BRAND}"
base_url = "${API}"
env_key = "ONEROUTER_KEY"
wire_api = "responses"`,
    ],
    [
      "OpenCode",
      `// opencode.json — project root, or ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "onerouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "${BRAND}",
      "options": {
        "baseURL": "${API}",
        "apiKey": "{env:ONEROUTER_KEY}"
      },
      "models": {
        "${mid}": { "name": "${m.name}" }
      }
    }
  }
}`,
    ],
  ];
}
