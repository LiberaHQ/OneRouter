'use client';

import { useState } from 'react';

/** Per-model client setup. The same literal values as /docs/integrations, with this
 *  model's id already filled in so every snippet is copy-and-run. */
export default function Setup({
  modelId, modelName, api, brand,
}: { modelId: string; modelName: string; api: string; brand: string }) {
  const host = api.replace(/\/v1$/, '');
  const tabs: [string, string][] = [
    ['cURL', `curl ${api}/chat/completions \\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [{"role":"user","content":"ping"}],
    "stream": true
  }'`],
    ['Python', `from openai import OpenAI

client = OpenAI(
    base_url="${api}",
    api_key="or-live-...",
)

client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "ping"}],
    stream=True,
)`],
    ['Node.js', `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${api}",
  apiKey: process.env.ONEROUTER_KEY,
});

await client.chat.completions.create({
  model: "${modelId}",
  messages: [{ role: "user", content: "ping" }],
  stream: true,
});`],
    ['Claude Code', `# Shell, or "env" in ~/.claude/settings.json.
# Use the BARE host: Claude Code appends /v1/messages itself.

export ONEROUTER_KEY=or-live-YOUR-KEY-HERE
export ANTHROPIC_BASE_URL=${host}
export ANTHROPIC_AUTH_TOKEN="$ONEROUTER_KEY"
export ANTHROPIC_MODEL="${modelId}"

claude --model "$ANTHROPIC_MODEL"`],
    ['OpenCode', `// opencode.json — project root, or ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "onerouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "${brand}",
      "options": {
        "baseURL": "${api}",
        "apiKey": "{env:ONEROUTER_KEY}"
      },
      "models": {
        "${modelId}": { "name": "${modelName}" }
      }
    }
  }
}`],
  ];

  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tabs[active][1]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="code">
      <div className="code-bar">
        <div className="tabs-strip" role="tablist">
          {tabs.map(([name], i) => (
            <button
              key={name}
              className="tab"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
            >
              {name}
            </button>
          ))}
        </div>
        <button className={`copy${copied ? ' done' : ''}`} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{tabs[active][1]}</code></pre>
    </div>
  );
}
