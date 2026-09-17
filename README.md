# OneRouter

An OpenAI-compatible LLM gateway: one prepaid key reaches every model in the catalog,
with same-model host failover, per-key budgets and no account requirement.

This repository holds the **public site**, the **developer documentation**, and the
**gateway** — all as one Next.js application in `web/`. There is no separate backend
process: the frontend and the OpenAI-compatible API are the same server.

```bash
cd web
npm install
npm run dev        # next dev, port 8080 — site and gateway, one process
```

Open http://localhost:8080. For a production build:

```bash
npm run build && npm run start
```

Node.js 20+. No Python anywhere in this repo — this is a full TypeScript/Next.js
rewrite of an earlier Python implementation (stdlib site generator + stdlib gateway).

---

## How it is put together

| Path | What it holds |
|---|---|
| `docs/*.md` | The 12 documentation pages. Source of truth for prose. |
| `docs/_nav.json` | Brand, domain, API base URL, and the docs nav order. |
| `docs/_errors.json` | The error catalog. The errors page and every API error are generated from it. |
| `pages/*.md` | Legal and support pages — same renderer, no rail or TOC. |
| `data/*.json` | Model catalog, host status, changelog. Seed data — see `web/scripts/sync-catalog.ts`. |
| `web/app/` | Next.js App Router: every page, and every `/v1/*` gateway route, as `page.tsx`/`route.ts` files. |
| `web/lib/markdown/` | The Markdown engine (a deliberately partial subset, not CommonMark) that renders `docs/`/`pages/`. |
| `web/lib/gateway/` | The gateway: `store.ts` (keys, balances, sessions), `db.ts` (the SQLite persistence boundary `store.ts` reads/writes through), `engine.ts` (where completions come from), `completions.ts` (request handling), `evm.ts`/`wallet.ts`/`qr.ts`/`arc.ts` (crypto and Arc/USDC deposits), `auth.ts`/`authRoutes.ts`/`google.ts` (sign-in). |
| `web/components/` | React components — chrome, docs, catalog, chat, keys, pay, signin. |
| `web/data/gateway.db` | Runtime state (SQLite): account balances, session tokens, the Arc master seed. Gitignored. |
| `web/public/` | Next's static asset dir (logo, favicon). |

Change a fact in one place and every surface that states it follows. The base URL
lives in `docs/_nav.json`; error codes live in `docs/_errors.json`; prices live in
`data/models.json`.

## The Markdown subset

Deliberately partial rather than accidentally partial. It covers what the docs use, and
an unsupported construct is meant to look wrong so it gets noticed. Ported line-for-line
from the original Python implementation into `web/lib/markdown/` for exact parity
(anchor-URL compatibility, identical highlighting).

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
inside `_errors.json`, so a rename is a one-line change (`web/lib/content/nav.ts`).

## Agent-facing output

Generated at request time from `docs/`, served as Next.js Route Handlers:

- `/llms.txt` — short index for agents that fetch pages on demand
- `/llms-full.txt` — every page in one response
- `/docs/<page>.md` — any page as clean Markdown (aliased via a `next.config.ts` rewrite)
- `/agents.md` — base URL, working request, and recovery steps for the five errors an
  agent actually hits

## Design

Dark-first, warm-neutral, amber accent. Every colour is a token on `:root` in
`web/app/globals.css`; light mode redefines tokens only, so no rule is defined in one
theme and missing from the other. Theme choice persists in `localStorage` and is
applied before first paint via a blocking inline script in the root layout.

No webfonts and no CDN for styling — the site renders identically offline. JavaScript
is progressive enhancement for content pages (copy buttons, code tabs, TOC scrollspy);
the catalog browser, pricing calculator, chat, keys and pay flows are real React client
components.

## Adding a page

1. Write `docs/my-page.md` with `title`, `nav`, `kicker` and `description` front matter.
2. Add its slug to the right group in `docs/_nav.json`.
3. Reload. Rail, TOC, previous/next, `llms.txt` and the sitemap all update themselves —
   `web/lib/content/docs.ts` throws at build/request time if a doc is listed in
   `_nav.json` but missing from disk, or vice versa.

## Checks worth running after a change

```bash
cd web
npm run lint
npx tsc --noEmit
npm test                                          # vitest — crypto/deposit regression suite
npm run dev &  BASE=http://localhost:8080 npm run linkcheck   # every internal link, every page
```

`npm test` covers the parts where being wrong is a security hole — Keccak-256/EIP-55
against published vectors, secp256k1 signature recovery, Solana wallet signature
verification (including forgery rejection), the Arc address derivation (cross-checked
against the original implementation), QR self-verification, and the deposit-crediting
regression suite (900 transfers must credit exactly once, even after a rewound rescan).

`npm run linkcheck` audits every internal link across the full sitemap (~450 pages) and
every in-page `#fragment` against real heading/error ids on that page.

## The gateway

`web/lib/gateway/` + `web/app/v1/**/route.ts` is a real OpenAI-compatible server. State
lives in `web/data/gateway.db` (SQLite) — secrets are stored as SHA-256 digests, so the
database never holds a usable key.

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
and it is never quietly moved. (Multi-host failover retry is documented on the errors
page but not implemented — a single attempt is made per request, matching the original
Python gateway's actual behavior rather than its docs.)

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
does not return a usage block. Prices come from `data/models.json`, which is seed data
— see `web/scripts/sync-catalog.ts` to rebuild it from a real upstream's live catalog.

## Signing in

`/signin` is the front door.

| Method | How it is proved |
|---|---|
| Email + password | scrypt, per-account salt, throttled to eight attempts per fifteen minutes. |
| Email code | Six-digit code, hashed in storage, five attempts, ten minutes. |
| Arc wallet | EIP-191 `personal_sign`; the address is recovered from the signature. |
| Solana wallet | Ed25519 signature over a server-issued nonce. |
| Google | OAuth 2.0 authorization code flow — optional, off unless `ONEROUTER_GOOGLE_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI` are all set and the redirect URI is registered in the Google Cloud Console. |

A password is optional on any email account: `POST /v1/auth/password/set` adds one, and
a code sign-in always remains as the way back in when a password is forgotten or
locked out. Nothing stores the password itself — only an scrypt digest with a
per-account salt.

Login failures answer identically whether the address is registered or not, so the
form cannot be used to enumerate accounts. Registration does say when an address is
already taken.

```ini
ONEROUTER_ORIGINS=http://localhost:8080
ONEROUTER_SMTP_HOST=...                   # else the code is printed, not sent
```

Signature verification lives in `web/lib/gateway/auth.ts` and `evm.ts`, using
`@noble/curves`/`@noble/hashes` (audited libraries) rather than hand-rolled crypto —
the original Python gateway hand-rolled Keccak-256 and secp256k1 recovery from scratch
(stdlib-only was a hard constraint there); this port doesn't carry that constraint, so
it uses vetted implementations instead. Run the self-test suite:

```bash
cd web && npm test
```

It checks that valid signatures verify and, more to the point, that forged ones and
signatures from another wallet are refused, and that the Arc address derivation
produces byte-identical output to the original implementation for a fixed seed.

## Getting a key with no account

`/signin` → **Continue without an account** starts a four-step wizard at `/keys`:

1. **Choose** — the rail. USDC on Arc is the live one.
2. **Copy key** — the gateway mints a key and a recovery secret, shown once.
3. **Send** — a deposit address, an exact amount, and a QR, polled every five seconds.
4. **Ready** — credited, with the transaction hash and the new balance.

No email, no wallet, no identity of any kind: the key *is* the account.

`web/lib/gateway/qr.ts` encodes via the `qrcode` npm package and independently
re-decodes the rendered matrix with `jsqr` before returning it — the original's
self-verification invariant, preserved: a QR that sends money to the wrong place is
the failure that matters, so the page never shows an unverified one.

## Paying: USDC on Arc

Arc is an EVM chain that uses **USDC as its native gas token**. Verified against the
chain rather than assumed:

| | |
|---|---|
| Chain id | `5042` (`0x13b2`) |
| RPC | `https://rpc.mainnet.arc.io` — **rejects the default fetch agent with 403**, so a User-Agent is sent |
| USDC | precompile at `0x3600000000000000000000000000000000000000`, `symbol()` = USDC, no bytecode |
| Explorer | `https://explorer.arc.io` |

**The decimals are a trap.** Both of these report the same balance:

```
eth_getBalance / tx.value      18 decimals   (EVM native units)
balanceOf() at the precompile   6 decimals   (USDC units)
```

Mixing them matches nothing and looks like a chain problem. Everything in
`web/lib/gateway/arc.ts` works in the 6-decimal figure read from `Transfer` logs.

### Addresses are per account

Every account gets its own deposit address, derived in `web/lib/gateway/wallet.ts` from
one master seed and the account id via HMAC-SHA512. Consequences worth being explicit
about:

- **Any amount credits.** Attribution is by address, so there is no exact figure to
  match and nothing to mis-attribute when a wallet or exchange adjusts the amount.
- **`data/gateway.db` holds no private keys.** Only the seed is secret, and an
  address can be re-derived from a backup of the seed alone.
- **This is custodial.** Whoever holds the seed controls every address it derives.
  Losing it loses every unswept balance.

```bash
export ONEROUTER_ARC_ENABLE=1                  # deposits stay off until this is set
export ONEROUTER_ARC_MASTER_SEED=<64 hex>      # else one is generated into state
```

### Crediting

`arc.check()` reads `Transfer` logs into the account's address and credits what arrives
after `ONEROUTER_ARC_CONFIRMATIONS` blocks. Two details covered by
`web/test/deposits.test.ts` (ported from the original's `test_deposits.py`):

- **No double-crediting.** Guarded by a high-water mark (`credited_through` plus the
  hashes in that one block), not a list of seen hashes.
- **The result cap, not the range.** `eth_getLogs` caps by result count; the range is
  walked in chunks and any chunk that trips the cap is quartered until it fits.

## Not built

- **`POST /v1/me/credit` grants balance for nothing.** On by default only while no
  upstream is configured; once `ONEROUTER_UPSTREAM_*` is set it needs
  `ONEROUTER_DEV_CREDIT=1`. Do not expose it publicly.
- **Deposits are watched, not swept.** No reconciliation against what each address
  actually holds. Sweeping needs the master seed to sign, and gas on Arc is USDC.
- **A wallet sign-in does not make that wallet the deposit address.**
- **Sessions do not rotate.** Valid for thirty days or until sign-out.
- **`/v1/responses` answers `400 unsupported_endpoint`.** Chat Completions and
  Anthropic Messages are both live; Responses is not.
- **The dashboard is presentational.** Receipts are queryable over the API but nothing
  renders them.
- **Chat history is per-browser.** `/chat` keeps conversations in `localStorage`.
- **One process, one JSON file.** No concurrency story beyond an in-process async lock
  — this means `next start` must run as a single persistent Node process, not
  serverless/multi-instance, or account state will diverge across instances.
- **Per-key budgets are documented but not enforced.**
- **No rate limiting** on the completions path (only on repeated password failures).
- **Catalog, status and changelog are seed data** in `data/`. Run
  `npm run sync-catalog` to refresh `data/models.json` from a real upstream.
- **Documented multi-host failover isn't implemented** — see the gateway table above.

## Related

`../excess` is a separate project and shares no code with this one.
