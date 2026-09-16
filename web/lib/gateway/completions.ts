// Chat completions: OpenAI and Anthropic shapes, streaming and whole. Ported from
// server.py's completions()/whole_completion()/stream_completion()/from_anthropic().
import { randomBytes } from "node:crypto";
import * as core from "./catalog";
import * as engine from "./engine";
import { errorBody, errorBodyWithMessage } from "./errors";
import { STORE, FREE_REQUESTS_PER_DAY, FREE_TOKENS_PER_DAY, FREE_MAX_OUTPUT, type Account } from "./store";
import { SITE } from "../content/nav";
import type { Model } from "../content/data";
import type { Message } from "./engine";

// ── Anthropic Messages -> internal Chat Completions shape ────────────────────
function flatten(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && typeof p === "object" && (p as any).type === "text")
      .map((p) => (p as any).text || "")
      .join("");
  }
  return "";
}

export function fromAnthropic(body: Record<string, unknown>): Record<string, unknown> {
  const messages: Message[] = [];
  if (body.system) messages.push({ role: "system", content: flatten(body.system) });
  for (const m of (body.messages as unknown[]) || []) {
    if (m && typeof m === "object") {
      const mm = m as Record<string, unknown>;
      messages.push({ role: String(mm.role ?? ""), content: flatten(mm.content) });
    }
  }
  const out: Record<string, unknown> = { model: body.model, messages, stream: Boolean(body.stream) };
  if (body.max_tokens) out.max_tokens = body.max_tokens;
  if (body.provider) out.provider = body.provider;
  return out;
}

function upstreamCode(err: engine.UpstreamError): string {
  if (err.timeout) return "request_timeout";
  const map: Record<number, string> = {
    429: "rate_limited",
    404: "unknown_model",
    400: "invalid_request",
    402: "insufficient_credit",
    503: "model_unavailable",
  };
  return map[err.status] ?? "upstream_error";
}

function closeMatch(wanted: string, ids: string[]): string | null {
  // A small Levenshtein-ratio-style "close enough" heuristic standing in for Python's
  // difflib.get_close_matches — good enough to point at an obvious typo.
  if (!wanted) return null;
  let best: string | null = null;
  let bestScore = 0.4; // matches Python's cutoff=0.4
  for (const id of ids) {
    const score = similarity(wanted, id);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function similarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function unknownModelResponse(wanted: string, models: Model[]): Response {
  const near = closeMatch(wanted, models.map((m) => m.id));
  let message = wanted ? `Unknown model ${JSON.stringify(wanted)}.` : "No model was given.";
  if (near) message += ` The closest catalog id is ${JSON.stringify(near)}.`;
  message += ` The full catalog is ${SITE}/models, or GET /v1/catalog.`;
  const { status, body } = errorBodyWithMessage("unknown_model", message);
  return Response.json(body, { status });
}

async function settle(
  acct: Account,
  model: Model,
  rid: string,
  promptTokens: number,
  completionTokens: number,
  ttft: number,
  free: boolean
): Promise<number> {
  const cost = free ? 0 : core.price(model, promptTokens, completionTokens);
  const receipt = {
    id: rid,
    account: acct.id,
    model: model.id,
    provider: model.hosts[0],
    candidates: model.hosts,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: cost,
    ttft_ms: ttft,
    free,
    created: Math.floor(Date.now() / 1000),
  };
  await STORE.charge(acct, cost, receipt);
  if (free) await STORE.spendOpenTier(acct, promptTokens + completionTokens);
  return cost;
}

interface ResolvedRequest {
  acct: Account;
  model: Model;
  messages: Message[];
  maxTokens: number;
  rid: string;
  promptTokens: number;
  free: boolean;
  pin: string[] | null;
}

/** Auth, validation, model resolution, quota checks — shared by the streaming and
 * whole-response paths. Returns either a resolved request or a Response to return
 * directly (an error). */
async function resolve(body: Record<string, unknown>, authToken: string): Promise<ResolvedRequest | Response> {
  if (!authToken) return errJson("missing_api_key");
  const acct = STORE.resolve(authToken);
  if (!acct) {
    return errJson(STORE.revoked(authToken) ? "account_suspended" : "invalid_api_key");
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return errJson("invalid_request", "messages must be a non-empty array");
  }
  if (messages.some((m) => !m || typeof m !== "object" || !("role" in m) || !("content" in m))) {
    return errJson("invalid_request", "each message needs a role and content");
  }

  const models = core.catalog();
  const wanted = String(body.model ?? "");
  let model = core.resolveModel(models, wanted);
  if (!model) {
    if (wanted.endsWith(":free")) return errJson("no_free_route");
    if (wanted === "onerouter/auto" || wanted === "auto") return errJson("auto_unresolvable");
    return unknownModelResponse(wanted, models);
  }

  // A pin is a refusal to fail over, not a preference — served on that host or
  // refused, never quietly moved.
  let pin: string[] | null = null;
  const requested = body.provider;
  if (requested !== undefined && requested !== null) {
    if (typeof requested !== "object" || Array.isArray(requested)) {
      return errMsgJson("invalid_request", "provider must be an object");
    }
    const only = (requested as Record<string, unknown>).only;
    if (only !== undefined && only !== null) {
      if (!Array.isArray(only) || !only.every((h) => typeof h === "string")) {
        return errMsgJson("invalid_request", "provider.only must be an array of host names");
      }
      if (engine.LIVE) {
        // With a real upstream the provider list belongs to it — forward the pin
        // and let the upstream decide, rather than rejecting a valid provider.
        pin = only as string[];
      } else {
        const allowed = model.hosts.filter((h) => (only as string[]).includes(h));
        if (!allowed.length) {
          return errMsgJson(
            "model_unavailable",
            `${model.id} is not served by ${only.join(", ")}. Its hosts are ${model.hosts.join(", ")}.`
          );
        }
        model = { ...model, hosts: allowed };
      }
    }
  }

  const free = model.tags.includes("free");
  const promptText = messages.map((m) => String((m as Record<string, unknown>).content ?? "")).join("\n");
  const promptTokens = engine.countTokens(promptText);
  if (promptTokens > model.context_length) {
    return errJson("context_too_long", `${promptTokens} tokens against a ${model.context_length} window`);
  }

  const quota = STORE.openTier(acct);
  if (free) {
    if (quota.requests >= FREE_REQUESTS_PER_DAY || quota.tokens >= FREE_TOKENS_PER_DAY) {
      return errJson("free_quota_exceeded");
    }
  } else if (acct.balance_usd <= 0) {
    return errMsgJson(
      "insufficient_credit",
      `This key's balance is $${acct.balance_usd.toFixed(4)}. ${model.id} costs $${model.per_m.in}/1M input and ` +
        `$${model.per_m.out}/1M output. Nothing was sent or charged. Top up at ${SITE}/pay, or send a free model — ` +
        `${SITE}/models has them under 'Free models'.`
    );
  }

  let maxTokens = Number(body.max_tokens ?? 0) || 0;
  if (free) maxTokens = Math.min(maxTokens || FREE_MAX_OUTPUT, FREE_MAX_OUTPUT);

  const rid = "rcp_" + randomBytes(4).toString("hex");
  return { acct, model, messages: messages as Message[], maxTokens, rid, promptTokens, free, pin };
}

function errJson(code: string, detail = ""): Response {
  const { status, body } = errorBody(code, detail);
  return Response.json(body, { status });
}
function errMsgJson(code: string, message: string): Response {
  const { status, body } = errorBodyWithMessage(code, message);
  return Response.json(body, { status });
}

export async function handleCompletions(
  body: Record<string, unknown>,
  authToken: string,
  shape: "openai" | "anthropic" = "openai"
): Promise<Response> {
  const resolved = await resolve(body, authToken);
  if (resolved instanceof Response) return resolved;
  const { acct, model, messages, maxTokens, rid, promptTokens, free, pin } = resolved;
  const started = Date.now();

  if (body.stream) {
    return streamCompletion(acct, model, messages, maxTokens, rid, promptTokens, started, free, shape, pin);
  }
  return wholeCompletion(acct, model, messages, maxTokens, rid, promptTokens, started, free, shape, pin);
}

async function wholeCompletion(
  acct: Account,
  model: Model,
  messages: Message[],
  maxTokens: number,
  rid: string,
  promptTokensIn: number,
  started: number,
  free: boolean,
  shape: "openai" | "anthropic",
  pin: string[] | null
): Promise<Response> {
  let ttft: number | null = null;
  const pieces: string[] = [];
  const usage: engine.Usage = {};
  try {
    for await (const piece of engine.stream(model, messages, maxTokens, usage, pin)) {
      if (ttft === null) ttft = Date.now() - started;
      pieces.push(piece);
    }
  } catch (err) {
    if (err instanceof engine.UpstreamError) return errMsgJson(upstreamCode(err), err.message);
    throw err;
  }

  const text = pieces.join("");
  const promptTokens = usage.prompt_tokens || promptTokensIn;
  const completionTokens = usage.completion_tokens || engine.countTokens(text);
  const cost = await settle(acct, model, rid, promptTokens, completionTokens, ttft ?? 0, free);

  const headers: Record<string, string> = {
    "x-onerouter-model": model.id,
    "x-onerouter-provider": model.hosts[0],
    "x-onerouter-receipt": rid,
    "x-onerouter-ttft-ms": String(ttft ?? 0),
    "x-onerouter-cost-usd": cost.toFixed(6),
    "x-onerouter-balance-usd": acct.balance_usd.toFixed(6),
  };

  if (shape === "anthropic") {
    return Response.json(
      {
        id: "msg_" + rid.slice(4),
        type: "message",
        role: "assistant",
        model: model.id,
        stop_reason: "end_turn",
        stop_sequence: null,
        content: [{ type: "text", text }],
        usage: { input_tokens: promptTokens, output_tokens: completionTokens },
      },
      { headers }
    );
  }
  return Response.json(
    {
      id: "chatcmpl-" + rid.slice(4),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model.id,
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    },
    { headers }
  );
}

function streamCompletion(
  acct: Account,
  model: Model,
  messages: Message[],
  maxTokens: number,
  rid: string,
  promptTokensIn: number,
  started: number,
  free: boolean,
  shape: "openai" | "anthropic",
  pin: string[] | null
): Response {
  const anthropic = shape === "anthropic";
  const created = Math.floor(Date.now() / 1000);
  const cid = "chatcmpl-" + rid.slice(4);
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let alive = true;
      function frame(payload: Record<string, unknown>, event?: string): void {
        if (!alive) return;
        try {
          const prefix = event ? `event: ${event}\n` : "";
          controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          alive = false; // the client hung up; settle what was produced
        }
      }
      function envelope(delta: Record<string, unknown>, finish: string | null = null) {
        return {
          id: cid,
          object: "chat.completion.chunk",
          created,
          model: model.id,
          choices: [{ index: 0, delta, finish_reason: finish }],
        };
      }

      let ttft: number | null = null;
      const text: string[] = [];
      const usage: engine.Usage = {};

      if (anthropic) {
        frame(
          {
            type: "message_start",
            message: {
              id: "msg_" + rid.slice(4),
              type: "message",
              role: "assistant",
              model: model.id,
              content: [],
              usage: { input_tokens: promptTokensIn, output_tokens: 0 },
            },
          },
          "message_start"
        );
        frame({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, "content_block_start");
      } else {
        frame(envelope({ role: "assistant" }));
      }

      try {
        for await (const piece of engine.stream(model, messages, maxTokens, usage, pin)) {
          if (ttft === null) ttft = Date.now() - started;
          text.push(piece);
          if (anthropic) {
            frame({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: piece } }, "content_block_delta");
          } else {
            frame(envelope({ content: piece }));
          }
          if (!alive) break;
        }
      } catch (err) {
        if (err instanceof engine.UpstreamError) {
          const { body: errBody } = errorBodyWithMessage(upstreamCode(err), err.message);
          frame(errBody as unknown as Record<string, unknown>);
        }
        alive = false;
      }

      const promptTokens = usage.prompt_tokens || promptTokensIn;
      const completionTokens = usage.completion_tokens || (text.length ? engine.countTokens(text.join("")) : 0);
      const cost = await settle(acct, model, rid, promptTokens, completionTokens, ttft ?? 0, free);
      const meter = {
        receipt: rid,
        cost_usd: cost,
        balance_usd: Math.round(acct.balance_usd * 1e6) / 1e6,
        ttft_ms: ttft ?? 0,
        provider: usage.provider || model.hosts[0],
      };

      if (alive && anthropic) {
        frame({ type: "content_block_stop", index: 0 }, "content_block_stop");
        frame(
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: completionTokens },
            x_onerouter: meter,
          },
          "message_delta"
        );
        frame({ type: "message_stop" }, "message_stop");
      } else if (alive) {
        frame(envelope({}, "stop"));
        frame({
          id: cid,
          object: "chat.completion.chunk",
          created,
          model: model.id,
          choices: [],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
          x_onerouter: meter,
        });
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch {
          // client hung up
        }
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "x-onerouter-model": model.id,
      "x-onerouter-provider": model.hosts[0],
      "x-onerouter-receipt": rid,
    },
  });
}
