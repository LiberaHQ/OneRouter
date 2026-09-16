#!/usr/bin/env python3
"""Build the OneRouter documentation site.

Markdown in docs/ becomes static HTML in public/. Stdlib only: the site has to build
on a clean machine with no network and no package manager, because that is the same
promise the runtime makes.

The Markdown subset is deliberate rather than partial -- it covers exactly what the
docs use, and an unsupported construct is meant to look wrong so it gets noticed.
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = ROOT / "public"
ASSETS = Path(__file__).resolve().parent / "assets"

NAV = json.loads((DOCS / "_nav.json").read_text())
BRAND, DOMAIN = NAV["brand"], NAV["domain"]
# Point every snippet, doc and page at a different gateway for a local build:
#   ONEROUTER_API=http://127.0.0.1:8080/v1 python3 site/build.py
API = os.environ.get("ONEROUTER_API") or NAV["api"]


def asset_tag() -> str:
    """Short digest of the CSS and JS, appended to their URLs so a changed asset is
    always fetched rather than served from a stale cache."""
    import hashlib
    h = hashlib.sha256()
    for name in ("onerouter.css", "onerouter.js"):
        h.update((ASSETS / name).read_bytes())
    return h.hexdigest()[:8]

MARK = (
    '<span class="mark" aria-hidden="true">'
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" '
    'stroke-linecap="round">'
    '<path d="M5.95 12H17.75"/>'
    '<path d="M12.8 12c3.69 0 3.69-6 4.95-6"/>'
    '<path d="M12.8 12c3.69 0 3.69 6 4.95 6"/>'
    '<circle cx="4.2" cy="12" r="1.75" fill="currentColor" stroke="none"/>'
    '<circle cx="19.5" cy="6" r="1.75" fill="currentColor" stroke="none"/>'
    '<circle cx="19.5" cy="12" r="1.75" fill="currentColor" stroke="none"/>'
    '<circle cx="19.5" cy="18" r="1.75" fill="currentColor" stroke="none"/>'
    '</svg></span>'
)

SITE = f"https://{DOMAIN}"
ASSET = "dev"

VARS = {"{{BRAND}}": BRAND, "{{API}}": API, "{{SITE}}": SITE, "{{DOMAIN}}": DOMAIN}


def subst(text: str) -> str:
    for k, v in VARS.items():
        text = text.replace(k, v)
    return text


def slug(text: str) -> str:
    s = re.sub(r"<[^>]+>", "", text).lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    return re.sub(r"[\s-]+", "-", s).strip("-")


# ── Inline ───────────────────────────────────────────────────────────────────

def inline(text: str) -> str:
    """Escape first, then re-introduce only the markup we support."""
    out = html.escape(text, quote=False)
    codes: list[str] = []

    def stash(m):
        codes.append(m.group(1))
        return f"\x00{len(codes) - 1}\x00"

    out = re.sub(r"`([^`]+)`", stash, out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", out)
    out = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>',
        out,
    )
    return re.sub(r"\x00(\d+)\x00", lambda m: f"<code>{codes[int(m.group(1))]}</code>", out)


# ── Syntax highlighting ──────────────────────────────────────────────────────
# Token-level, language-agnostic. Anything richer needs a real lexer, and a real
# lexer is a dependency.

KEYWORDS = {
    "curl", "export", "import", "from", "const", "await", "async", "for", "def", "print",
    "client", "true", "false", "null", "True", "False", "None", "let", "var", "func",
    "return", "package", "class", "new", "of", "in", "if", "else", "GET", "POST",
    "PATCH", "DELETE", "HTTP", "claude", "aider", "pip", "npm",
}


def highlight(code: str) -> str:
    out: list[str] = []
    pattern = re.compile(
        r"(?P<com>(?<!:)//[^\n]*|#[^\n]*)"
        r"|(?P<str>\"(?:[^\"\\\n]|\\.)*\"|'(?:[^'\\\n]|\\.)*')"
        r"|(?P<url>https?://[^\s\"'<>)]+)"
        r"|(?P<flag>(?<=\s)-{1,2}[A-Za-z][\w-]*)"
        r"|(?P<num>\b\d[\d_,.]*\b)"
        r"|(?P<word>[A-Za-z_$][\w$]*)"
    )
    pos = 0
    for m in pattern.finditer(code):
        out.append(html.escape(code[pos:m.start()], quote=False))
        kind = m.lastgroup
        raw = html.escape(m.group(), quote=False)
        if kind == "word":
            out.append(f'<span class="t-kw">{raw}</span>' if m.group() in KEYWORDS else raw)
        else:
            out.append(f'<span class="t-{kind[:3]}">{raw}</span>')
        pos = m.end()
    out.append(html.escape(code[pos:], quote=False))
    return "".join(out)


def code_block(label: str, code: str, *, tabs: list[tuple[str, str]] | None = None) -> str:
    """One code panel. With `tabs`, the bar carries a tab strip instead of a label."""
    if tabs:
        strip = "".join(
            f'<button class="tab" role="tab" data-i="{i}" '
            f'aria-selected="{"true" if i == 0 else "false"}">{html.escape(name)}</button>'
            for i, (name, _) in enumerate(tabs)
        )
        panes = "".join(
            f'<pre data-i="{i}"{"" if i == 0 else " hidden"}><code>{highlight(body.strip())}'
            f"</code></pre>"
            for i, (_, body) in enumerate(tabs)
        )
        first = html.escape(tabs[0][1].strip(), quote=True)
        return (
            f'<div class="code" data-tabs><div class="code-bar">'
            f'<div class="tabs-strip" role="tablist">{strip}</div>'
            f'<button class="copy" data-copy="{first}">Copy</button></div>{panes}</div>'
        )
    return (
        f'<div class="code"><div class="code-bar"><span class="lang">{html.escape(label)}</span>'
        f'<button class="copy" data-copy="{html.escape(code.strip(), quote=True)}">Copy</button>'
        f'</div><pre><code>{highlight(code.strip())}</code></pre></div>'
    )


# ── Directives ───────────────────────────────────────────────────────────────

def render_callout(head: str, body: list[str]) -> str:
    kind = ""
    for word in ("warn", "note"):
        if head.startswith(word + " ") or head == word:
            kind, head = " " + word, head[len(word):].strip()
    title = f'<div class="c-title">{inline(head)}</div>' if head else ""
    paras = "".join(f"<p>{inline(p)}</p>" for p in split_paragraphs(body))
    return f'<div class="callout{kind}">{title}{paras}</div>'


def render_steps(body: list[str]) -> str:
    items, cur = [], []
    for line in body:
        if re.match(r"^\d+\.\s", line):
            if cur:
                items.append(" ".join(cur))
            cur = [re.sub(r"^\d+\.\s+", "", line)]
        elif line.strip() and cur:
            cur.append(line.strip())
        elif not line.strip() and cur:
            items.append(" ".join(cur))
            cur = []
    if cur:
        items.append(" ".join(cur))
    lis = "".join(f"<li>{inline(i)}</li>" for i in items)
    return f'<ol class="steps">{lis}</ol>'


def render_cards(body: list[str]) -> str:
    items, cur = [], []
    for line in body:
        if line.startswith("- "):
            if cur:
                items.append(" ".join(cur))
            cur = [line[2:]]
        elif line.strip() and cur:
            cur.append(line.strip())
    if cur:
        items.append(" ".join(cur))
    cards = "".join(f'<div class="card">{inline(i)}</div>' for i in items)
    return f'<div class="cards">{cards}</div>'


def render_tabs(body: list[str]) -> str:
    tabs, name, buf = [], None, []
    for line in body:
        if line.startswith("--- "):
            if name is not None:
                tabs.append((name, "\n".join(buf)))
            name, buf = line[4:].strip(), []
        elif name is not None:
            buf.append(line)
    if name is not None:
        tabs.append((name, "\n".join(buf)))
    return code_block("", "", tabs=tabs) if tabs else ""


EXTRA_TOC: list[tuple[int, str, str]] = []


def render_errors() -> str:
    errors = json.loads(subst((DOCS / "_errors.json").read_text()))
    EXTRA_TOC.extend((2, e["code"], e["code"]) for e in errors)
    rows = "".join(
        f'<a class="err-row" href="#{e["code"]}">'
        f'<span class="c">{e["code"]}</span>'
        f'<span class="h">{e["http"]}</span>'
        f'<span class="r {"yes" if e["retryable"] else ""}">'
        f'{"retryable" if e["retryable"] else "terminal"}</span></a>'
        for e in errors
    )
    blocks = []
    for e in errors:
        retry = (
            '<span class="tag retry">retryable</span>'
            if e["retryable"]
            else '<span class="tag">not retryable</span>'
        )
        blocks.append(
            f'<section class="err" id="{e["code"]}">'
            f'<div class="err-head"><h3>{html.escape(e["title"])}'
            f'<a class="anchor" href="#{e["code"]}" aria-label="Link to this error">#</a></h3>'
            f'<span class="tag">HTTP {e["http"]}</span>'
            f'<span class="tag">{e["type"]}</span>{retry}</div>'
            + code_block(e["code"], e["message"])
            + f'<p class="err-fix"><b>Fix.</b> {inline(e["fix"])}</p></section>'
        )
    return f'<div class="err-index">{rows}</div>' + "".join(blocks)


DIRECTIVES = {
    "callout": lambda head, body: render_callout(head, body),
    "steps": lambda head, body: render_steps(body),
    "cards": lambda head, body: render_cards(body),
    "tabs": lambda head, body: render_tabs(body),
    "errors": lambda head, body: render_errors(),
}


def split_paragraphs(lines: list[str]) -> list[str]:
    paras, cur = [], []
    for line in lines:
        if line.strip():
            cur.append(line.strip())
        elif cur:
            paras.append(" ".join(cur))
            cur = []
    if cur:
        paras.append(" ".join(cur))
    return paras


# ── Block parser ─────────────────────────────────────────────────────────────

def render_markdown(md: str) -> tuple[str, list[tuple[int, str, str]]]:
    """Return (html, toc) where toc entries are (level, id, text)."""
    lines = md.split("\n")
    out: list[str] = []
    toc: list[tuple[int, str, str]] = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # fenced code
        if line.startswith("```"):
            lang = line[3:].strip() or "text"
            body, i = [], i + 1
            while i < len(lines) and not lines[i].startswith("```"):
                body.append(lines[i])
                i += 1
            out.append(code_block(lang, "\n".join(body)))
            i += 1
            continue

        # ::directive
        if line.startswith("::") and line[2:3] not in ("", ":"):
            head = line[2:].strip()
            name = head.split(" ", 1)[0]
            rest = head[len(name):].strip()
            body, i = [], i + 1
            while i < len(lines) and lines[i].rstrip() != "::":
                body.append(lines[i])
                i += 1
            out.append(DIRECTIVES.get(name, lambda h, b: "")(rest, body))
            i += 1
            continue
        if line.strip() == "::errors":
            out.append(render_errors())
            i += 1
            continue

        # heading
        if m := re.match(r"^(#{2,3})\s+(.*)", line):
            level, text = len(m.group(1)), m.group(2).strip()
            hid = slug(text)
            toc.append((level, hid, re.sub(r"`", "", text)))
            out.append(
                f'<h{level} id="{hid}">{inline(text)}'
                f'<a class="anchor" href="#{hid}" aria-label="Link to this section">#</a>'
                f"</h{level}>"
            )
            i += 1
            continue

        # table
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1]):
            cells = [c.strip() for c in line.strip("|").split("|")]
            head = "".join(f"<th>{inline(c)}</th>" for c in cells)
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cols = [c.strip() for c in lines[i].strip("|").split("|")]
                rows.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cols) + "</tr>")
                i += 1
            out.append(
                f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead>'
                f'<tbody>{"".join(rows)}</tbody></table></div>'
            )
            continue

        # list
        if re.match(r"^(\s*)([-*]|\d+\.)\s+", line):
            ordered = bool(re.match(r"^\s*\d+\.\s", line))
            items, cur = [], []
            while i < len(lines) and (
                re.match(r"^(\s*)([-*]|\d+\.)\s+", lines[i]) or (lines[i].startswith("  ") and cur)
            ):
                if re.match(r"^(\s*)([-*]|\d+\.)\s+", lines[i]):
                    if cur:
                        items.append(" ".join(cur))
                    cur = [re.sub(r"^(\s*)([-*]|\d+\.)\s+", "", lines[i])]
                else:
                    cur.append(lines[i].strip())
                i += 1
            if cur:
                items.append(" ".join(cur))
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(t)}</li>" for t in items) + f"</{tag}>")
            continue

        if line.strip() == "---":
            out.append("<hr>")
            i += 1
            continue

        # paragraph
        if line.strip():
            para = []
            while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "|", "```", "::")):
                para.append(lines[i].strip())
                i += 1
            if para:
                out.append(f'<p>{inline(" ".join(para))}</p>')
            continue

        i += 1

    return "\n".join(out), toc + EXTRA_TOC


def parse_front_matter(raw: str) -> tuple[dict, str]:
    if not raw.startswith("---\n"):
        return {}, raw
    _, block, body = raw.split("---\n", 2)
    meta = {}
    for line in block.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body


# ── Templates ────────────────────────────────────────────────────────────────

TOP_NAV = [("Docs", "/docs/quickstart"), ("Models", "/models"),
           ("Pricing", "/pricing"), ("Status", "/status")]

FOOTER_COLS = [
    ("Docs", [("Quickstart", "/docs/quickstart"), ("Open Tier", "/docs/open-tier"),
              ("Authentication", "/docs/authentication"), ("Models", "/docs/models"),
              ("Streaming", "/docs/streaming"), ("Errors", "/docs/errors")]),
    ("Operate", [("Budgets", "/docs/budgets"), ("Failover", "/docs/failover"),
                 ("Billing", "/docs/billing"), ("Data handling", "/docs/privacy")]),
    ("Build", [("Client setup", "/docs/integrations"), ("Agent resources", "/docs/agent-resources"),
               ("Model catalog", "/models"), ("llms.txt", "/llms.txt")]),
    ("Platform", [("Sign in", "/signin"), ("Add credit", "/pay"), ("Pricing", "/pricing"),
                  ("Status", "/status"), ("Changelog", "/changelog"), ("Support", "/support")]),
]


def shell(*, title, description, body, active="", canonical="/", extra_class="",
          chrome: bool = True) -> str:
    nav = "".join(
        f'<a href="{href}"{" aria-current=\"page\"" if label.lower() == active else ""}>{label}</a>'
        for label, href in TOP_NAV
    )
    cols = "".join(
        f"<div><h6>{name}</h6><ul>"
        + "".join(f'<li><a href="{href}">{label}</a></li>' for label, href in links)
        + "</ul></div>"
        for name, links in FOOTER_COLS
    )
    header = f"""<header class="top">
  <div class="top-in">
    <button class="btn icon-btn ghost rail-toggle" aria-label="Toggle navigation" data-rail>≡</button>
    <a class="brand" href="/">{MARK}<span>{BRAND}</span></a>
    <nav>{nav}</nav>
    <span class="spacer"></span>
    <div class="right">
      <button class="btn icon-btn ghost" data-theme-toggle aria-label="Toggle colour theme">◐</button>
      <a class="btn ghost" href="/docs/quickstart">Docs</a>
      <a class="btn primary" href="/signin">Get a key</a>
    </div>
  </div>
</header>
""" if chrome else ""
    footer = f"""<footer class="foot">
  <div class="foot-in">
    <div>
      <a class="brand" href="/">{MARK}<span>{BRAND}</span></a>
      <p class="blurb">One key for every model. No account, no card, no lock-in.</p>
      <div class="urlchip"><code>{API}</code>
        <button class="copy" data-copy="{API}">Copy</button></div>
    </div>
    {cols}
  </div>
  <div class="foot-base">
    <a href="/legal/terms">Terms</a><a href="/legal/privacy">Privacy</a>
    <a href="/legal/refunds">Refunds</a><a href="/legal/acceptable-use">Acceptable use</a>
    <span class="spacer"></span><span>© 2026 {BRAND}</span>
  </div>
</footer>
""" if chrome else ""
    return f"""<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description, quote=True)}">
<link rel="canonical" href="{SITE}{canonical}">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{html.escape(description, quote=True)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="/assets/onerouter.css?v={ASSET}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23F2A93B'/><g transform='translate(4 4)' fill='none' stroke='%230C0D10' stroke-width='2.1' stroke-linecap='round'><path d='M5.95 12H17.75'/><path d='M12.8 12c3.69 0 3.69-6 4.95-6'/><path d='M12.8 12c3.69 0 3.69 6 4.95 6'/><circle cx='4.2' cy='12' r='1.75' fill='%230C0D10' stroke='none'/><circle cx='19.5' cy='6' r='1.75' fill='%230C0D10' stroke='none'/><circle cx='19.5' cy='12' r='1.75' fill='%230C0D10' stroke='none'/><circle cx='19.5' cy='18' r='1.75' fill='%230C0D10' stroke='none'/></g></svg>">
<script>try{{var t=localStorage.getItem('or-theme');if(t)document.documentElement.dataset.theme=t;}}catch(e){{}}</script>
</head>
<body class="{extra_class}">
{header}{body}{footer}<script src="/assets/onerouter.js?v={ASSET}" defer></script>
</body>
</html>"""


def rail(active_slug: str) -> str:
    groups = []
    for group in NAV["groups"]:
        links = "".join(
            f'<a href="/docs/{s}"{" aria-current=\"page\"" if s == active_slug else ""}>'
            f"{PAGES[s]['meta'].get('nav', PAGES[s]['meta']['title'])}</a>"
            for s in group["pages"]
        )
        groups.append(f'<div class="rail-group"><h4>{group["label"]}</h4>{links}</div>')
    return f'<aside class="rail"><div class="rail-title">Documentation</div>{"".join(groups)}</aside>'


def toc_html(toc: list[tuple[int, str, str]]) -> str:
    if len(toc) < 2:
        return '<aside class="toc"></aside>'
    items = "".join(
        f'<li class="lvl{lvl}"><a href="#{hid}">{html.escape(text)}</a></li>' for lvl, hid, text in toc
    )
    return f'<aside class="toc"><h5>On this page</h5><ul>{items}</ul></aside>'


def page_nav(slug_: str) -> str:
    order = [s for g in NAV["groups"] for s in g["pages"]]
    idx = order.index(slug_)
    parts = []
    if idx > 0:
        prev = order[idx - 1]
        parts.append(
            f'<a href="/docs/{prev}"><span class="dir">← Previous</span>'
            f'<span class="name">{PAGES[prev]["meta"]["title"]}</span></a>'
        )
    if idx < len(order) - 1:
        nxt = order[idx + 1]
        parts.append(
            f'<a class="next" href="/docs/{nxt}"><span class="dir">Next →</span>'
            f'<span class="name">{PAGES[nxt]["meta"]["title"]}</span></a>'
        )
    return f'<nav class="pagenav">{"".join(parts)}</nav>'


# ── Build ────────────────────────────────────────────────────────────────────

PAGES: dict[str, dict] = {}


def load_pages() -> None:
    for path in DOCS.glob("*.md"):
        meta, body = parse_front_matter(path.read_text())
        PAGES[path.stem] = {"meta": meta, "body": subst(body), "raw": subst(path.read_text())}


def build_doc(slug_: str) -> None:
    page = PAGES[slug_]
    meta = page["meta"]
    EXTRA_TOC.clear()
    body_html, toc = render_markdown(page["body"])

    chip = f'<span class="meta-chip">{html.escape(meta["time"])}</span>' if meta.get("time") else ""
    article = f"""<main class="article">
  <div class="crumbs"><a href="/docs/quickstart">Docs</a> <span>/</span>
    <span>{html.escape(meta.get("nav", meta["title"]))}</span></div>
  <div class="head-line"><span class="kicker">{html.escape(meta.get("kicker", "Documentation"))}</span>{chip}</div>
  <h1>{html.escape(meta["title"])}</h1>
  <p class="lede">{inline(meta.get("description", ""))}</p>
  {body_html}
  {page_nav(slug_)}
</main>"""

    out = shell(
        title=f"{meta['title']} · {BRAND} docs",
        description=meta.get("description", ""),
        body=f'<div class="docs">{rail(slug_)}{article}{toc_html(toc)}</div>',
        active="docs",
        canonical=f"/docs/{slug_}",
    )
    write(OUT / "docs" / slug_ / "index.html", out)
    # Same page as clean Markdown, for agents.
    write(OUT / "docs" / f"{slug_}.md", page["raw"])


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def build_llms() -> None:
    order = [s for g in NAV["groups"] for s in g["pages"]]
    index = [
        f"# {BRAND}", "",
        f"> {BRAND} is an OpenAI-compatible LLM gateway at {API}. One prepaid key reaches "
        f"every model in the catalog, with same-model host failover and no account requirement.",
        "", f"Keys are created at {SITE}/keys before payment. Model IDs use author/name form.", "",
        "## Documentation", "",
    ]
    for s in order:
        m = PAGES[s]["meta"]
        index.append(f"- [{m['title']}]({SITE}/docs/{s}.md): {m.get('description', '')}")
    index += ["", "## Machine-readable", "",
              f"- [Full documentation]({SITE}/llms-full.txt): every page in one response.",
              f"- [Model catalog]({SITE}/api/v1/catalog): public model metadata and pricing.",
              f"- [Agent onboarding]({SITE}/agents.md): configure a client from scratch.", ""]
    write(OUT / "llms.txt", "\n".join(index))

    full = [f"# {BRAND} documentation", "",
            f"> Complete machine-readable documentation. Shorter index: {SITE}/llms.txt", "", "---", ""]
    for s in order:
        full += [f"Document: {SITE}/docs/{s}", f"Markdown: {SITE}/docs/{s}.md", "",
                 PAGES[s]["raw"].split("---\n", 2)[-1].strip(), "", "---", ""]
    write(OUT / "llms-full.txt", "\n".join(full))

    write(OUT / "agents.md", subst(f"""# Configuring {BRAND}

Base URL: {API}
Auth header: Authorization: Bearer or-live-<32 base58>
Environment variable used in every example: ONEROUTER_KEY
Get a key: {SITE}/keys (no account required, keys exist before payment)

## Working request

curl {API}/chat/completions \\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{{"model":"meta-llama/llama-3.3-70b-instruct","messages":[{{"role":"user","content":"ping"}}]}}'

## Rules that prevent the common failures

1. The base URL already ends in /v1. Never append /chat/completions to a base-URL field.
2. Model IDs are author/name. Client aliases such as "sonnet" are not model IDs.
3. Confirm any model id against {SITE}/api/v1/catalog before using it.
4. Send onerouter/auto to let the gateway choose; onerouter/auto:free costs $0.
5. Every error carries a stable code documented at {SITE}/docs/errors#<code>.

## Recovery

401 invalid_api_key      -> the key is wrong or revoked; mint a new one.
402 insufficient_credit  -> add credit; the message names the shortfall.
404 unknown_model        -> use the did-you-mean id from the message.
429 rate_limited         -> honour Retry-After, then retry unchanged.
503 model_unavailable    -> retry, or use an alternative named in the message.

Full corpus: {SITE}/llms-full.txt
"""))


def main() -> None:
    global ASSET
    ASSET = asset_tag()
    if OUT.exists():
        shutil.rmtree(OUT)
    load_pages()
    for slug_ in PAGES:
        build_doc(slug_)
    build_marketing()
    build_llms()
    shutil.copytree(ASSETS, OUT / "assets")
    write(OUT / "robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    urls = (["/", "/models", "/models/auto/free", "/pricing", "/status", "/keys", "/pay",
             "/chat", "/providers", "/changelog", "/support", "/signin"]
            + [f"/models/{m['id']}" for m in load_data("models")]
            + [f"/docs/{s}" for s in PAGES]
            + [f"/legal/{p.stem}" for p in sorted(PAGES_DIR.glob("*.md")) if p.stem != "support"])
    write(
        OUT / "sitemap.xml",
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{SITE}{u}</loc></url>\n" for u in urls)
        + "</urlset>\n",
    )
    count = len(list(OUT.rglob("*")))
    print(f"built {len(PAGES)} doc pages + {len(urls) - len(PAGES)} site pages "
          f"-> {OUT} ({count} files)")



# ── Marketing pages ──────────────────────────────────────────────────────────

def load_data(name: str):
    return json.loads((ROOT / "data" / f"{name}.json").read_text())


def money(v: float) -> str:
    if v == 0:
        return "Free"
    return f"${v:,.4f}".rstrip("0").rstrip(".") if v < 1 else f"${v:,.2f}"


def tokens(n: int) -> str:
    return f"{n // 1_000_000}M" if n >= 1_000_000 else f"{n // 1000}K"


HERO_TABS = [
    ("cURL", f"""curl {API}/chat/completions \\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "model": "onerouter/auto",
    "messages": [{{"role":"user","content":"ping"}}],
    "stream": true
  }}'"""),
    ("Python", f"""from openai import OpenAI

client = OpenAI(
    base_url="{API}",
    api_key="or-live-...",
)

client.chat.completions.create(
    model="onerouter/auto",
    messages=[{{"role": "user", "content": "ping"}}],
    stream=True,
)"""),
    ("Node.js", f"""import OpenAI from "openai";

const client = new OpenAI({{
  baseURL: "{API}",
  apiKey: process.env.ONEROUTER_KEY,
}});

await client.chat.completions.create({{
  model: "onerouter/auto",
  messages: [{{ role: "user", content: "ping" }}],
  stream: true,
}});"""),
    ("Agent env", """ONEROUTER_KEY=or-live-...
OPENAI_BASE_URL=https://api.onerouter.dev/v1
OPENAI_API_KEY=$ONEROUTER_KEY
OPENAI_MODEL=deepseek/deepseek-v4-flash"""),
]


def build_home() -> None:
    models = load_data("models")
    cheapest = min(models, key=lambda m: m["per_m"]["in"] or 9e9)
    body = f"""
<main class="page">
  <section class="hero">
    <div class="hero-copy">
      <a class="pill" href="/docs/open-tier"><span class="dot"></span>
        Open Tier — $0, no deposit <span class="arrow">→</span></a>
      <h1>One key.<br>Every model.<br>No account.</h1>
      <p class="sub">An OpenAI-compatible gateway with same-model host failover.
        Change the base URL and the key; nothing else in your code moves.</p>
      <div class="hero-cta">
        <a class="btn primary lg" href="/keys">Get a key</a>
        <a class="btn lg" href="/docs/quickstart">Read the quickstart →</a>
      </div>
      <p class="microcopy">No signup. No card. Keys exist before payment.</p>
    </div>
    <div class="hero-panel">
      <div class="receipt">
        <div class="receipt-bar"><span class="lang">POST /v1/chat/completions</span>
          <span class="ok">200</span></div>
        <dl class="kv">
          <div><dt>x-onerouter-model</dt><dd>meta-llama/llama-3.3-70b-instruct</dd></div>
          <div><dt>x-onerouter-provider</dt><dd>groq</dd></div>
          <div><dt>x-onerouter-ttft-ms</dt><dd>118</dd></div>
          <div><dt>x-onerouter-cost-usd</dt><dd>0.000241</dd></div>
          <div><dt>x-onerouter-balance-usd</dt><dd>12.406</dd></div>
          <div><dt>x-onerouter-receipt</dt><dd>rcp_8fa2e1c0</dd></div>
        </dl>
        <p class="receipt-note">Every response carries its own receipt. You never have
          to trust the pricing page.</p>
      </div>
    </div>
  </section>

  <section class="strip">
    <div><b>0%</b><span>deposit fee on crypto rails</span></div>
    <div><b>{len(models)}</b><span>models behind one key</span></div>
    <div><b>{money(cheapest["per_m"]["in"])}</b><span>per 1M input, cheapest route</span></div>
    <div><b>None</b><span>KYC, ever — there is no account to verify</span></div>
  </section>

  <section class="band">
    <div class="band-head">
      <h2>Two lines change. Nothing else does.</h2>
      <p>Any OpenAI-compatible client works: SDKs, coding agents, chat frontends,
        proxies. If it takes a base URL and a key, it takes {BRAND}.</p>
    </div>
    {code_block("", "", tabs=HERO_TABS)}
    <p class="band-foot"><a href="/docs/integrations">Literal setup for Claude Code, Codex,
      Cursor, Cline, Zed, Aider, LiteLLM and SillyTavern →</a></p>
  </section>

  <section class="band">
    <div class="band-head"><h2>Set it up once.</h2>
      <p>Three steps. Nothing to install, no account to manage.</p></div>
    <div class="three">
      <div class="step-card"><span class="n">01</span><h3>Save your access</h3>
        <p>Setup returns an API key and a permanent recovery link. Both are secrets.
          Save them before a payment address is shown.</p>
        <code>or-live-… + recovery link</code></div>
      <div class="step-card"><span class="n">02</span><h3>Add credit</h3>
        <p>Pick a crypto rail. Direct stablecoin deposits start at $0.50; aggregated
          rails start at $5. The deposit becomes the same dollar value in credit.</p>
        <code>$0.50+ → prepaid credit</code></div>
      <div class="step-card"><span class="n">03</span><h3>Point your client</h3>
        <p>Paste the base URL and the key. The client appends the endpoint itself —
          do not add <code>/chat/completions</code> by hand.</p>
        <code>base URL + key → client</code></div>
    </div>
  </section>

  <section class="band tight">
    <div class="band-head"><h2>Know the tradeoffs.</h2>
      <p>Stated here, before payment — not discovered later in the terms.</p></div>
    <div class="tradeoffs">
      <div><b>No withdrawals.</b> Credit buys inference and never converts back. A
        withdrawal path would make us a money transmitter, and money transmitters must
        collect identity. That is the trade that keeps this accountless.</div>
      <div><b>Save both secrets.</b> Lose the key and the recovery link and there is no
        personal recovery — there is no identity attached to recover to.</div>
      <div><b>Restricted frontier models need your own key.</b> Provider terms prohibit
        reselling, so the resale inventory is open-weight and cleared routes only.</div>
      <div><b>Credit never expires.</b> Your balance sits until you spend it. Expiring
        credit is a dark pattern; ours does not.</div>
      <div><b>No content retention by default.</b> Debug capture is opt-in per key and
        expires in 60 minutes. Your prompt still transits the upstream that serves it.</div>
      <div><b>Failover is a capability, not an SLA.</b> We move between hosts of the same
        model before the first byte. After it, the route is committed.</div>
    </div>
  </section>

  <section class="cta">
    <h2>Turn a $0.50 deposit into every model.</h2>
    <div class="hero-cta"><a class="btn primary lg" href="/keys">Get a key</a>
      <a class="btn lg" href="/models">Browse {len(models)} models →</a></div>
    <p class="microcopy">No account. No KYC. Cancel by simply not spending it.</p>
  </section>
</main>"""
    write(OUT / "index.html", shell(
        title=f"{BRAND} — one key for every model, no account",
        description="An OpenAI-compatible LLM gateway. One prepaid key reaches every model, "
                    "with same-model host failover, per-key budgets and no KYC.",
        body=body, active="", canonical="/"))


MODALITY_ICON = {
    "text": ("T", "Text input"),
    "image": ("▣", "Image input"),
    "pdf": ("▤", "Document input"),
    "video": ("▶", "Video input"),
}


def build_models() -> None:
    """The catalog browser: search, filter, sort and page through every model.

    Sorting offers catalog order rather than a release date, because `data/models.json`
    carries no dates and inventing them would put a fact on the page that nothing
    stands behind.
    """
    models = load_data("models")
    rows = []
    for i, m in enumerate(models):
        tags = "".join(f'<span class="tag t-{t}">{t}</span>' for t in m["tags"][:2])
        badges = "".join(
            f'<span class="mod" title="{MODALITY_ICON[k][1]}" aria-label="{MODALITY_ICON[k][1]}">'
            f"{MODALITY_ICON[k][0]}</span>"
            for k in m["input_modalities"] if k in MODALITY_ICON
        )
        rows.append(f"""<tr data-search="{html.escape((m['id'] + ' ' + m['name'] + ' ' + m['author']).lower(), quote=True)}"
  data-in="{m['per_m']['in']}" data-out="{m['per_m']['out']}" data-ctx="{m['context_length']}"
  data-max="{m['max_output']}" data-order="{i}" data-free="{int('free' in m['tags'])}"
  data-mods="{' '.join(m['input_modalities'])}">
  <td><div class="m-row">
      <span class="m-badge" aria-hidden="true">{html.escape(m['author'][:2].upper())}</span>
      <span class="m-text">
        <span class="m-name"><a href="/models/{m['id']}">{html.escape(m['name'])}</a> {tags}</span>
        <button class="m-id" data-copy="{m['id']}">{m['id']}</button>
      </span></div></td>
  <td class="num">{tokens(m['context_length'])}</td>
  <td class="num">{tokens(m['max_output'])}</td>
  <td class="num">{money(m['per_m']['in'])}</td>
  <td class="num">{money(m['per_m']['out'])}</td>
  <td class="mods">{badges}</td></tr>""")

    body = f"""<main class="page" id="catalog">
  <section class="cat-head">
    <div>
      <h1>Browse<br>AI models</h1>
    </div>
    <div class="cat-head-side">
      <p>Compare models, limits and prices.</p>
      <div class="cat-cta">
        <a class="btn primary" href="/signin">Get an API key</a>
        <a class="btn" href="/docs/models">Read the docs</a>
      </div>
    </div>
  </section>

  <h2 class="cat-label">All models</h2>
  <div class="cat-controls">
    <input type="search" id="model-search" placeholder="Search model name or ID"
      aria-label="Search models" autocomplete="off">
    <select id="model-sort" aria-label="Sort models">
      <option value="order">Catalog order</option>
      <option value="in">Cheapest input</option>
      <option value="out">Cheapest output</option>
      <option value="ctx">Largest context</option>
      <option value="max">Largest output</option>
      <option value="name">A–Z</option>
    </select>
  </div>
  <div class="chips" role="group" aria-label="Filter by input">
    <button class="chip" data-mod="" aria-pressed="true">All inputs</button>
    <button class="chip" data-mod="text">Text</button>
    <button class="chip" data-mod="image">Image input</button>
    <button class="chip" data-mod="pdf">Documents</button>
    <button class="chip" data-mod="video">Video</button>
    <button class="chip" data-filter="free">Free models</button>
  </div>

  <p class="count"><span id="model-count">{len(models)}</span> models</p>

  <div class="table-wrap"><table id="model-table">
    <thead><tr><th>Model</th><th class="num">Context</th><th class="num">Max output</th>
      <th class="num">Input / 1M</th><th class="num">Output / 1M</th><th>Input</th></tr></thead>
    <tbody>{"".join(rows)}</tbody></table>
    <p class="cat-none" id="model-none" hidden>No model matches that. Try clearing a filter.</p>
  </div>

  <nav class="pager" aria-label="Catalog pages">
    <button class="linkish" id="page-prev">← Previous</button>
    <span id="page-label">Page 1 of 1</span>
    <button class="linkish" id="page-next">Next →</button>
  </nav>

  <p class="note">Prices are USD per million tokens and include the {BRAND} fee. Use each
    model ID exactly as shown in your request — see
    <a href="/docs/models">the model guide</a> for the auto router and fallbacks.</p>
</main>"""
    write(OUT / "models" / "index.html", shell(
        title=f"Browse AI models · {BRAND}",
        description=f"Every model available through {BRAND}, with context windows, "
                    "output limits, input types and current per-token prices.",
        body=body, active="models", canonical="/models"))


def build_pricing() -> None:
    models = load_data("models")
    opts = "".join(
        f'<option value="{m["id"]}" data-in="{m["per_m"]["in"]}" data-out="{m["per_m"]["out"]}"'
        f'{" selected" if m["id"] == "deepseek/deepseek-v4-flash" else ""}>'
        f'{html.escape(m["name"])} — {money(m["per_m"]["in"])}/1M in</option>'
        for m in sorted(models, key=lambda m: m["per_m"]["in"])
    )
    body = f"""
<main class="page narrow">
  <section class="split">
    <div>
      <span class="kicker">Inspectable pricing</span>
      <h1>Pay the rate.<br>Nothing on top.</h1>
      <p class="sub">Fund with crypto and spend through one OpenAI-compatible API.
        No deposit fee, and no markup on open-weight routes.</p>
      <div class="hero-cta"><a class="btn primary lg" href="/keys">Get a key</a>
        <a class="btn lg" href="/models">Browse models</a></div>
    </div>
    <div class="calc" id="calc">
      <div class="calc-bar"><span>Estimate a workload</span><span class="mono">USD</span></div>
      <label class="field"><span>Model</span>
        <select id="calc-model">{opts}</select></label>
      <div class="preset" role="group" aria-label="Workload presets">
        <button class="chip" data-preset="500000,40000" aria-pressed="true">Chat</button>
        <button class="chip" data-preset="5000000,300000">Coding agent</button>
        <button class="chip" data-preset="25000000,150000">Long documents</button>
      </div>
      <label class="field"><span>Input tokens</span>
        <input type="number" id="calc-in" value="500000" min="0" step="1000"></label>
      <label class="field"><span>Output tokens</span>
        <input type="number" id="calc-out" value="40000" min="0" step="1000"></label>
      <div class="calc-out">
        <span class="calc-label">Estimated cost</span>
        <strong id="calc-total">$0.00</strong>
        <span class="calc-split" id="calc-split"></span>
      </div>
      <p class="note">Uses published token rates. Cached input, request charges and
        provider tiers can change the final figure — the response header is the truth.</p>
    </div>
  </section>

  <section class="strip three-up">
    <div><b>0%</b><span>Crypto deposit fee. Your deposit becomes the same dollar value
      in credit.</span></div>
    <div><b>0%</b><span>Markup on open-weight routes. You pay the provider's rate.</span></div>
    <div><b>∞</b><span>No credit expiry. It stays on the key until you spend it.</span></div>
  </section>

  <section class="band tight">
    <div class="band-head"><h2>Where a router can take a cut</h2>
      <p>There are exactly two places. Both are zero on an open-weight route.</p></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Route</th><th class="num">Deposit fee</th><th class="num">Per-token markup</th>
        <th class="num">$10 buys</th></tr></thead>
      <tbody>
        <tr><td>{BRAND} — crypto, open-weight</td><td class="num">0%</td><td class="num">0%</td>
          <td class="num">$10.00</td></tr>
        <tr><td>{BRAND} — crypto, cleared commercial route</td><td class="num">0%</td>
          <td class="num">5%</td><td class="num">$9.52</td></tr>
        <tr><td>{BRAND} — card</td><td class="num">3.5%</td><td class="num">0–5%</td>
          <td class="num">$9.65</td></tr>
      </tbody></table></div>
    <p class="note">Every API response reports the charge it actually incurred in
      <code>x-onerouter-cost-usd</code>, so you can check the arithmetic after the call too.</p>
  </section>
</main>"""
    write(OUT / "pricing" / "index.html", shell(
        title=f"Pricing · {BRAND}",
        description="Estimate a workload against live catalog rates. 0% deposit fee, "
                    "0% markup on open-weight routes, credit that never expires.",
        body=body, active="pricing", canonical="/pricing"))


def build_status() -> None:
    st = load_data("status")
    providers = st["providers"]
    down = [p for p in providers if p["state"] != "operational"]
    headline = "All systems operational" if not down else (
        f"{len(down)} of {len(providers)} hosts degraded")
    cards = "".join(
        f'<div class="host {p["state"]}"><div class="host-top"><span class="dot"></span>'
        f'<b>{html.escape(p["name"])}</b><span class="state">{p["state"]}</span></div>'
        f'<code>{html.escape(p["sample"])}</code>'
        f'<span class="lat">{p["latency_ms"] or "—"}{"ms" if p["latency_ms"] else ""}</span></div>'
        for p in providers
    )
    fam = "".join(
        f'<div class="fam"><b>{html.escape(f["author"])}</b>'
        f'<span>{f["healthy"]} routes · {f["models"]} models</span></div>'
        for f in st["families"]
    )
    g = st["gateway"]
    body = f"""
<main class="page narrow">
  <section class="page-head">
    <span class="kicker">Live service health</span>
    <h1>{headline}</h1>
    <p class="sub">Direct generation checks from the {BRAND} edge, every five minutes.
      A passing check means we reached that host and it returned generated output.</p>
    <div class="snapshot">
      <div><span>Checked</span><b class="mono">{html.escape(st["checked_at"])}</b></div>
      <div><span>Hosts</span><b>{len(providers) - len(down)}/{len(providers)}</b></div>
      <div><span>Families</span><b>{len(st["families"])}</b></div>
      <div><span>Open incidents</span><b>0</b></div>
    </div>
  </section>

  <h2 class="sec">Host access</h2>
  <div class="hosts">{cards}</div>

  <h2 class="sec">Gateway</h2>
  <div class="strip four-up">
    <div><b>{g["error_rate_24h"]}%</b><span>Error rate, 24h</span></div>
    <div><b>{g["error_rate_7d"]}%</b><span>Error rate, 7d</span></div>
    <div><b>{g["ttft_median_ms"]}ms</b><span>First token, median</span></div>
    <div><b>{g["ttft_p95_ms"]}ms</b><span>First token, p95</span></div>
  </div>
  <p class="note">Errors counted here are ours: upstream failures, timeouts and exhausted
    retries. Cancelled or refused requests do not count against us — and neither should they
    count in our favour, so they are excluded rather than scored.</p>

  <h2 class="sec">Model families</h2>
  <div class="fams">{fam}</div>
</main>"""
    write(OUT / "status" / "index.html", shell(
        title=f"Status · {BRAND}", description="Live host health, gateway error rates and "
        "first-token latency, checked directly from the edge.",
        body=body, active="status", canonical="/status"))


def build_marketing() -> None:
    build_home()
    build_models()
    build_pricing()
    build_status()
    build_keys()
    build_signin()
    build_pay()
    build_chat()
    build_auto_free()
    build_model_pages()
    build_providers()
    build_changelog()
    build_simple_pages()
    build_404()


# ── Remaining site pages ─────────────────────────────────────────────────────

PAGES_DIR = ROOT / "pages"

RAILS = [
    ("USDC on Solana", "Direct. From a wallet or an exchange withdrawal.", "$0.50", "0%", True),
    ("SOL", "Native, same deposit address flow.", "$0.50", "0%", True),
    ("Any EVM chain", "ETH, USDC, USDT and most ERC-20s, via the aggregator.", "$5.00", "0%", True),
    ("Bitcoin", "On-chain BTC, or Lightning where available.", "$5.00", "0%", True),
    ("Tron / TON / XRP", "Settled through the aggregator into credit.", "$5.00", "0%", True),
    ("Card", "Visa / Mastercard. Processor cost passed through.", "$20.00", "3.5%", False),
]


def build_simple_pages() -> None:
    """Legal and support: the docs renderer without a rail or a TOC."""
    for path in sorted(PAGES_DIR.glob("*.md")):
        meta, raw = parse_front_matter(path.read_text())
        EXTRA_TOC.clear()
        body_html, _ = render_markdown(subst(raw))
        updated = (f'<p class="updated">Last updated {html.escape(meta["updated"])}</p>'
                   if meta.get("updated") else "")
        body = f"""<main class="article prose-page">
  <div class="head-line"><span class="kicker">{html.escape(meta.get("kicker", "Legal"))}</span></div>
  <h1>{html.escape(meta["title"])}</h1>
  <p class="lede">{inline(meta.get("description", ""))}</p>
  {updated}
  {body_html}
</main>"""
        write(OUT / "legal" / path.stem / "index.html" if path.stem != "support"
              else OUT / "support" / "index.html",
              shell(title=f'{meta["title"]} · {BRAND}',
                    description=meta.get("description", ""), body=body,
                    canonical=("/support" if path.stem == "support" else f"/legal/{path.stem}")))


def build_keys() -> None:
    """Getting started with no account: choose a rail, take the key, send USDC on Arc,
    and watch it land. Four steps, one page, nothing kept on the site side."""
    rails = [
        ("arc-usdc", "USDC on Arc", "Send USDC on Arc — the native asset, no token approval",
         "$0.50", True),
        ("arc-wallet", "Arc wallet", "Pay from a connected EVM wallet", "$0.50", False),
        ("other", "Other chains", "Solana, Bitcoin, Ethereum and more", "—", False),
    ]
    options = "".join(
        f'<label class="rail-opt{"" if live else " off"}">'
        f'<input type="radio" name="rail" value="{rid}"'
        f'{" checked" if i == 0 else ""}{"" if live else " disabled"}>'
        f'<span class="ro-body"><b>{html.escape(name)}</b>'
        f'<span class="ro-note">{html.escape(note)}</span></span>'
        f'<span class="ro-min">{mn}<em>{"min" if live else ""}</em></span>'
        f'<span class="ro-fee">{"0%" if live else "Unavailable"}<em>{"fee" if live else ""}</em></span>'
        f"</label>"
        for i, (rid, name, note, mn, live) in enumerate(rails)
    )
    body = f"""<main class="page narrow" id="getkey" data-api="{API}">
  <section class="page-head">
    <div class="crumbs"><a href="/">Get started</a> <span>/</span> <span>Get a key</span></div>
    <h1>Get an API key</h1>
  </section>

  <ol class="flow" id="flow">
    <li data-step="0" class="on"><span>01</span>Choose</li>
    <li data-step="1"><span>02</span>Copy key</li>
    <li data-step="2"><span>03</span>Send</li>
    <li data-step="3"><span>04</span>Ready</li>
  </ol>

  <!-- 01 — choose how to pay -->
  <section class="step" data-step="0">
    <h2 class="step-h">Choose how to pay</h2>
    <div class="rail-opts">{options}</div>
    <p class="selected-rail"><span>Selected rail</span>
      <b id="rail-label">USDC on Arc · the native asset on Arc</b></p>
    <div class="panel-warn">Save the API key and the recovery link when they appear.
      Lose both and the balance is unrecoverable — there is no identity attached to
      recover to.</div>
    <button class="btn primary lg wide" id="go-key">Continue</button>
  </section>

  <!-- 02 — the key -->
  <section class="step" data-step="1" hidden>
    <h2 class="step-h">Copy your API key</h2>
    <p class="step-sub">Use this key in your app. Then add credit.</p>
    <div class="keycard">
      <code id="the-key">—</code>
      <button class="btn keycopy" id="copy-key" data-copy="">Click to copy API key</button>
    </div>
    <button class="btn primary lg wide" id="go-pay">Continue to payment →</button>
    <p class="step-note">Your credit lands on this key once the deposit confirms.</p>
    <details class="recovery">
      <summary>Recovery link</summary>
      <p>The second secret. It survives key rotation and can mint a replacement key,
        which is why there are two rather than one.</p>
      <button class="m-id" id="the-recovery" data-copy="">—</button>
    </details>
    <button class="linkish back" data-back="0">← Change payment method</button>
  </section>

  <!-- 03 — send it -->
  <section class="step" data-step="2" hidden>
    <button class="linkish back" data-back="1">← Change payment method</button>
    <p class="waiting"><span class="pip" id="pip"></span><span id="pay-state">Waiting</span></p>
    <h2 class="step-h center">Send USDC</h2>
    <p class="step-sub center" id="pay-sub">Arc · $0.50 minimum</p>

    <p class="livewarn" id="livewarn" hidden></p>

    <div class="paycard">
      <div class="qrbox"><img id="qr" alt="Payment address as a QR code" width="196" height="196"></div>
      <div class="paycard-side">
        <div class="addr">
          <span class="addr-label" id="addr-label">Arc payment address</span>
          <code id="pay-address">—</code>
        </div>
        <div class="addr">
          <span class="addr-label">Suggested amount — any amount credits</span>
          <code id="pay-amount">—</code>
        </div>
        <p class="watching"><span class="pip"></span>Watching now</p>
        <p class="watch-note">Checking every 5s · detection can take up to a minute</p>
        <div class="paycard-actions">
          <button class="btn primary" id="copy-address" data-copy="">Copy address</button>
          <a class="btn" id="explorer" href="/chat">Open the playground ↗</a>
        </div>
      </div>
    </div>

    <details class="help">
      <summary>Payment help</summary>
      <ul>
        <li><b>Any amount works.</b> This address belongs to your key alone, so
          whatever arrives is credited — there is no figure to match.</li>
        <li><b>Right network.</b> This address is on Arc (chain 5042). USDC sent on
          another chain does not arrive and cannot be recovered.</li>
        <li><b>USDC is Arc's native asset.</b> Send it as an ordinary transfer; no
          token approval and no contract call is needed.</li>
        <li><b>Nothing to save.</b> Leaving this page does not cancel the deposit —
          it credits the key whenever it lands.</li>
      </ul>
    </details>
  </section>

  <!-- 04 — done -->
  <section class="step" data-step="3" hidden>
    <p class="waiting done"><span class="pip"></span>Credited</p>
    <h2 class="step-h center">Your key is funded</h2>
    <p class="step-sub center">Balance <b id="final-balance">—</b>. It never expires.</p>
    <div class="done-actions">
      <a class="btn primary lg" href="/chat">Open the playground →</a>
      <a class="btn lg" href="/docs/quickstart">Read the quickstart</a>
    </div>
    <p class="step-note" id="final-tx"></p>
  </section>

  <p class="note" id="getkey-status" role="status"></p>

  <h2 class="sec">Then point a client at it</h2>
  {code_block("shell", f'''export ONEROUTER_KEY=or-live-YOUR-KEY-HERE
export OPENAI_BASE_URL={API}
export OPENAI_API_KEY="$ONEROUTER_KEY"

curl {API}/chat/completions \\\\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{{"model":"onerouter/auto","messages":[{{"role":"user","content":"ping"}}]}}\'''')}
  <p class="note">Full walkthrough in the <a href="/docs/quickstart">quickstart</a>;
    per-client configuration in <a href="/docs/integrations">client setup</a>.</p>
</main>"""
    write(OUT / "keys" / "index.html", shell(
        title=f"Get an API key · {BRAND}",
        description="Create a key without an account, fund it with USDC on Arc, and "
                    "watch the deposit land. No KYC, no expiry, deposits only.",
        body=body, canonical="/keys"))


def build_signin() -> None:
    """The front door. Every method here is verified by the gateway — a method it has
    not been configured for is disabled with the reason, never left to fail on click."""
    body = f"""<main class="page auth-page" id="signin" data-api="{API}">
  <section class="authbox">
    <h1>Welcome to {BRAND}</h1>
    <p class="auth-sub">Sign in, or get started without an account.</p>

    <div class="auth-oauth">
      <button type="button" class="auth-icon" data-method="google" aria-label="Continue with Google">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"/></svg>
        <span class="auth-last" hidden>Last used</span>
      </button>
      <button type="button" class="auth-icon" data-method="github" aria-label="Continue with GitHub">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.4.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>
        <span class="auth-last" hidden>Last used</span>
      </button>
      <button type="button" class="auth-icon" data-method="passkey" aria-label="Continue with a passkey">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7v2"/><path d="M19 11V9a7 7 0 0 0-3-5.7"/><path d="M8.5 21a20 20 0 0 0 1.2-7 2.3 2.3 0 0 1 4.6 0c0 1.4-.1 2.8-.4 4.2"/><path d="M5 18c.6-2 .9-4 .9-6a6.1 6.1 0 0 1 9.2-5.2"/><path d="M17.9 9.5c.1.5.1 1 .1 1.5 0 3-.4 6-1.2 8.8"/><path d="M12 11v3"/></svg>
        <span class="auth-last" hidden>Last used</span>
      </button>
    </div>

    <button type="button" class="auth-row primary" data-method="email">
      <span>Continue with email</span><span class="arrow">→</span></button>
    <button type="button" class="auth-row" data-method="wallet">
      <span>Continue with an Arc wallet</span><span class="arrow">→</span></button>
    <button type="button" class="auth-row" data-method="anonymous">
      <span>Continue without an account</span><span class="arrow">→</span></button>

    <p class="auth-foot">Already have a key?
      <button type="button" class="linkish" data-method="attach">Attach an email to it</button></p>

    <div class="auth-panel" id="auth-panel" hidden></div>
    <p class="auth-status" id="auth-status" role="status"></p>
  </section>

  <noscript>
    <p class="note">Signing in needs JavaScript — every method here is a live exchange
      with the gateway. You can still create a key without one:
      <code>curl -X POST {API}/keys</code>.</p>
  </noscript>
</main>"""
    write(OUT / "signin" / "index.html", shell(
        title=f"Sign in · {BRAND}", description=(
            "Sign in with Google, GitHub, a passkey, email, or an Arc wallet — "
            "or carry on with no account at all."),
        body=body, canonical="/signin", extra_class="plain"))

def build_pay() -> None:
    """Adding credit to a key you already hold.

    Two steps on two screens: pick an amount, then the deposit page. Showing the
    address beside the amount picker put a live payment address on screen before
    anyone had chosen anything, and left no room to show it properly.
    """
    amounts = [5, 20, 50, 200]
    chips = "".join(
        f'<button type="button" class="chip" data-amount="{a}"'
        f'{" aria-pressed=\"true\"" if a == 20 else ""}>${a}</button>' for a in amounts)
    body = f"""<main class="page narrow" id="pay" data-api="{API}">
  <section class="page-head">
    <div class="crumbs"><a href="/">Home</a> <span>/</span> <span>Add credit</span></div>
    <span class="kicker">Funding</span>
    <h1>Pay in USDC on Arc.</h1>
    <p class="sub">Your key has its own deposit address. Send USDC to it and the credit
      lands once the network confirms.</p>
  </section>

  <ol class="flow" id="pay-flow">
    <li data-step="0" class="on"><span>01</span>Amount</li>
    <li data-step="1"><span>02</span>Send USDC</li>
  </ol>

  <!-- 01 — how much -->
  <section class="step" data-step="0">
    <h2 class="step-h">Choose how to pay</h2>
    <div class="rail-opts">
      <label class="rail-opt">
        <input type="radio" name="rail" value="arc-usdc" checked>
        <span class="ro-body"><b>USDC on Arc</b>
          <span class="ro-note" id="pay-rail-note">Checking the gateway…</span></span>
        <span class="ro-min">$0.50<em>min</em></span>
        <span class="ro-fee">0%<em>fee</em></span>
      </label>
    </div>
    <p class="livewarn" id="pay-livewarn" hidden></p>

    <h2 class="step-h" style="margin-top:26px">How much</h2>
    <p class="step-sub">A suggestion only — any amount sent to your address is credited.</p>
    <div class="chips" id="pay-amounts">{chips}
      <input type="number" id="pay-custom" min="0.5" step="0.5" placeholder="Other"
        aria-label="Custom amount in USD">
    </div>
    <button class="btn primary lg wide" id="pay-start">Continue</button>
    <p class="step-note" id="pay-note">Credit never expires and is spent only by your
      own requests.</p>
  </section>

  <!-- 02 — the deposit page -->
  <section class="step" data-step="1" hidden>
    <button class="linkish back" data-back="0">← Change amount</button>
    <p class="waiting"><span class="pip" id="pay-pip"></span><span id="pay-state">Waiting</span></p>
    <h2 class="step-h center">Send USDC</h2>
    <p class="step-sub center" id="pay-sub">Arc · $0.50 minimum</p>
    <p class="livewarn" id="pay-livewarn2" hidden></p>

    <div class="paycard">
      <div class="qrbox"><img id="pay-qr" alt="Your deposit address as a QR code"
        width="196" height="196"></div>
      <div class="paycard-side">
        <div class="addr">
          <span class="addr-label" id="pay-addr-label">Your Arc deposit address</span>
          <code id="pay-address">—</code>
        </div>
        <div class="addr">
          <span class="addr-label">Suggested amount</span>
          <code id="pay-amount">—</code>
        </div>
        <p class="watching"><span class="pip"></span>Watching now</p>
        <p class="watch-note">Checking every 5s · detection can take up to a minute</p>
        <div class="paycard-actions">
          <button class="btn primary" id="pay-copy" data-copy="">Copy address</button>
          <a class="btn" id="pay-explorer" target="_blank" rel="noopener"
            hidden>View on the explorer ↗</a>
        </div>
      </div>
    </div>

    <div class="table-wrap" id="pay-received" hidden style="margin-top:18px">
      <table><thead><tr><th>Received</th><th class="num">Amount</th>
        <th>Transaction</th></tr></thead><tbody id="pay-rows"></tbody></table>
    </div>

    <p class="step-note"><b id="pay-balance"></b></p>

    <details class="help">
      <summary>Payment help</summary>
      <ul>
        <li><b>Any amount works.</b> This address belongs to your key alone, so
          whatever arrives is credited.</li>
        <li><b>Right network.</b> Arc, chain 5042. USDC sent on another chain does not
          arrive and cannot be recovered.</li>
        <li><b>Native asset.</b> USDC is Arc's gas token — send it as an ordinary
          transfer, no approval or contract call.</li>
        <li><b>Nothing to keep open.</b> Leaving this page does not cancel anything;
          the transfer credits your key whenever it lands.</li>
      </ul>
    </details>
  </section>

  <h2 class="sec">What Arc settles in</h2>
  <p>Arc uses USDC as its native asset, so a deposit is an ordinary transfer. The
    gateway reads the USDC <code>Transfer</code> log and credits your key after
    <span id="pay-confirms">the configured number of</span> confirmations.</p>
  <p class="note">USDC on Arc is reported in two scales: transaction values carry 18
    decimals like any EVM native asset, while the token interface reports 6. Amounts on
    this page are USDC, read from the 6-decimal figure.</p>
</main>"""
    write(OUT / "pay" / "index.html", shell(
        title=f"Add credit · {BRAND}",
        description="Fund a key with USDC on Arc. Every key has its own deposit "
                    "address, so any amount you send is credited to it.",
        body=body, canonical="/pay"))


def build_chat() -> None:
    """The playground, as an app rather than a page.

    Owns the whole viewport — its own sidebar and top bar instead of the site chrome.
    The browser talks to the gateway directly with a key held on this device; there is
    no server on the site side to proxy through.
    """
    models = load_data("models")
    # A dependable general model as the opening choice, whatever the catalog holds.
    default = next((m for m in models if m["id"] == "openai/gpt-4o-mini"),
                   next((m for m in models if m["per_m"]["in"] > 0), models[0]))
    catalog = json.dumps([
        {"id": m["id"], "name": m["name"], "author": m["author"],
         "in": m["per_m"]["in"], "out": m["per_m"]["out"],
         "ctx": m["context_length"], "free": int("free" in m["tags"])}
        for m in models
    ], separators=(",", ":")).replace("<", r"<")

    suggestions = [
        "Help me turn an idea into a plan",
        "Explain something complicated simply",
        "Review a piece of code",
    ]
    prompts = "".join(
        f'<button type="button" class="ask" data-fill="{html.escape(s, quote=True)}">'
        f'<span>{html.escape(s)}</span><span class="ask-go">↗</span></button>'
        for s in suggestions
    )
    body = f"""<div class="app" id="chat" data-api="{API}" data-model="{default['id']}">
  <aside class="side" id="side">
    <div class="side-head">
      <a class="brand" href="/">{MARK}<span>{BRAND}</span></a>
      <button class="btn icon-btn ghost" id="side-close" aria-label="Hide the sidebar">⇤</button>
    </div>
    <button class="btn newchat" id="new-chat"><span aria-hidden="true">+</span> New chat</button>
    <nav class="side-nav">
      <a href="/chat" aria-current="page">Chat</a>
      <a href="/docs/integrations">Use in your app</a>
      <a href="/models">Browse models</a>
    </nav>
    <div class="side-scroll">
      <h4 class="side-label">Conversations</h4>
      <div id="convos" class="convos"></div>
      <p class="side-empty" id="convo-empty">Nothing saved yet. Conversations stay on
        this device unless you clear them.</p>
    </div>
    <div class="side-foot">
      <p class="side-note">Your conversations stay on this device. The key is stored
        here too, and is only ever sent to the gateway.</p>
      <div class="credits">
        <div><span class="credits-label">Available credit</span>
          <b id="balance">—</b></div>
        <a class="btn sm" href="/pay">Add credit</a>
      </div>
      <div class="side-base">
        <span id="key-state" class="key-state">No key</span>
        <span class="spacer"></span>
        <button class="btn icon-btn ghost" data-theme-toggle
          aria-label="Toggle colour theme">◐</button>
      </div>
    </div>
  </aside>

  <main class="chatmain">
    <header class="chattop">
      <button class="btn icon-btn ghost" id="side-open" aria-label="Show the sidebar">☰</button>
      <button type="button" class="modelpick" id="chat-pick" aria-expanded="false"
        aria-haspopup="listbox">
        <span class="modeldot" aria-hidden="true"></span>
        <span id="chat-pick-name">{html.escape(default['name'])}</span>
        <span class="caret" aria-hidden="true">▾</span>
      </button>
      <span class="spacer"></span>
      <span class="rate" id="chat-rate"></span>
      <a class="btn sm" href="/signin" id="account">Account</a>
    </header>

    <div class="chatpick" id="chat-picker" hidden>
      <input type="search" id="chat-search" placeholder="Search models"
        aria-label="Search models" autocomplete="off">
      <div class="chatpick-list" id="chat-picker-list" role="listbox"
        aria-label="Choose a model"></div>
    </div>

    <div class="chatscroll" id="chat-log">
      <div class="chathero" id="chat-empty">
        {MARK}
        <h1>What would you like to explore?</h1>
        <div class="asks">{prompts}</div>
      </div>
    </div>

    <div class="composer">
      <div class="composer-in">
        <label class="spend"><input type="checkbox" id="spend" checked>
          <span>Use my credit for this request</span></label>
        <span class="dot">·</span>
        <a href="/pricing">View model prices</a>
      </div>
      <form class="composer-box" id="chat-form">
        <textarea id="chat-input" rows="1" placeholder="Ask anything…"
          aria-label="Message"></textarea>
        <div class="composer-foot">
          <span class="mode" id="mode">Paid chat</span>
          <span class="spacer"></span>
          <button type="submit" class="send" id="chat-send" aria-label="Send message">↑</button>
        </div>
      </form>
      <p class="disclaimer">Models can be wrong — check anything that matters.
        Requests go straight to <code>{API}</code> from this browser.</p>
    </div>
  </main>

  <div class="keygate" id="keygate" hidden>
    <div class="keygate-box">
      <h2>You need a key to chat</h2>
      <p>Keys are minted without an account. It takes one click, and the free model
        costs nothing to try.</p>
      <div class="keygate-actions">
        <a class="btn primary" href="/signin">Get a key →</a>
        <button class="btn" id="keygate-paste">I already have one</button>
      </div>
      <div id="keygate-form" hidden>
        <input type="password" id="chat-key" placeholder="or-live-…" autocomplete="off"
          aria-label="Your API key">
        <button class="btn primary" id="chat-key-save">Use key</button>
      </div>
    </div>
  </div>
</div>
<script type="application/json" id="chat-models">{catalog}</script>"""
    write(OUT / "chat" / "index.html", shell(
        title=f"Chat · {BRAND}",
        description="Talk to any model in the catalog from the browser, over the same "
                    "OpenAI-compatible endpoint your code uses.",
        body=body, canonical="/chat", extra_class="app-body", chrome=False))


def build_auto_free() -> None:
    models = load_data("models")
    free = next((m for m in models if m["id"] == "openrouter/free"),
                next((m for m in models if "free" in m["tags"]), models[0]))
    body = f"""<main class="page narrow">
  <section class="page-head">
    <div class="crumbs"><a href="/models">Models</a> <span>/</span> <span>Open Tier</span></div>
    <span class="kicker">Availability</span>
    <h1>Open Tier is available</h1>
    <p class="sub">This page is the discovery surface for <code>onerouter/auto:free</code>.
      When the alias is not listed here, requests to it answer
      <a href="/docs/errors#no_free_route">503 no_free_route</a> rather than falling back
      to a paid model.</p>
  </section>

  <div class="strip three-up">
    <div><b>Listed</b><span>The free alias is resolving right now</span></div>
    <div><b>{html.escape(free["name"])}</b><span>Current resolution, {tokens(free["context_length"])} context</span></div>
    <div><b>$0.00</b><span>Customer charge, permanently</span></div>
  </div>

  <h2 class="sec">Current resolution</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Alias</th><th>Resolves to</th><th class="num">Context</th>
      <th class="num">Max output</th><th class="num">Charge</th></tr></thead>
    <tbody><tr><td><code>onerouter/auto:free</code></td><td><code>{free["id"]}</code></td>
      <td class="num">{tokens(free["context_length"])}</td>
      <td class="num">{tokens(free["max_output"])}</td><td class="num">Free</td></tr></tbody>
  </table></div>
  <p class="note">Naming that model directly uses the same free path and shares the same
    quotas. A different model priced at $0 in the catalog does <em>not</em> — it is still a
    paid route that takes a hold.</p>

  <h2 class="sec">Your allowance</h2>
  <p>Quotas are per account and reset at 00:00 UTC. Query them at any time:</p>
  {code_block("shell", f'''curl {API}/me/open-tier \\\\
  -H "Authorization: Bearer $ONEROUTER_KEY"

{{"eligible": true, "requests_remaining": 43, "tokens_remaining": 91204,
 "resets_at": "2026-09-10T00:00:00Z", "max_output_per_request": 2048}}''')}
  <p class="note">Setup, limits and refusals are documented on the
    <a href="/docs/open-tier">Open Tier page</a>.</p>
</main>"""
    write(OUT / "models" / "auto" / "free" / "index.html", shell(
        title=f"Open Tier availability · {BRAND}",
        description="Live availability for onerouter/auto:free — what it resolves to, and "
                    "the account quotas that apply.", active="models",
        body=body, canonical="/models/auto/free"))


def model_tabs(m: dict) -> list[tuple[str, str]]:
    """Client setup for one model. The same literal values as /docs/integrations,
    with this model's id already filled in so the snippet is copy-and-run."""
    mid, host = m["id"], API.removesuffix("/v1")
    return [
        ("cURL", f"""curl {API}/chat/completions \\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "model": "{mid}",
    "messages": [{{"role":"user","content":"ping"}}],
    "stream": true
  }}'"""),
        ("Python", f"""from openai import OpenAI

client = OpenAI(
    base_url="{API}",
    api_key="or-live-...",
)

client.chat.completions.create(
    model="{mid}",
    messages=[{{"role": "user", "content": "ping"}}],
    stream=True,
)"""),
        ("Node.js", f"""import OpenAI from "openai";

const client = new OpenAI({{
  baseURL: "{API}",
  apiKey: process.env.ONEROUTER_KEY,
}});

await client.chat.completions.create({{
  model: "{mid}",
  messages: [{{ role: "user", content: "ping" }}],
  stream: true,
}});"""),
        ("Claude Code", f"""# Shell, or "env" in ~/.claude/settings.json.
# Use the BARE host: Claude Code appends /v1/messages itself.

export ONEROUTER_KEY=or-live-YOUR-KEY-HERE
export ANTHROPIC_BASE_URL={host}
export ANTHROPIC_AUTH_TOKEN="$ONEROUTER_KEY"
export ANTHROPIC_MODEL="{mid}"

claude --model "$ANTHROPIC_MODEL\""""),
        ("Codex", f"""# ~/.codex/config.toml, with ONEROUTER_KEY in the environment

model = "{mid}"
model_provider = "onerouter"

[model_providers.onerouter]
name = "{BRAND}"
base_url = "{API}"
env_key = "ONEROUTER_KEY"
wire_api = "responses\""""),
        ("OpenCode", f"""// opencode.json — project root, or ~/.config/opencode/opencode.json
{{
  "$schema": "https://opencode.ai/config.json",
  "provider": {{
    "onerouter": {{
      "npm": "@ai-sdk/openai-compatible",
      "name": "{BRAND}",
      "options": {{
        "baseURL": "{API}",
        "apiKey": "{{env:ONEROUTER_KEY}}"
      }},
      "models": {{
        "{mid}": {{ "name": "{m['name']}" }}
      }}
    }}
  }}
}}"""),
    ]


def build_model_pages() -> None:
    """One page per catalog entry. Everything on it comes from data/models.json,
    so a catalog change moves the detail page with it."""
    models = load_data("models")
    for m in models:
        mid, per = m["id"], m["per_m"]
        free = "free" in m["tags"]
        tags = "".join(f'<span class="tag t-{t}">{t}</span>' for t in m["tags"])
        mods = ", ".join(m["input_modalities"])

        hosts = "".join(
            f"<tr><td><code>{html.escape(h)}</code></td><td class=\"num\">{i}</td>"
            f"<td>{'Tried first' if i == 1 else 'Tried when every route above it fails to answer'}</td>"
            "</tr>"
            for i, h in enumerate(m["hosts"], 1)
        )
        failover = (
            f"<p class=\"note\">{BRAND} moves between these hosts of the same model, never "
            f"between models, and only before the first content byte. See "
            f"<a href=\"/docs/failover\">failover</a>.</p>"
            if len(m["hosts"]) > 1 else
            "<p class=\"note\">A single route serves this model. There is nowhere to fail "
            "over to: if the host does not answer, the request returns "
            "<a href=\"/docs/errors#model_unavailable\">503 model_unavailable</a> and nothing "
            "is charged.</p>"
        )
        price_note = (
            "This model is the current Open Tier resolution and is charged at $0. "
            "<a href=\"/docs/open-tier\">Quotas apply</a>."
            if free else
            f"USD per million tokens, {BRAND}'s fee included. A response is charged on the "
            "attempt that produced it — see <a href=\"/docs/billing\">billing</a>."
        )
        body = f"""<main class="page narrow">
  <section class="page-head">
    <div class="crumbs"><a href="/models">Models</a> <span>/</span>
      <span>{html.escape(m["author"])}</span> <span>/</span> <span>{html.escape(m["name"])}</span></div>
    <span class="kicker">{html.escape(m["author"])}</span>
    <h1>{html.escape(m["name"])}</h1>
    {f'<div class="chips">{tags}</div>' if tags else ""}
    <p class="sub">Send this model by its id from any OpenAI-compatible client. One key,
      one base URL, {tokens(m["context_length"])} of context.</p>
    <div class="urlchip"><code>{html.escape(mid)}</code>
      <button class="copy" data-copy="{html.escape(mid, quote=True)}">Copy</button></div>
  </section>

  <div class="strip four-up">
    <div><b>{money(per["in"])}</b><span>Input / 1M tokens</span></div>
    <div><b>{money(per["out"])}</b><span>Output / 1M tokens</span></div>
    <div><b>{tokens(m["context_length"])}</b><span>Context window</span></div>
    <div><b>{tokens(m["max_output"])}</b><span>Maximum output</span></div>
  </div>
  <p class="note">{price_note}</p>

  <h2 class="sec">Use this model</h2>
  <p>Every snippet carries this model's id. The base URL and the key are the same ones
    you already use for every other model in the catalog.</p>
  {code_block("setup", "", tabs=model_tabs(m))}
  <p class="note">More clients — Cursor, Zed, Continue, Aider, LiteLLM — are on
    <a href="/docs/integrations">client setup</a>.</p>

  <h2 class="sec">Specification</h2>
  <div class="table-wrap"><table>
    <tbody>
      <tr><td>Model ID</td><td><code>{html.escape(mid)}</code></td></tr>
      <tr><td>Author</td><td>{html.escape(m["author"])}</td></tr>
      <tr><td>Context window</td><td>{m["context_length"]:,} tokens</td></tr>
      <tr><td>Maximum output</td><td>{m["max_output"]:,} tokens</td></tr>
      <tr><td>Input</td><td>{html.escape(mods)}</td></tr>
      <tr><td>Output</td><td>text</td></tr>
      <tr><td>Input price</td><td>{money(per["in"])} / 1M tokens</td></tr>
      <tr><td>Output price</td><td>{money(per["out"])} / 1M tokens</td></tr>
    </tbody>
  </table></div>

  <h2 class="sec">Endpoints</h2>
  <p>Send the id unchanged on either supported shape:</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Endpoint</th><th>Shape</th><th>State</th></tr></thead>
    <tbody>
      <tr><td><code>POST /v1/chat/completions</code></td><td>OpenAI Chat Completions</td>
        <td>Live</td></tr>
      <tr><td><code>POST /v1/messages</code></td><td>Anthropic Messages</td>
        <td>Live</td></tr>
      <tr><td><code>POST /v1/responses</code></td><td>OpenAI Responses</td>
        <td>Not implemented</td></tr>
    </tbody>
  </table></div>
  <p class="note">Both live shapes accept JSON and SSE. Set <code>"stream": true</code>
    for incremental output — see <a href="/docs/streaming">streaming</a>.
    <code>/v1/responses</code> answers
    <a href="/docs/errors#unsupported_endpoint">400 unsupported_endpoint</a>.</p>

  <h2 class="sec">Hosts</h2>
  <p>{"The route order for this model. " if len(m["hosts"]) > 1 else ""}Priority is the
    catalog order, not a live latency score.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Host</th><th class="num">Priority</th><th>When it serves</th></tr></thead>
    <tbody>{hosts}</tbody>
  </table></div>
  {failover}
  <p>Pin one host and refuse failover entirely:</p>
  {code_block("json", f'''{{
  "model": "{mid}",
  "messages": [{{ "role": "user", "content": "ping" }}],
  "provider": {{ "only": ["{m["hosts"][0]}"] }}
}}''')}

  <p class="note"><a href="/models">← Back to the catalog</a> ·
    <a href="/docs/models">Model guide</a> · <a href="/keys">Get a key</a></p>
</main>"""
        write(OUT / "models" / m["author"] / mid.split("/", 1)[1] / "index.html", shell(
            title=f"{m['name']} · {BRAND}",
            description=f"{m['name']} on {BRAND} — {money(per['in'])} in / "
                        f"{money(per['out'])} out per 1M tokens, "
                        f"{tokens(m['context_length'])} context, with copy-ready client setup.",
            body=body, active="models", canonical=f"/models/{mid}"))

def build_providers() -> None:
    models, st = load_data("models"), load_data("status")
    counts: dict[str, list[str]] = {}
    for m in models:
        for h in m["hosts"]:
            counts.setdefault(h, []).append(m["id"])
    state = {p["name"]: p["state"] for p in st["providers"]}
    cards = "".join(
        f'<div class="prov"><div class="prov-top"><span class="dot"></span>'
        f'<b>{html.escape(h)}</b><span class="state">{state.get(h, "operational")}</span></div>'
        f'<div class="prov-num">{len(ids)}<em>routes</em></div>'
        f'<div class="prov-ids">' + "".join(f"<code>{i}</code>" for i in sorted(ids)[:4])
        + (f'<span class="more">+{len(ids) - 4} more</span>' if len(ids) > 4 else "")
        + "</div></div>"
        for h, ids in sorted(counts.items(), key=lambda kv: -len(kv[1]))
    )
    body = f"""<main class="page narrow">
  <section class="page-head">
    <span class="kicker">Host directory</span>
    <h1>The routes behind the catalog</h1>
    <p class="sub">Which hosts are enabled, how much of the catalog each one covers, and the
      model IDs reachable through it. Failover moves between hosts on this page — never
      between models.</p>
  </section>
  <div class="provs">{cards}</div>
  <p class="note">A model's page names the hosts that can serve it. Pin one with
    <code>provider.only</code> to refuse failover; see
    <a href="/docs/failover">failover</a>. Live health is on the
    <a href="/status">status page</a>.</p>
</main>"""
    write(OUT / "providers" / "index.html", shell(
        title=f"Providers · {BRAND}", description="Every model host behind the catalog, with "
        "its route coverage and current state.", body=body, canonical="/providers"))


def build_changelog() -> None:
    months = load_data("changelog")
    out = []
    for month in months:
        items = "".join(
            f'<li><div class="cl-meta"><time>{i["date"]}</time>'
            f'<span class="cl-tag">{html.escape(i["tag"])}</span></div>'
            f'<div class="cl-body"><b>{html.escape(i["title"])}</b><p>{inline(i["body"])}</p>'
            + (f'<a href="{i["link"][1]}">{html.escape(i["link"][0])} →</a>' if i.get("link") else "")
            + "</div></li>"
            for i in month["items"]
        )
        out.append(f'<h2 class="sec">{html.escape(month["month"])}</h2><ul class="cl">{items}</ul>')
    body = f"""<main class="page narrow">
  <section class="page-head">
    <span class="kicker">Changelog</span>
    <h1>What changed</h1>
    <p class="sub">Material changes are announced here before they take effect.</p>
  </section>
  {"".join(out)}
</main>"""
    write(OUT / "changelog" / "index.html", shell(
        title=f"Changelog · {BRAND}", description="Recent changes to the gateway, the "
        "catalog, pricing and the docs.", body=body, canonical="/changelog"))


def build_404() -> None:
    body = """<main class="page narrow"><section class="page-head" style="padding-top:110px">
      <span class="kicker">404</span><h1>No route for that.</h1>
      <p class="sub">The page is not here. If you followed an error message, the code itself
        is the anchor — try the errors page.</p>
      <div class="hero-cta"><a class="btn primary lg" href="/docs/quickstart">Quickstart</a>
        <a class="btn lg" href="/docs/errors">Errors</a>
        <a class="btn lg" href="/models">Models</a></div>
    </section></main>"""
    write(OUT / "404.html", shell(title=f"Not found · {BRAND}",
          description="Page not found.", body=body, canonical="/404"))

if __name__ == "__main__":
    main()
