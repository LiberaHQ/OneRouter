#!/usr/bin/env python3
"""The OneRouter gateway.

An OpenAI-compatible endpoint with the account model the site describes: keys are
minted without an account, credit is prepaid, and the free route is quota'd rather
than billed.

    python3 gateway/server.py 8080

Standard library only, like the rest of this repo. Errors are returned in the shape
`docs/_errors.json` documents — the catalog is loaded from that file, so the gateway
and the published error page cannot drift apart.
"""

from __future__ import annotations

import difflib
import json
import os
import re
import secrets
import sys
import urllib.parse
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gateway import envfile  # noqa: E402

# Before the modules that read their configuration at import time.
LOADED_ENV = envfile.load()

from gateway import core, engine, routes_auth  # noqa: E402

ERRORS = {e["code"]: e for e in
          json.loads((core.ROOT / "docs" / "_errors.json").read_text())}
NAV = json.loads((core.ROOT / "docs" / "_nav.json").read_text())
SITE = f"https://{NAV['domain']}"

STORE = core.Store()
MAX_BODY = 2 * 1024 * 1024

# /v1/me/credit hands out balance for nothing. That is fine while the engine is
# local and there is nothing real to spend, and it must be opted into once a real
# upstream is configured — otherwise it is a free-money endpoint on a live gateway.
DEV_CREDIT = os.environ.get("ONEROUTER_DEV_CREDIT",
                            "0" if engine.LIVE else "1") == "1"


def error_body(code: str, detail: str = "") -> tuple[int, dict]:
    spec = ERRORS.get(code, ERRORS["internal_error"])
    message = spec["message"]
    for token, value in (("{{SITE}}", SITE), ("{{BRAND}}", NAV["brand"]),
                         ("{{API}}", NAV["api"]), ("{{DOMAIN}}", NAV["domain"])):
        message = message.replace(token, value)
    if detail:
        message = f"{message} ({detail})"
    return spec["http"], {"error": {"code": code, "type": spec["type"],
                                    "message": message, "retryable": spec["retryable"]}}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "onerouter"

    # Shared with the auth/deposit route module.
    store = STORE
    brand = NAV["brand"]
    domain = NAV["domain"]

    @staticmethod
    def store_digest(value: str) -> str:
        return core.digest(value)

    # ── Plumbing ────────────────────────────────────────────────────────────
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")

    def reply(self, status: int, payload: dict, extra: dict | None = None) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, str(v))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def fail(self, code: str, detail: str = "") -> None:
        status, payload = error_body(code, detail)
        self.reply(status, payload)

    def fail_msg(self, code: str, message: str) -> None:
        """Same code and status as the catalog, but this exact message. Used where the
        specific reason is more use than the catalog's general one."""
        spec = ERRORS.get(code, ERRORS["internal_error"])
        self.reply(spec["http"], {"error": {
            "code": code, "type": spec["type"], "message": message,
            "retryable": spec["retryable"]}})

    TOO_BIG = object()   # distinct from "malformed", which is a different status

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            # Answer 413 rather than read it, but drain a bounded amount first: a
            # client that is still writing cannot read the response, and sees a reset
            # instead. Past the cap, closing on them is the right trade.
            remaining = min(length, 8 * 1024 * 1024)
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
            return self.TOO_BIG
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, ValueError):
            return None

    def bearer(self) -> str:
        header = self.headers.get("Authorization", "")
        return header[7:].strip() if header.lower().startswith("bearer ") else ""

    def account(self):
        """Returns (account, None) or (None, error_code).

        A key that resolves to a revoked account is told so, rather than being called
        invalid — the holder has the right secret and needs to know why it is refused.
        """
        token = self.bearer()
        if not token:
            return None, "missing_api_key"
        acct = STORE.resolve(token)
        if not acct:
            if STORE.revoked(token):
                return None, "account_suspended"
            return None, "invalid_api_key"
        return acct, None

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # ── Routes ──────────────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        raw = urllib.parse.urlsplit(self.path)
        path = raw.path.rstrip("/") or "/"
        if routes_auth.handle_get(self, path, urllib.parse.parse_qs(raw.query)):
            return
        models = core.catalog()

        if path in ("/", "/health"):
            return self.reply(200, {"status": "ok", "brand": NAV["brand"],
                                    "engine": engine.describe(),
                                    "dev_credit": DEV_CREDIT,
                                    "models": len(models)})

        if path == "/v1/catalog":
            return self.reply(200, {"object": "list", "data": [
                {"id": m["id"], "name": m["name"], "author": m["author"],
                 "context_length": m["context_length"], "max_output": m["max_output"],
                 "pricing": {"prompt_per_m": m["per_m"]["in"],
                             "completion_per_m": m["per_m"]["out"]},
                 "input_modalities": m["input_modalities"], "hosts": m["hosts"],
                 "tags": m["tags"]}
                for m in models]})

        if path == "/v1/auto":
            free = next((m for m in models if "free" in m["tags"]), None)
            paid = [m for m in models if m["per_m"]["in"] > 0]
            cheapest = min(paid, key=lambda m: m["per_m"]["in"]) if paid else None
            return self.reply(200, {
                "onerouter/auto": cheapest["id"] if cheapest else None,
                "onerouter/auto:free": free["id"] if free else None,
                "note": "Resolution is data, not a promise. It can change at any time.",
            })

        if path == "/v1/models":
            acct, err = self.account()
            if err:
                return self.fail(err)
            return self.reply(200, {"object": "list", "data": [
                {"id": m["id"], "object": "model", "created": 0, "owned_by": m["author"]}
                for m in models]})

        if path == "/v1/me":
            acct, err = self.account()
            if err:
                return self.fail(err)
            return self.reply(200, {
                "account": acct["id"], "balance_usd": round(acct["balance_usd"], 6),
                "spent_usd": round(acct["spent_usd"], 6), "requests": acct["requests"],
                "created": acct["created"],
            })

        if path == "/v1/me/open-tier":
            acct, err = self.account()
            if err:
                return self.fail(err)
            quota = STORE.open_tier(acct)
            return self.reply(200, {
                "eligible": True,
                "requests_remaining": max(0, core.FREE_REQUESTS_PER_DAY - quota["requests"]),
                "tokens_remaining": max(0, core.FREE_TOKENS_PER_DAY - quota["tokens"]),
                "resets_at": time.strftime("%Y-%m-%dT00:00:00Z",
                                           time.gmtime(time.time() + 86400)),
                "max_output_per_request": core.FREE_MAX_OUTPUT,
            })

        if match := re.fullmatch(r"/v1/receipts/(rcp_[0-9a-f]+)", path):
            acct, err = self.account()
            if err:
                return self.fail(err)
            found = STORE.receipt(match.group(1))
            if not found or found["account"] != acct["id"]:
                return self.fail("invalid_request", "no such receipt")
            return self.reply(200, found)

        return self.fail("unsupported_endpoint", f"GET {path}")

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        body = self.read_json()
        if body is self.TOO_BIG:
            return self.fail_msg(
                "payload_too_large",
                f"the request body exceeds {MAX_BODY // 1024 // 1024} MB")
        if body is None:
            return self.fail_msg("invalid_request", "the request body is not valid JSON")

        if routes_auth.handle_post(self, path, body):
            return

        if path == "/v1/keys":
            minted = STORE.mint()
            minted["recovery_url"] = f"{SITE}/r/{minted.pop('recovery')[7:]}"
            return self.reply(201, minted)

        if path == "/v1/keys/rotate":
            rotated = STORE.rotate(body.get("recovery", ""))
            if not rotated:
                return self.fail("invalid_api_key", "recovery secret not recognised")
            return self.reply(200, rotated)

        if path == "/v1/me/credit":
            # Stands in for the payment rails. Real deposits settle on-chain or through
            # the card processor; this exists so the paid path can be exercised.
            if not DEV_CREDIT:
                return self.fail("unsupported_endpoint",
                                 "development crediting is off; set ONEROUTER_DEV_CREDIT=1 "
                                 "to enable it, or fund the key through a payment rail")
            acct, err = self.account()
            if err:
                return self.fail(err)
            try:
                amount = float(body.get("amount_usd", 0))
            except (TypeError, ValueError):
                return self.fail("invalid_request", "amount_usd must be a number")
            if not 0 < amount <= 1000:
                return self.fail("invalid_request", "amount_usd must be 0-1000")
            STORE.credit(acct, amount)
            return self.reply(200, {"balance_usd": round(acct["balance_usd"], 6)})

        if path == "/v1/chat/completions":
            return self.completions(body)

        if path == "/v1/messages":
            return self.completions(self.from_anthropic(body), shape="anthropic")

        if path == "/v1/responses":
            return self.fail_msg(
                "unsupported_endpoint",
                "/v1/responses is documented but not implemented in this build. "
                "Use /v1/chat/completions, or /v1/messages for the Anthropic shape.")

        return self.fail("unsupported_endpoint", f"POST {path}")

    # ── Completions ─────────────────────────────────────────────────────────
    @staticmethod
    def from_anthropic(body: dict) -> dict:
        """Anthropic Messages -> the internal Chat Completions shape.

        `system` is a top-level field there and a message here; content may arrive as
        a list of typed blocks rather than a string.
        """
        def flatten(content):
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return "".join(part.get("text", "") for part in content
                               if isinstance(part, dict) and part.get("type") == "text")
            return ""

        messages = []
        system = body.get("system")
        if system:
            messages.append({"role": "system", "content": flatten(system)})
        for m in body.get("messages") or []:
            if isinstance(m, dict):
                messages.append({"role": m.get("role"), "content": flatten(m.get("content"))})
        out = {"model": body.get("model"), "messages": messages,
               "stream": bool(body.get("stream"))}
        if body.get("max_tokens"):
            out["max_tokens"] = body["max_tokens"]
        if body.get("provider"):
            out["provider"] = body["provider"]
        return out


    def completions(self, body: dict, shape: str = "openai"):
        acct, err = self.account()
        if err:
            return self.fail(err)

        messages = body.get("messages")
        if not isinstance(messages, list) or not messages:
            return self.fail("invalid_request", "messages must be a non-empty array")
        if any(not isinstance(m, dict) or "role" not in m or "content" not in m
               for m in messages):
            return self.fail("invalid_request", "each message needs a role and content")

        models = core.catalog()
        wanted = body.get("model") or ""
        model = core.resolve_model(models, wanted)
        if not model:
            if wanted.endswith(":free"):
                return self.fail("no_free_route")
            if wanted in ("onerouter/auto", "auto"):
                return self.fail("auto_unresolvable")
            return self.unknown_model(wanted, models)

        # A pin is a refusal to fail over, not a preference. Docs and every model page
        # promise it is served on that host or refused — never quietly moved.
        pin = None
        requested = body.get("provider")
        if requested is not None:
            if not isinstance(requested, dict):
                return self.fail_msg("invalid_request", "provider must be an object")
            only = requested.get("only")
            if only is not None:
                if not isinstance(only, list) or not all(isinstance(h, str) for h in only):
                    return self.fail_msg(
                        "invalid_request", "provider.only must be an array of host names")
                if engine.LIVE:
                    # With a real upstream the provider list belongs to it, so the
                    # pin is forwarded and the upstream decides. Refusing here
                    # against our own `hosts` would reject every valid provider.
                    pin = only
                else:
                    allowed = [h for h in model["hosts"] if h in only]
                    if not allowed:
                        return self.fail_msg(
                            "model_unavailable",
                            f"{model['id']} is not served by {', '.join(only)}. Its "
                            f"hosts are {', '.join(model['hosts'])}.")
                    model = {**model, "hosts": allowed}

        free = "free" in model["tags"]
        prompt_text = "\n".join(str(m.get("content", "")) for m in messages)
        prompt_tokens = engine.count_tokens(prompt_text)
        if prompt_tokens > model["context_length"]:
            return self.fail("context_too_long",
                             f"{prompt_tokens} tokens against a "
                             f"{model['context_length']} window")

        quota = STORE.open_tier(acct)
        if free:
            if quota["requests"] >= core.FREE_REQUESTS_PER_DAY or \
               quota["tokens"] >= core.FREE_TOKENS_PER_DAY:
                return self.fail("free_quota_exceeded")
        elif acct["balance_usd"] <= 0:
            # State the real figures. The catalog message carried example numbers,
            # which told a caller with nothing that they had $4.23.
            return self.fail_msg(
                "insufficient_credit",
                f"This key's balance is ${acct['balance_usd']:.4f}. "
                f"{model['id']} costs ${model['per_m']['in']}/1M input and "
                f"${model['per_m']['out']}/1M output. Nothing was sent or charged. "
                f"Top up at {SITE}/pay, or send a free model — "
                f"{SITE}/models has them under 'Free models'.")

        max_tokens = int(body.get("max_tokens") or 0)
        if free:
            max_tokens = min(max_tokens or core.FREE_MAX_OUTPUT, core.FREE_MAX_OUTPUT)

        rid = "rcp_" + secrets.token_hex(4)
        started = time.time()
        headers = {
            "x-onerouter-model": model["id"],
            "x-onerouter-provider": model["hosts"][0],
            "x-onerouter-receipt": rid,
        }
        if body.get("stream"):
            return self.stream_completion(acct, model, messages, max_tokens, rid,
                                          prompt_tokens, headers, started, free, shape,
                                          pin)
        return self.whole_completion(acct, model, messages, max_tokens, rid,
                                     prompt_tokens, headers, started, free, shape, pin)

    def unknown_model(self, wanted: str, models: list[dict]) -> None:
        """The catalog message names the id that was actually sent. A canned example
        here would send people looking for a typo they did not make."""
        spec = ERRORS["unknown_model"]
        near = difflib.get_close_matches(wanted, [m["id"] for m in models], n=1, cutoff=0.4)
        message = f"Unknown model {wanted!r}." if wanted else "No model was given."
        if near:
            message += f" The closest catalog id is {near[0]!r}."
        message += f" The full catalog is {SITE}/models, or GET /v1/catalog."
        self.reply(spec["http"], {"error": {
            "code": "unknown_model", "type": spec["type"], "message": message,
            "retryable": spec["retryable"]}})

    @staticmethod
    def upstream_code(err) -> str:
        """Map an upstream status onto the documented error for it.

        Reporting every upstream failure as `upstream_error` hides the difference
        between "wait and retry" and "this will never work", which is the whole point
        of having a catalog of codes.
        """
        if getattr(err, "timeout", False):
            return "request_timeout"
        return {
            429: "rate_limited",
            404: "unknown_model",
            400: "invalid_request",
            402: "insufficient_credit",
            503: "model_unavailable",
        }.get(getattr(err, "status", 0), "upstream_error")

    def settle(self, acct, model, rid, prompt_tokens, completion_tokens, ttft, free):
        cost = 0.0 if free else core.price(model, prompt_tokens, completion_tokens)
        receipt = {
            "id": rid, "account": acct["id"], "model": model["id"],
            "provider": model["hosts"][0], "candidates": model["hosts"],
            "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens,
            "cost_usd": cost, "ttft_ms": ttft, "free": free,
            "created": int(time.time()),
        }
        STORE.charge(acct, cost, receipt)
        if free:
            STORE.spend_open_tier(acct, prompt_tokens + completion_tokens)
        return cost

    def whole_completion(self, acct, model, messages, max_tokens, rid, prompt_tokens,
                         headers, started, free, shape="openai", pin=None):
        ttft, pieces, usage = None, [], {}
        try:
            for piece in engine.stream(model, messages, max_tokens, usage, pin):
                if ttft is None:
                    ttft = int((time.time() - started) * 1000)
                pieces.append(piece)
        except engine.UpstreamError as err:
            return self.fail_msg(self.upstream_code(err), err.message)

        text = "".join(pieces)
        # The upstream's own counts win; the estimate is the fallback.
        prompt_tokens = usage.get("prompt_tokens") or prompt_tokens
        completion_tokens = usage.get("completion_tokens") or engine.count_tokens(text)
        cost = self.settle(acct, model, rid, prompt_tokens, completion_tokens, ttft or 0, free)
        headers |= {"x-onerouter-ttft-ms": ttft or 0,
                    "x-onerouter-cost-usd": f"{cost:.6f}",
                    "x-onerouter-balance-usd": f"{acct['balance_usd']:.6f}"}
        if shape == "anthropic":
            return self.reply(200, {
                "id": "msg_" + rid[4:], "type": "message", "role": "assistant",
                "model": model["id"], "stop_reason": "end_turn", "stop_sequence": None,
                "content": [{"type": "text", "text": text}],
                "usage": {"input_tokens": prompt_tokens,
                          "output_tokens": completion_tokens},
            }, headers)
        return self.reply(200, {
            "id": "chatcmpl-" + rid[4:], "object": "chat.completion",
            "created": int(time.time()), "model": model["id"],
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": prompt_tokens,
                      "completion_tokens": completion_tokens,
                      "total_tokens": prompt_tokens + completion_tokens},
        }, headers)

    def stream_completion(self, acct, model, messages, max_tokens, rid, prompt_tokens,
                          headers, started, free, shape="openai", pin=None):
        # Cost and balance cannot ride in the headers here: they are not known until the
        # last token. They go in the final frame, the way include_usage does upstream.
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        for k, v in headers.items():
            self.send_header(k, str(v))
        self._cors()
        self.end_headers()

        created, cid = int(time.time()), "chatcmpl-" + rid[4:]
        anthropic = shape == "anthropic"

        def frame(payload: dict, event: str | None = None) -> bool:
            # Anthropic's stream is a sequence of named events; OpenAI's is one shape.
            try:
                prefix = f"event: {event}\n" if event else ""
                self.wfile.write(f"{prefix}data: {json.dumps(payload)}\n\n".encode())
                self.wfile.flush()
                return True
            except (BrokenPipeError, ConnectionResetError):
                return False  # the client hung up; settle what was produced

        def envelope(delta: dict, finish=None) -> dict:
            return {"id": cid, "object": "chat.completion.chunk", "created": created,
                    "model": model["id"],
                    "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}

        ttft, text, alive, usage = None, [], True, {}
        if anthropic:
            frame({"type": "message_start", "message": {
                "id": "msg_" + rid[4:], "type": "message", "role": "assistant",
                "model": model["id"], "content": [],
                "usage": {"input_tokens": prompt_tokens, "output_tokens": 0}}},
                "message_start")
            frame({"type": "content_block_start", "index": 0,
                   "content_block": {"type": "text", "text": ""}}, "content_block_start")
        else:
            frame(envelope({"role": "assistant"}))
        try:
            for piece in engine.stream(model, messages, max_tokens, usage, pin):
                if ttft is None:
                    ttft = int((time.time() - started) * 1000)
                text.append(piece)
                sent = frame({"type": "content_block_delta", "index": 0,
                              "delta": {"type": "text_delta", "text": piece}},
                             "content_block_delta") if anthropic \
                    else frame(envelope({"content": piece}))
                if not sent:
                    alive = False
                    break
        except engine.UpstreamError as err:
            _, payload = error_body(self.upstream_code(err), err.message)
            frame(payload)
            alive = False

        prompt_tokens = usage.get("prompt_tokens") or prompt_tokens
        completion_tokens = (usage.get("completion_tokens")
                             or (engine.count_tokens("".join(text)) if text else 0))
        cost = self.settle(acct, model, rid, prompt_tokens, completion_tokens,
                           ttft or 0, free)
        meter = {"receipt": rid, "cost_usd": cost,
                 "balance_usd": round(acct["balance_usd"], 6),
                 "ttft_ms": ttft or 0,
                 "provider": usage.get("provider") or model["hosts"][0]}
        if alive and anthropic:
            frame({"type": "content_block_stop", "index": 0}, "content_block_stop")
            frame({"type": "message_delta",
                   "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                   "usage": {"output_tokens": completion_tokens},
                   "x_onerouter": meter}, "message_delta")
            frame({"type": "message_stop"}, "message_stop")
        elif alive:
            frame(envelope({}, finish="stop"))
            frame({"id": cid, "object": "chat.completion.chunk", "created": created,
                   "model": model["id"], "choices": [],
                   "usage": {"prompt_tokens": prompt_tokens,
                             "completion_tokens": completion_tokens,
                             "total_tokens": prompt_tokens + completion_tokens},
                   "x_onerouter": meter})
            try:
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
        self.close_connection = True


def main() -> None:
    # stdout is block-buffered when it is not a terminal, so a banner written
    # with plain print never reaches a log file until the buffer fills.
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:  # pragma: no cover - very old interpreters
        pass
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"{NAV['brand']} gateway on http://127.0.0.1:{port}")
    print(f"  engine:  {engine.describe()}")
    print(f"  catalog: {len(core.catalog())} models")
    print(f"  state:   {core.STATE}")
    if LOADED_ENV:
        print(f"  .env:    loaded {len(LOADED_ENV)} setting(s): "
              f"{', '.join(sorted(LOADED_ENV))}")
    if DEV_CREDIT:
        print("  credit:  POST /v1/me/credit is OPEN — development only")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
