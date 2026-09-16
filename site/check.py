#!/usr/bin/env python3
"""Post-build checks.

    python3 site/build.py && python3 site/check.py

Link audit, plus a guard for the failure that does not announce itself: an edit to
the stylesheet that removes rules another page depended on. A page whose CSS has gone
still builds, still returns 200, and still passes a link check — it just looks broken.
"""

from __future__ import annotations

import collections
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
CSS = ROOT / "site" / "assets" / "onerouter.css"

# Selectors a page is visibly wrong without.
REQUIRED_CSS = [
    ".authbox", ".auth-row", ".auth-icon", ".auth-oauth", ".auth-panel",
    ".app", ".side", ".chatmain", ".chathero", ".composer", ".turn", ".chatpick",
    ".keycard", ".paycard", ".qrbox", ".step", ".flow", ".pay-row",
    ".rail-opt", ".strip", ".cat-head", ".pager", ".mod", ".table-wrap", ".brand", ".tag",
]

# Elements the scripts look up by id. A renamed id leaves a dead page, not an error.
REQUIRED_IDS = {
    "chat/index.html": ["chat", "chat-log", "chat-input", "chat-form", "chat-pick",
                        "chat-models", "convos", "balance", "keygate", "spend"],
    "signin/index.html": ["signin", "auth-panel", "auth-status"],
    "keys/index.html": ["getkey", "flow", "go-key", "go-pay", "the-key", "qr",
                        "pay-address", "pay-amount", "pay-state"],
    "pay/index.html": ["pay", "pay-flow", "pay-start", "pay-amounts",
                       "pay-address", "pay-amount", "pay-qr", "pay-copy",
                       "pay-state", "pay-rows"],
    "models/index.html": ["catalog", "model-table", "model-search", "model-sort",
                          "model-count", "model-none", "page-prev", "page-next",
                          "page-label"],
    "pricing/index.html": ["calc", "calc-model", "calc-total"],
}

fails: list[str] = []


def note(ok: bool, label: str) -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        fails.append(label)


def check_links() -> None:
    def resolves(href: str) -> bool:
        path = href.split("#")[0].split("?")[0]
        if not path:
            return True
        target = PUB / path.lstrip("/")
        return target.exists() or (target / "index.html").exists()

    bad: dict[str, set[str]] = collections.defaultdict(set)
    for page in PUB.rglob("*.html"):
        text = page.read_text()
        ids = set(re.findall(r'id="([^"]+)"', text))
        for href in re.findall(r'href="([^"]+)"', text):
            if href.startswith(("http", "mailto:", "data:")):
                continue
            if href.startswith("#"):
                if href[1:] not in ids:
                    bad[href].add(page.name)
            elif not resolves(href):
                bad[href].add(page.name)
    note(not bad, f"every internal link resolves{'' if not bad else f' — {dict(bad)}'}")


def check_css() -> None:
    css = CSS.read_text()
    missing = [sel for sel in REQUIRED_CSS
               if not re.search(rf"(^|[,\s]){re.escape(sel)}[\s,{{:.\[]", css, re.M)]
    note(not missing, f"stylesheet keeps every required rule{'' if not missing else f' — missing {missing}'}")


def check_ids() -> None:
    for page, ids in REQUIRED_IDS.items():
        path = PUB / page
        if not path.exists():
            note(False, f"{page} was built")
            continue
        text = path.read_text()
        missing = [i for i in ids if f'id="{i}"' not in text]
        note(not missing, f"{page} keeps its script hooks"
                          f"{'' if not missing else f' — missing {missing}'}")


def main() -> int:
    if not PUB.exists():
        print("public/ is missing — run: python3 site/build.py")
        return 1
    print("checks:")
    check_links()
    check_css()
    check_ids()
    print(f"\n{'all good' if not fails else f'{len(fails)} problem(s)'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
