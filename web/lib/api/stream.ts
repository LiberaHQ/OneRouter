"use client";

// Hand-parsed SSE reader for /v1/chat/completions — no EventSource anywhere in this
// codebase or the original it's ported from. Buffers on \n\n, parses `data:` lines,
// watches for [DONE], and reads the x_onerouter trailer off the LAST frame before
// [DONE] (not present on intermediate frames, and not in headers for the streaming
// path — unlike the non-streaming path, which puts x-onerouter-* in real headers).

export interface StreamMeta {
  receipt: string;
  cost_usd: number;
  balance_usd: number;
  ttft_ms: number;
  provider: string;
}

export interface StreamEvent {
  delta?: string;
  meta?: StreamMeta;
  error?: { code: string; message: string; retryable: boolean };
}

export async function* streamChat(
  key: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal
): AsyncGenerator<StreamEvent> {
  const res = await fetch("/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: "upstream_error", message: "request failed", retryable: false } }));
    yield { error: body.error };
    return;
  }
  if (!res.body) {
    yield { error: { code: "upstream_error", message: "no response body", retryable: false } };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const data = dataLine.slice(5).trim();
      if (data === "[DONE]") return;
      let frame: any;
      try {
        frame = JSON.parse(data);
      } catch {
        continue;
      }
      if (frame.error) {
        yield { error: frame.error };
        continue;
      }
      const delta: string | undefined = frame.choices?.[0]?.delta?.content;
      if (delta) yield { delta };
      if (frame.x_onerouter) yield { meta: frame.x_onerouter as StreamMeta };
    }
  }
}
