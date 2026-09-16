// Where completions actually come from. Ported from gateway/engine.py. With
// ONEROUTER_UPSTREAM_URL/_KEY set, the gateway proxies a real provider; unset, it falls
// back to a local engine that answers deterministically and says so in every reply.
import type { Model } from "../content/data";

export const UPSTREAM_URL = (process.env.ONEROUTER_UPSTREAM_URL || "").replace(/\/$/, "");
export const UPSTREAM_KEY = process.env.ONEROUTER_UPSTREAM_KEY || "";
export const UPSTREAM_MODEL = process.env.ONEROUTER_UPSTREAM_MODEL || "";
export const LIVE = Boolean(UPSTREAM_URL && UPSTREAM_KEY);

export interface Message {
  role: string;
  content: string;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  provider?: string;
}

export class UpstreamError extends Error {
  status: number;
  timeout: boolean;
  constructor(status: number, message: string, opts: { timeout?: boolean } = {}) {
    super(message);
    this.status = status;
    this.timeout = opts.timeout ?? false;
  }
}

/** Deliberately approximate — four characters to a token. Real billing reads the
 * upstream's usage block; this is the estimate used when it sends none. */
export function countTokens(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

function localReply(model: Model, messages: Message[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const last = lastUser?.content ?? "";
  const turns = messages.filter((m) => m.role === "user").length;
  const said = last.trim().slice(0, 400) || "(nothing)";
  return (
    `[local engine] No upstream is configured on this gateway, so this reply is ` +
    `generated locally and is not model output.\n\n` +
    `Routed as:   ${model.id}\n` +
    `Host:        ${model.hosts[0]}\n` +
    `Context:     ${model.context_length.toLocaleString("en-US")} tokens\n` +
    `Turn:        ${turns}\n` +
    `You said:    ${said}\n\n` +
    `Everything around this text is real: the key was authenticated, the model was ` +
    `resolved from the catalog, the response is streaming over SSE, and your balance ` +
    `was charged at this model's catalog price. Set ONEROUTER_UPSTREAM_URL and ` +
    `ONEROUTER_UPSTREAM_KEY to have a provider answer instead.`
  );
}

function* chunks(text: string, size = 18): Generator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Yields text pieces, paced so the SSE path is exercised the way a real one is. */
export async function* streamLocal(model: Model, messages: Message[], maxTokens: number): AsyncGenerator<string> {
  const reply = localReply(model, messages);
  const budget = maxTokens ? maxTokens * 4 : reply.length;
  for (const piece of chunks(reply.slice(0, budget))) {
    yield piece;
    await sleep(12);
  }
}

interface ChatFrame {
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  provider?: string;
  choices?: Array<{ delta?: { content?: string } }>;
}

/** Forwards to the configured provider and re-emits its content deltas. `usage` is
 * filled in from the upstream's own counts when it reports them — billing is not
 * guesswork unless the upstream sends none. */
export async function* streamUpstream(
  model: Model,
  messages: Message[],
  maxTokens: number,
  usage: Usage | null,
  pin: string[] | null
): AsyncGenerator<string> {
  const payload: Record<string, unknown> = {
    model: UPSTREAM_MODEL || model.id,
    messages,
    stream: true,
    // Ask for the usage block on the final chunk so billing is not guesswork.
    stream_options: { include_usage: true },
  };
  if (maxTokens) payload.max_tokens = maxTokens;
  if (pin) payload.provider = { only: pin }; // pass a route pin through, don't fake honoring it locally

  let res: Response;
  try {
    res = await fetch(`${UPSTREAM_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTREAM_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      throw new UpstreamError(504, "no first token from the upstream within the window", { timeout: true });
    }
    throw new UpstreamError(502, `upstream unreachable: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const raw = await res.text();
    let detail = raw.slice(0, 200);
    try {
      const body = JSON.parse(raw);
      detail = body?.error?.message || detail;
    } catch {
      // raw text fallback already set
    }
    throw new UpstreamError(res.status, `upstream ${res.status}: ${detail}`);
  }
  if (!res.body) throw new UpstreamError(502, "upstream returned no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let frame: ChatFrame;
        try {
          frame = JSON.parse(data);
        } catch {
          continue;
        }
        if (usage && frame.usage) {
          usage.prompt_tokens = frame.usage.prompt_tokens || 0;
          usage.completion_tokens = frame.usage.completion_tokens || 0;
        }
        if (usage && frame.provider) usage.provider = frame.provider;
        const delta = frame.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      throw new UpstreamError(504, "no first token from the upstream within the window", { timeout: true });
    }
    throw new UpstreamError(502, `upstream unreachable: ${(err as Error).message}`);
  }
}

export function stream(
  model: Model,
  messages: Message[],
  maxTokens = 0,
  usage: Usage | null = null,
  pin: string[] | null = null
): AsyncGenerator<string> {
  return LIVE ? streamUpstream(model, messages, maxTokens, usage, pin) : streamLocal(model, messages, maxTokens);
}

export function describe(): string {
  if (LIVE) return `upstream ${UPSTREAM_URL} (model ${UPSTREAM_MODEL || "passthrough"})`;
  return "local engine (no upstream configured)";
}
