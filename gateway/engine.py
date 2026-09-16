"""Where completions actually come from.

Two modes, chosen by environment:

  ONEROUTER_UPSTREAM_URL   an OpenAI-compatible base URL, e.g. https://api.openai.com/v1
  ONEROUTER_UPSTREAM_KEY   the bearer token for it
  ONEROUTER_UPSTREAM_MODEL optional; overrides the model id sent upstream

With both set, the gateway is a real proxy: your request is forwarded, the upstream's
tokens are streamed back, and you are billed on what came out. With them unset it falls
back to a local engine that answers deterministically. That fallback is NOT a language
model and never claims to be — it exists so the whole path (auth, routing, streaming,
billing) can be exercised with no credentials at all.
"""

from __future__ import annotations

import json
import os
import socket
import time
import urllib.error
import urllib.request

UPSTREAM_URL = os.environ.get("ONEROUTER_UPSTREAM_URL", "").rstrip("/")
UPSTREAM_KEY = os.environ.get("ONEROUTER_UPSTREAM_KEY", "")
UPSTREAM_MODEL = os.environ.get("ONEROUTER_UPSTREAM_MODEL", "")

LIVE = bool(UPSTREAM_URL and UPSTREAM_KEY)


class UpstreamError(Exception):
    """The upstream refused or could not be reached. Carries a status to pass on."""

    def __init__(self, status: int, message: str, *, timeout: bool = False):
        super().__init__(message)
        self.status = status
        self.message = message
        self.timeout = timeout


def count_tokens(text: str) -> int:
    """Deliberately approximate — four characters to a token. Real billing reads the
    upstream's usage block; this is the estimate used when it does not send one."""
    return max(1, len(text) // 4)


def _local_reply(model: dict, messages: list[dict]) -> str:
    last = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    turns = sum(1 for m in messages if m["role"] == "user")
    return (
        f"[local engine] No upstream is configured on this gateway, so this reply is "
        f"generated locally and is not model output.\n\n"
        f"Routed as:   {model['id']}\n"
        f"Host:        {model['hosts'][0]}\n"
        f"Context:     {model['context_length']:,} tokens\n"
        f"Turn:        {turns}\n"
        f"You said:    {last.strip()[:400] or '(nothing)'}\n\n"
        f"Everything around this text is real: the key was authenticated, the model was "
        f"resolved from the catalog, the response is streaming over SSE, and your balance "
        f"was charged at this model's catalog price. Set ONEROUTER_UPSTREAM_URL and "
        f"ONEROUTER_UPSTREAM_KEY to have a provider answer instead."
    )


def _chunks(text: str, size: int = 18):
    for i in range(0, len(text), size):
        yield text[i:i + size]


def stream_local(model: dict, messages: list[dict], max_tokens: int):
    """Yields text pieces, paced so the SSE path is exercised the way a real one is."""
    reply = _local_reply(model, messages)
    budget = max_tokens * 4 if max_tokens else len(reply)
    for piece in _chunks(reply[:budget]):
        yield piece
        time.sleep(0.012)


def stream_upstream(model: dict, messages: list[dict], max_tokens: int,
                    usage: dict | None = None, pin: list[str] | None = None):
    """Forwards to the configured provider and re-emits its content deltas.

    `usage` is filled in from the upstream's own counts when it reports them, which is
    what the request is then billed on — an estimate is only used when the upstream
    sends none.
    """
    payload = {
        "model": UPSTREAM_MODEL or model["id"],
        "messages": messages,
        "stream": True,
        # Ask for the usage block on the final chunk so billing is not guesswork.
        "stream_options": {"include_usage": True},
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if pin:
        # Pass a route pin through rather than pretending to honour it locally.
        payload["provider"] = {"only": pin}
    req = urllib.request.Request(
        f"{UPSTREAM_URL}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {UPSTREAM_KEY}",
                 "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            for raw in res:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                try:
                    frame = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if usage is not None and frame.get("usage"):
                    counts = frame["usage"]
                    usage["prompt_tokens"] = counts.get("prompt_tokens") or 0
                    usage["completion_tokens"] = counts.get("completion_tokens") or 0
                if usage is not None and frame.get("provider"):
                    usage["provider"] = frame["provider"]
                try:
                    delta = frame["choices"][0]["delta"].get("content")
                except (KeyError, IndexError, TypeError):
                    continue
                if delta:
                    yield delta
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw)
            detail = (body.get("error") or {}).get("message") or raw[:200]
        except (json.JSONDecodeError, AttributeError):
            detail = raw[:200]
        raise UpstreamError(err.code, f"upstream {err.code}: {detail}") from err
    except (TimeoutError, socket.timeout) as err:
        raise UpstreamError(504, "no first token from the upstream within the window",
                            timeout=True) from err
    except urllib.error.URLError as err:
        # urllib wraps a socket timeout in URLError, so the reason has to be inspected.
        if isinstance(err.reason, (TimeoutError, socket.timeout)):
            raise UpstreamError(504, "no first token from the upstream within the window",
                                timeout=True) from err
        raise UpstreamError(502, f"upstream unreachable: {err}") from err
    except OSError as err:
        raise UpstreamError(502, f"upstream unreachable: {err}") from err


def stream(model: dict, messages: list[dict], max_tokens: int = 0,
           usage: dict | None = None, pin: list[str] | None = None):
    if LIVE:
        return stream_upstream(model, messages, max_tokens, usage, pin)
    return stream_local(model, messages, max_tokens)


def describe() -> str:
    if LIVE:
        return f"upstream {UPSTREAM_URL} (model {UPSTREAM_MODEL or 'passthrough'})"
    return "local engine (no upstream configured)"
