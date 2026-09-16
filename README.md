# OneRouter

An OpenAI-compatible LLM gateway: one prepaid key reaches every model in the catalog,
with same-model host failover, per-key budgets and no account requirement.

This repository holds the **public site and developer documentation** — the marketing
surface, the docs, and the machine-readable endpoints agents read — plus a **working
gateway** in `gateway/` that those pages talk to.

```bash
python3 dev.py            # builds against the local gateway, runs both
                          # site :4321 · gateway :8080
```

Or separately:

```bash
python3 site/build.py     # docs/ + pages/ + data/  ->  public/   (~60ms)
python3 serve.py 4321     # http://127.0.0.1:4321
python3 gateway/server.py 8080
```

Python 3.11+. The site build is standard library only — no Node, no package manager, no
install step, no network access at build time. The gateway adds one optional dependency,
`cryptography`, used to verify wallet signatures; without it wallet sign-in reports
itself unavailable and everything else still runs.

`serve.py` is a dev server, not a deployment target: it answers a real 404 for a missing
page, refuses path traversal, and serves `.md`/`.txt` with correct content types. For
production, point any static host at `public/` with "clean URLs" enabled (serve
`<path>/index.html`) and `404.html` as the error document.

---

## How it is put together

| Path | What it holds |
|---|---|
| `docs/*.md` | The 12 documentation pages. Source of truth for prose. |
| `docs/_nav.json` | Brand, domain, API base URL, and the docs nav order. |
| `docs/_errors.json` | The error catalog. The errors page is generated from it. |
| `pages/*.md` | Legal and support pages — same renderer, no rail or TOC. |
| `data/*.json` | Model catalog, host status, changelog. Drives four pages, plus one detail page per model. |
| `site/build.py` | The generator: Markdown subset, directives, templates. |
| `gateway/` | The gateway: keys, balances, routing, streaming completions. |
| `gateway/auth.py` | Sign-in: wallet signatures and email codes. |
| `gateway/evm.py` | Keccak-256, EIP-55, secp256k1 recovery. |
| `gateway/arc.py` | USDC deposits on Arc, and watching for them. |
| `gateway/wallet.py` | Per-account Arc addresses, derived from one seed. |
| `gateway/qr.py` | A self-verifying QR encoder for the payment address. |
| `site/assets/` | One stylesheet, one script, the logo. All copied verbatim. |
| `public/` | Generated output. Disposable — never edit it by hand. |

Change a fact in one place and every surface that states it follows. The base URL lives
in `_nav.json`; error codes live in `_errors.json`; prices live in `data/models.json`.

## The Markdown subset

Deliberately partial rather than accidentally partial. It covers what the docs use, and
an unsupported construct is meant to look wrong so it gets noticed.

Supported: `##`/`###` headings (auto-anchored, auto-TOC), paragraphs, `**bold**`,
`*italic*`, `` `code` ``, links, fenced code, tables, ordered and unordered lists, `---`.

Plus five block directives:

````text
::callout warn Title on the same line
Body paragraphs.
::

::steps
1. **Lead-in** — the rest of the step.
::

::cards
- **Heading** — body text.
::

::tabs
--- cURL
curl ...
--- Python
client = OpenAI(...)
::

::errors          <- expands the whole error catalog
````

`{{BRAND}}`, `{{API}}`, `{{SITE}}` and `{{DOMAIN}}` are substituted everywhere, including
inside `_errors.json`, so a rename is a one-line change.

## Agent-facing output

Generated on every build, because docs a machine cannot read are docs half the audience
cannot read:

- `/llms.txt` — short index for agents that fetch pages on demand
- `/llms-full.txt` — every page in one response
- `/docs/<page>.md` — any page as clean Markdown
- `/agents.md` — base URL, working request, and recovery steps for the five errors an
  agent actually hits

## Design

Dark-first, warm-neutral, amber accent. Every colour is a token on `:root`; light mode
redefines tokens only, so no rule is defined in one theme and missing from the other.
Theme choice persists in `localStorage` and is applied before first paint.

No webfonts and no CDN — the site renders identically offline, and there is no third
party in a position to log a reader.

JavaScript is progressive enhancement throughout. With `onerouter.js` missing, every page
still reads: tabs show their first pane, tables show every row, nav works.

## Adding a page

1. Write `docs/my-page.md` with `title`, `nav`, `kicker` and `description` front matter.
2. Add its slug to the right group in `docs/_nav.json`.
3. Rebuild. Rail, TOC, previous/next, `llms.txt` and the sitemap all update themselves.

## Checks worth running after a change

```bash
python3 site/build.py && python3 site/check.py
python3 gateway/selftest.py
python3 gateway/test_deposits.py
```

`site/check.py` audits every internal link, then guards the failure that does not
announce itself: an edit that drops a CSS rule or renames an element id another page's
script looks up. Either leaves a page that builds, returns 200 and passes a link check
while being visibly broken or silently inert.

`gateway/selftest.py` covers the parts where being wrong is a security hole —
signature verification, and that the QR encodes the address it claims to.

## The gateway

`gateway/` is a real OpenAI-compatible server, standard library only, in three files:
`core.py` (keys, balances, quotas), `engine.py` (where completions come from),
`server.py` (routes). State lives in `gateway/state.json` — secrets are stored as
SHA-256 digests, so the file never holds a usable key.

| Endpoint | What it does |
|---|---|
| `POST /v1/chat/completions` | Streaming and non-streaming. Charges the key. |
| `POST /v1/messages` | The Anthropic shape, including its SSE event sequence. |
| `POST /v1/keys` | Mints a key and a recovery secret. No account. |
| `POST /v1/keys/rotate` | Spends a recovery secret for a fresh key. |
| `GET /v1/me`, `/v1/me/open-tier` | Balance, spend, free-tier counters. |
| `GET /v1/models`, `/v1/catalog`, `/v1/auto` | Model discovery. `/v1/catalog` is public. |
| `GET /v1/receipts/<id>` | The route decision behind one response. |

A request may pin its route with `"provider": {"only": ["host"]}`. Pinned means
pinned: the request is served on that host or refused with `503 model_unavailable`,
and it is never quietly moved.

Errors are loaded from `docs/_errors.json`, so the gateway returns exactly the codes,
statuses and messages the published error page documents.

**Where completions come from.** Set both of these and the gateway is a real proxy —
your request is forwarded, the provider's tokens are streamed back, and you are billed
on what came out:

```bash
export ONEROUTER_UPSTREAM_URL=https://api.openai.com/v1
export ONEROUTER_UPSTREAM_KEY=sk-...
export ONEROUTER_UPSTREAM_MODEL=gpt-4o-mini   # optional; default passes the id through
```

With them unset it falls back to a local engine that answers deterministically. **That
fallback is not a language model and says so in every reply.** It exists so the rest of
the path — auth, model resolution, SSE, billing, quotas — can be exercised with no
credentials at all.

**Billing is approximate.** Tokens are counted at four characters each when the upstream
does not return a usage block. Prices come from `data/models.json`, which is seed data.

## Signing in

`/signin` is the front door. Two ways in, both verified by the gateway:

| Method | How it is proved |
|---|---|
| Email + password | scrypt, per-account salt, throttled to eight attempts per fifteen minutes. |
| Email code | Six-digit code, hashed in storage, five attempts, ten minutes. |
| Arc wallet | EIP-191 `personal_sign`; the address is recovered from the signature. |
| Solana wallet | Ed25519 signature over a server-issued nonce. |

There is no OAuth and no passkey path: third-party sign-in was removed along with its
console setup, its client secrets and its redirect-URI matching. An identity signs
into one account, and the key *is* the account — nothing else is stored about you.

A password is optional on any email account: `POST /v1/auth/password/set` adds one, and
a code sign-in always remains as the way back in when a password is forgotten or
locked out. Nothing stores the password itself — only an scrypt digest with a
per-account salt.

Login failures answer identically whether the address is registered or not, so the
form cannot be used to enumerate accounts. Registration does say when an address is
already taken: the alternative is telling someone their new account exists when it
does not, then failing them at every login.

```ini
ONEROUTER_ORIGINS=http://localhost:4321
ONEROUTER_SMTP_HOST=...                   # else the code is printed, not sent
```

Signature verification lives in `gateway/auth.py` and `gateway/evm.py`, including a
Keccak-256 implementation — Keccak is not SHA3-256, so hashlib cannot stand in, and
every EVM address depends on it. Run the self-test:

```bash
python3 gateway/selftest.py
```

It checks that valid signatures verify and, more to the point, that forged ones and
signatures from another wallet are refused.

## Getting a key with no account

`/signin` → **Continue without an account** starts a four-step wizard at `/keys`:

1. **Choose** — the rail. USDC on Arc is the live one.
2. **Copy key** — the gateway mints a key and a recovery secret, shown once.
3. **Send** — a deposit address, an exact amount, and a QR, polled every five seconds.
4. **Ready** — credited, with the transaction hash and the new balance.

No email, no wallet, no identity of any kind: the key *is* the account.

`gateway/qr.py` is a QR encoder written for this — byte mode, level M, versions 1-6.
It does not trust itself: `svg()` reads its own finished matrix back through an
independent decoder and raises rather than return anything that does not decode to the
exact address. A QR that sends money to the wrong place is the failure that matters,
so the page never shows an unverified one.

## Paying: USDC on Arc

Arc is an EVM chain that uses **USDC as its native gas token**. Verified against the
chain rather than assumed:

| | |
|---|---|
| Chain id | `5042` (`0x13b2`) |
| RPC | `https://rpc.mainnet.arc.io` — **rejects the default urllib agent with 403**, so a User-Agent is sent |
| USDC | precompile at `0x3600000000000000000000000000000000000000`, `symbol()` = USDC, no bytecode |
| Explorer | `https://explorer.arc.io` |

**The decimals are a trap.** Both of these report the same balance:

```
eth_getBalance / tx.value      18 decimals   (EVM native units)
balanceOf() at the precompile   6 decimals   (USDC units)
```

Mixing them matches nothing and looks like a chain problem. Everything in `arc.py`
works in the 6-decimal figure read from `Transfer` logs. A plain native send *does*
emit one of those logs (checked on a real transaction: `value` 16e18, log `16000000`),
so an ordinary wallet transfer is detected the same way a contract call would be.

### Addresses are per account

Every account gets its own deposit address, derived in `wallet.py` from one master seed
and the account id via HMAC-SHA512. Consequences worth being explicit about:

- **Any amount credits.** Attribution is by address, so there is no exact figure to
  match and nothing to mis-attribute when a wallet or exchange adjusts the amount.
- **`state.json` holds no private keys.** Only the seed is secret, and an address can
  be re-derived from a backup of the seed alone.
- **This is custodial.** Whoever holds the seed controls every address it derives.
  Losing it loses every unswept balance.

```bash
export ONEROUTER_ARC_ENABLE=1                  # deposits stay off until this is set
export ONEROUTER_ARC_MASTER_SEED=<64 hex>      # else one is generated into state.json
```

With no seed in the environment the gateway generates one and writes it to the state
file so the flow runs out of the box. That is a development convenience, and the wrong
place for it once real money is involved.

### Crediting

`arc.check()` reads `Transfer` logs into the account's address and credits what arrives
after `ONEROUTER_ARC_CONFIRMATIONS` blocks. Two details that took a rewrite to get
right, both covered by `gateway/test_deposits.py`:

- **No double-crediting.** Guarded by a high-water mark (`credited_through` plus the
  hashes in that one block), not a list of seen hashes. A list has to be capped, and a
  capped list silently forgets — an earlier version paid 400 of 900 transfers twice.
- **The result cap, not the range.** `eth_getLogs` caps by result count, so a busy
  address trips it over a window a quiet one handles. The range is walked in chunks and
  any chunk that trips the cap is quartered until it fits.

## Not built

- **`POST /v1/me/credit` grants balance for nothing.** It stands in for a card rail
  and for topping up during development. On by default only while no upstream is
  configured; once `ONEROUTER_UPSTREAM_*` is set it needs `ONEROUTER_DEV_CREDIT=1`.
  Do not expose it publicly.
- **Deposits are watched, not swept.** Credit is applied when a transfer is seen, but
  nothing moves funds off the derived addresses afterwards, and there is no
  reconciliation against what each address actually holds. Sweeping needs the master
  seed to sign, and gas on Arc is USDC.
- **A wallet sign-in does not make that wallet the deposit address.** Signing in with
  an Arc wallet proves who you are; deposits still go to the account's own derived
  address, because a deposit has to arrive somewhere the gateway can see and credit.
- **No third-party sign-in.** Google, GitHub and passkeys were removed deliberately;
  the only identities are an email address and a wallet address.
- **Sessions do not rotate.** A session token is valid for thirty days or until sign-out.
- **`/v1/responses` answers `400 unsupported_endpoint`.** Chat Completions and
  Anthropic Messages are both live; Responses is not. The docs and every model page say
  so rather than listing it as available.
- **The dashboard is presentational.** Receipts are queryable over the API but nothing
  renders them.
- **Chat history is per-browser.** `/chat` keeps conversations in `localStorage`; they
  are not synced, not on the server, and clearing site data loses them.
- **One process, one JSON file.** No concurrency story beyond a single lock.
- **Per-key budgets are documented but not enforced.** `docs/budgets.md` describes them
  and `budget_exhausted` is in the catalog; the gateway tracks spend but caps nothing.
- **No MCP server.** `docs/agent-resources.md` advertises one at `{{SITE}}/mcp`; that
  endpoint does not exist. `/llms.txt`, `/llms-full.txt` and `/docs/<page>.md` do.
- **No rate limiting.** `rate_limited` is raised for repeated password failures, but
  request-rate limiting on the completions path is not implemented.
- **Catalog, status and changelog are seed data** in `data/`. Wire them to the live
  gateway before publishing anything that reads as a live figure.
- **Prices are illustrative.** They are internally consistent and drive the calculator
  correctly, but they are not quotes.

## Related

`../excess` is a separate project and shares no code with this one.
