#!/usr/bin/env python3
"""Rebuild data/models.json from the configured upstream.

    ONEROUTER_UPSTREAM_KEY=... python3 tools/sync_catalog.py

The catalog shipped with this repo was invented, which was fine while the engine was
local and nothing was routed anywhere. Once a real upstream is configured those ids
are worse than useless: every request fails, because no such model exists.

This writes real ids, real context windows and real prices, so what the site lists is
what a request can actually reach.

Prices are the upstream's plus `ONEROUTER_MARKUP` (default 5%), which is what the
site means by "prices include our fee". The upstream figure is kept alongside so the
margin is inspectable rather than implied.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "models.json"
UPSTREAM = os.environ.get("ONEROUTER_UPSTREAM_URL", "https://openrouter.ai/api/v1")
KEY = os.environ.get("ONEROUTER_UPSTREAM_KEY", "")
MARKUP = float(os.environ.get("ONEROUTER_MARKUP", "0.05"))

# The upstream calls a PDF/document input "file"; the site says "pdf".
MODALITY = {"text": "text", "image": "image", "file": "pdf", "audio": "audio",
            "video": "video"}


def fetch(path: str) -> dict:
    req = urllib.request.Request(
        f"{UPSTREAM}{path}",
        headers={"Accept": "application/json", "User-Agent": "onerouter-sync/1.0",
                 **({"Authorization": f"Bearer {KEY}"} if KEY else {})})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read())


def clean_name(raw: str) -> str:
    """"Vendor: Model Name" -> "Model Name". The vendor is already the author."""
    return raw.split(": ", 1)[1].strip() if ": " in raw else raw.strip()


def per_million(price: str) -> float:
    try:
        return round(float(price) * 1_000_000 * (1 + MARKUP), 6)
    except (TypeError, ValueError):
        return 0.0


def tags_for(entry: dict, per_in: float, context: int) -> list[str]:
    tags = []
    if per_in == 0:
        tags.append("free")
    elif per_in <= 0.20:
        tags.append("cheap")
    if per_in >= 5:
        tags.append("frontier")
    blob = f"{entry['id']} {entry['name']}".lower()
    if any(word in blob for word in ("code", "coder", "codex")):
        tags.append("code")
    if any(word in blob for word in ("reason", "thinking", "-r1", "think")):
        tags.append("reasoning")
    if context >= 1_000_000:
        tags.append("long-context")
    return tags[:3]


def build() -> list[dict]:
    raw = fetch("/models")["data"]
    models = []
    for entry in raw:
        mid = entry.get("id") or ""
        # Alias rows like "~vendor/model-latest" move under you; pin real ids only.
        if not mid or mid.startswith("~") or "/" not in mid:
            continue
        pricing = entry.get("pricing") or {}
        prompt, completion = pricing.get("prompt", "0"), pricing.get("completion", "0")
        # A model with no published price cannot be billed honestly.
        if prompt in (None, "", "-1") or completion in (None, "", "-1"):
            continue
        context = int(entry.get("context_length") or 0)
        if not context:
            continue
        top = entry.get("top_provider") or {}
        max_out = int(top.get("max_completion_tokens") or 0) or min(context, 8192)
        arch = entry.get("architecture") or {}
        mods = [MODALITY[m] for m in (arch.get("input_modalities") or ["text"])
                if m in MODALITY] or ["text"]
        per_in, per_out = per_million(prompt), per_million(completion)

        models.append({
            "id": mid,
            "name": clean_name(entry.get("name") or mid),
            "author": mid.split("/", 1)[0],
            "context_length": context,
            "max_output": max_out,
            "pricing": {"prompt": f"{float(prompt) * (1 + MARKUP):.12f}".rstrip("0"),
                        "completion": f"{float(completion) * (1 + MARKUP):.12f}".rstrip("0")},
            "per_m": {"in": per_in, "out": per_out},
            "upstream_per_m": {"in": round(float(prompt) * 1e6, 6),
                               "out": round(float(completion) * 1e6, 6)},
            "input_modalities": mods,
            "tags": tags_for(entry, per_in, context),
            # The gateway routes through one upstream, which does its own provider
            # selection. Claiming a list of hosts here would be invention.
            "hosts": ["openrouter"],
        })

    # Cheapest first is the order the site treats as "catalog order".
    models.sort(key=lambda m: (m["per_m"]["in"], m["id"]))
    return models


def main() -> int:
    models = build()
    if not models:
        print("no usable models came back", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps(models, indent=2) + "\n")
    free = [m for m in models if "free" in m["tags"]]
    print(f"wrote {len(models)} models to {OUT.relative_to(ROOT)}")
    print(f"  markup: {MARKUP:.0%}")
    print(f"  free:   {len(free)}")
    print(f"  authors:{len({m['author'] for m in models})}")
    cheapest = min((m for m in models if m["per_m"]["in"] > 0),
                   key=lambda m: m["per_m"]["in"], default=None)
    if cheapest:
        print(f"  cheapest paid: {cheapest['id']} at ${cheapest['per_m']['in']}/1M in")
    return 0


if __name__ == "__main__":
    sys.exit(main())
