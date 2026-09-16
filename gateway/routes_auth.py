"""Sign-in and deposit routes.

Two ways in: an email (code or password) and a wallet signature. Nothing else.

Kept apart from `server.py` so the completions path stays readable. Each handler
returns True once it has answered; the server falls through to its own routes when
none of these match.

`h` is the request handler — it carries reply(), fail(), read_json() and the store.
"""

from __future__ import annotations

import json
import re
import secrets
import time
import urllib.parse

from gateway import arc, auth, core, qr

SESSION_PREFIX = "or-sess-"


# ── Principals ──────────────────────────────────────────────────────────────────
def principal(h):
    """The account behind either a session cookie-equivalent or an API key.

    A session proves a person is signed in; a key proves possession of a secret. Both
    identify the same account, and either is enough for the dashboard-shaped routes.
    """
    token = h.bearer()
    if not token:
        return None, "missing_api_key"
    if token.startswith(SESSION_PREFIX):
        acct = h.store.session(token)
        return (acct, None) if acct else (None, "invalid_api_key")
    acct = h.store.resolve(token)
    return (acct, None) if acct else (None, "invalid_api_key")


def signed_in(h, acct, minted=None, extra=None):
    """One shape for every successful sign-in, so the front end has one thing to read."""
    token = h.store.open_session(acct)
    body = {
        "session": token,
        "account": acct["id"],
        "balance_usd": round(acct["balance_usd"], 6),
        "identities": acct.get("identities", []),
        "new_account": bool(minted),
    }
    # The key and recovery secret exist for exactly one response: the one that created
    # the account. They are never retrievable afterwards.
    if minted:
        body["key"] = minted["key"]
        body["recovery"] = minted["recovery"]
    return h.reply(200, {**body, **(extra or {})})


# ── GET ─────────────────────────────────────────────────────────────────────────
def handle_get(h, path: str, query: dict) -> bool:
    if path == "/v1/auth/methods":
        methods = auth.available()
        methods["wallet"]["chains"] = ["arc", "solana"]
        h.reply(200, {"methods": methods, "origins": auth.ORIGINS})
        return True

    if path == "/v1/usage":
        _usage(h)
        return True

    if path == "/v1/auth/session":
        acct, err = principal(h)
        if err:
            h.fail(err)
        else:
            h.reply(200, {"account": acct["id"],
                          "balance_usd": round(acct["balance_usd"], 6),
                          "spent_usd": round(acct["spent_usd"], 6),
                          "requests": acct["requests"],
                          "identities": acct.get("identities", []),
                          "arc_address": h.store.arc_address(acct),
                          "arc_chain_id": arc.CHAIN_ID})
        return True

    if path == "/v1/pay/methods":
        h.reply(200, {"arc": arc.describe()})
        return True

    if match := re.fullmatch(r"/v1/pay/deposit/(dep_[0-9a-f]+)", path):
        _deposit_status(h, match.group(1))
        return True

    if match := re.fullmatch(r"/v1/pay/deposit/(dep_[0-9a-f]+)/qr\.svg", path):
        _deposit_qr(h, match.group(1))
        return True

    return False


# ── POST ────────────────────────────────────────────────────────────────────────
def handle_post(h, path: str, body: dict) -> bool:
    if path == "/v1/auth/email/start":
        _email_start(h, body)
        return True

    if path == "/v1/auth/email/verify":
        _email_verify(h, body)
        return True

    if path == "/v1/auth/password/register":
        _password_register(h, body)
        return True

    if path == "/v1/auth/password/login":
        _password_login(h, body)
        return True

    if path == "/v1/auth/password/set":
        _password_set(h, body)
        return True

    if path == "/v1/auth/wallet/challenge":
        _wallet_challenge(h, body)
        return True

    if path == "/v1/auth/wallet/verify":
        _wallet_verify(h, body)
        return True

    if path == "/v1/auth/signout":
        h.store.close_session(h.bearer())
        h.reply(200, {"signed_out": True})
        return True

    if path == "/v1/pay/deposit":
        _open_deposit(h, body)
        return True

    if path == "/v1/pay/reconcile":
        _reconcile_route(h)
        return True

    return False


# ── Email codes ─────────────────────────────────────────────────────────────────
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]+$")


def _email_start(h, body: dict) -> None:
    address = str(body.get("email", "")).strip().lower()
    if not EMAIL_RE.match(address):
        h.fail_msg("invalid_request", "that does not look like an email address")
        return
    code = auth.new_code()
    ref = h.store.stash("email", {"email": address, "code_hash": h.store_digest(code),
                                  "tries": 0})
    try:
        auth.send_code(address, code)
    except Exception as err:  # noqa: BLE001 - any sender failure is the same to the caller
        h.fail_msg("internal_error", f"could not send the code: {err}")
        return
    out = {"ref": ref, "expires_in": 600}
    if auth.EMAIL_ECHO:
        # No mail sender is configured, so the code comes back instead. Development only.
        out["code"] = code
        out["note"] = "no mail sender configured — code returned directly"
    h.reply(200, out)


def _email_verify(h, body: dict) -> None:
    row = _check_code(h, body)
    if not row:
        return
    acct, minted = h.store.sign_in(f"email:{row['email']}")
    signed_in(h, acct, minted, {"label": row["email"]})


def _check_code(h, body: dict):
    """Shared by verify and attach. Returns the pending row, or answers and returns None."""
    ref = str(body.get("ref", ""))
    row = h.store.peek(ref, "email")
    if not row:
        h.fail_msg("invalid_request", "that code has expired; ask for a new one")
        return None
    if h.store.bump(ref, "tries") > 5:
        h.store.take(ref, "email")
        h.fail_msg("invalid_request", "too many attempts; ask for a new code")
        return None
    if not secrets.compare_digest(h.store_digest(str(body.get("code", "")).strip()),
                                  row["code_hash"]):
        h.fail_msg("invalid_request", "that code is not right")
        return None
    h.store.take(ref, "email")
    return row


# ── Passwords ───────────────────────────────────────────────────────────────────
MIN_PASSWORD = 10
MAX_FAILURES = 8
OBVIOUS = {"password", "password123", "12345678901", "qwertyuiop", "letmein123",
           "changeme123", "administrator"}


def _password_problem(password: str) -> str | None:
    if len(password) < MIN_PASSWORD:
        return f"a password needs at least {MIN_PASSWORD} characters"
    if password.lower() in OBVIOUS:
        return "that password is one of the first anyone tries"
    if len(set(password)) < 4:
        return "that password repeats too few distinct characters"
    return None


def _password_register(h, body: dict) -> None:
    """Email plus a password, as an account of its own.

    Whether an address is already registered is not a secret worth keeping here: the
    alternative is telling someone their new account exists when it does not, and then
    failing them at every login. It is stated plainly instead.
    """
    address = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if not EMAIL_RE.match(address):
        h.fail_msg("invalid_request", "that does not look like an email address")
        return
    problem = _password_problem(password)
    if problem:
        h.fail_msg("invalid_request", problem)
        return
    if h.store.by_identity(f"email:{address}"):
        h.fail_msg("invalid_request",
                   "that address already has an account — log in instead")
        return

    acct, minted = h.store.sign_in(f"email:{address}")
    h.store.set_password(acct, password)
    signed_in(h, acct, minted, {"label": address})


def _password_login(h, body: dict) -> None:
    address = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    subject = f"pw:{address}"

    if h.store.failures(subject) >= MAX_FAILURES:
        h.fail_msg("rate_limited",
                   "too many failed attempts on this address; wait fifteen minutes "
                   "or sign in with a one-time code instead")
        return

    acct = h.store.by_identity(f"email:{address}")
    # The same answer either way: a login form should not double as a way to find out
    # which addresses are registered.
    if not acct or not acct.get("password") or not h.store.password_matches(acct, password):
        count = h.store.note_failure(subject)
        h.fail_msg("invalid_api_key",
                   "that email and password do not match" +
                   (f" ({MAX_FAILURES - count} attempt"
                    f"{'' if MAX_FAILURES - count == 1 else 's'} left)"
                    if count >= MAX_FAILURES - 3 else ""))
        return

    h.store.clear_failures(subject)
    signed_in(h, acct, None, {"label": address})


def _password_set(h, body: dict) -> None:
    """Adds or changes the password on the account you are already signed into, so an
    account created by code or wallet can grow one."""
    acct, err = principal(h)
    if err:
        h.fail_msg(err, "sign in first, then set a password on that account")
        return
    password = str(body.get("password", ""))
    problem = _password_problem(password)
    if problem:
        h.fail_msg("invalid_request", problem)
        return
    if acct.get("password") and not h.store.password_matches(
            acct, str(body.get("current_password", ""))):
        h.fail_msg("invalid_request", "the current password is wrong")
        return
    if not any(i.startswith("email:") for i in acct.get("identities", [])):
        h.fail_msg("invalid_request",
                   "attach an email to this account first — a password needs something "
                   "to log in with")
        return
    h.store.set_password(acct, password)
    h.reply(200, {"account": acct["id"], "password_set": True})


# ── Wallets ─────────────────────────────────────────────────────────────────────
def _wallet_challenge(h, body: dict) -> None:
    chain = str(body.get("chain", "arc")).lower()
    address = str(body.get("address", "")).strip()
    if chain not in ("arc", "solana"):
        h.fail_msg("invalid_request", f"unknown chain {chain!r}")
        return
    if not address:
        h.fail_msg("invalid_request", "no wallet address was given")
        return
    nonce = secrets.token_hex(12)
    message = auth.wallet_statement(nonce, h.domain, chain)
    ref = h.store.stash("wallet", {"chain": chain, "address": address,
                                   "message": message})
    h.reply(200, {"ref": ref, "message": message, "chain": chain})


def _wallet_verify(h, body: dict) -> None:
    row = h.store.take(str(body.get("ref", "")), "wallet")
    if not row:
        h.fail_msg("invalid_request", "that challenge has expired; start again")
        return
    signature = str(body.get("signature", ""))
    try:
        if row["chain"] == "arc":
            address = auth.verify_evm_wallet(row["address"], row["message"], signature)
        else:
            address = auth.verify_wallet(row["address"], row["message"], signature)
    except auth.AuthError as err:
        h.fail_msg("invalid_request", str(err))
        return
    acct, minted = h.store.sign_in(f"{row['chain']}:{address.lower()}")
    signed_in(h, acct, minted, {"label": address, "chain": row["chain"]})


# ── Deposits ────────────────────────────────────────────────────────────────────
def _deposit_qr(h, reference: str) -> None:
    """The address as a QR. Encoded here, then read back before it is served — a QR
    that does not decode to the exact address is not one to point a wallet at."""
    deposit = h.store.state.setdefault("deposits", {}).get(reference)
    if not deposit:
        h.fail_msg("invalid_request", "no such deposit")
        return
    try:
        image = qr.svg(deposit["address"]).encode()
    except ValueError as err:
        h.fail_msg("internal_error", f"could not encode the address: {err}")
        return
    h.send_response(200)
    h.send_header("Content-Type", "image/svg+xml")
    h.send_header("Content-Length", str(len(image)))
    h.send_header("Cache-Control", "public, max-age=300")
    h._cors()
    h.end_headers()
    h.wfile.write(image)


def _open_deposit(h, body: dict) -> None:
    """Opens a deposit against the account's own Arc address.

    Attribution is by address, so any amount credits — there is no exact figure to
    match, and nothing to mis-attribute if a wallet or exchange adjusts the amount.
    """
    acct, err = principal(h)
    if err:
        h.fail_msg(err, "sign in or send a key to open a deposit")
        return
    try:
        wanted = float(body.get("amount_usd", arc.MIN_USD))
    except (TypeError, ValueError):
        h.fail_msg("invalid_request", "amount_usd must be a number")
        return
    if wanted < arc.MIN_USD or wanted > 100_000:
        h.fail_msg("invalid_request",
                   f"amount_usd must be between {arc.MIN_USD} and 100000")
        return
    try:
        address = h.store.arc_address(acct)
        deposit = arc.open_deposit(acct["id"], address, wanted)
    except (arc.ChainError, ValueError) as err:
        h.fail_msg("invalid_request", f"deposits are not available: {err}")
        return
    h.store.state.setdefault("deposits", {})[deposit["reference"]] = deposit
    h.store.persist()
    h.reply(201, deposit)


def _usage(h) -> None:
    """Everything the dashboard shows, aggregated from this account's receipts.

    Receipts are the record of what actually happened — one per answered request,
    written at settle time — so the figures here are the same ones each response
    carried in its `x-onerouter-*` headers rather than a separate tally that could
    drift from them.
    """
    acct, err = principal(h)
    if err:
        h.fail_msg(err, "sign in or send a key to read usage")
        return

    mine = [r for r in h.store.state.get("receipts", [])
            if r.get("account") == acct["id"]]
    mine.sort(key=lambda r: r.get("created", 0))

    by_model: dict[str, dict] = {}
    by_day: dict[str, dict] = {}
    totals = {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0,
              "cost_usd": 0.0, "free_requests": 0}

    for r in mine:
        cost = float(r.get("cost_usd") or 0)
        prompt = int(r.get("prompt_tokens") or 0)
        completion = int(r.get("completion_tokens") or 0)

        totals["requests"] += 1
        totals["prompt_tokens"] += prompt
        totals["completion_tokens"] += completion
        totals["cost_usd"] += cost
        if r.get("free"):
            totals["free_requests"] += 1

        model = by_model.setdefault(r.get("model", "unknown"), {
            "model": r.get("model", "unknown"), "requests": 0,
            "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0,
            "ttft_ms_total": 0,
        })
        model["requests"] += 1
        model["prompt_tokens"] += prompt
        model["completion_tokens"] += completion
        model["cost_usd"] += cost
        model["ttft_ms_total"] += int(r.get("ttft_ms") or 0)

        day = time.strftime("%Y-%m-%d", time.gmtime(r.get("created", 0)))
        bucket = by_day.setdefault(day, {"day": day, "requests": 0, "cost_usd": 0.0,
                                         "tokens": 0})
        bucket["requests"] += 1
        bucket["cost_usd"] += cost
        bucket["tokens"] += prompt + completion

    models = sorted(by_model.values(), key=lambda m: -m["cost_usd"])
    for m in models:
        m["cost_usd"] = round(m["cost_usd"], 8)
        # Mean time to first token, which is the latency figure that is felt.
        m["ttft_ms_avg"] = round(m.pop("ttft_ms_total") / m["requests"]) if m["requests"] else 0

    quota = h.store.open_tier(acct)
    h.reply(200, {
        "account": acct["id"],
        "created": acct["created"],
        "identities": acct.get("identities", []),
        "balance_usd": round(acct["balance_usd"], 6),
        "spent_usd": round(acct["spent_usd"], 6),
        "arc_address": h.store.arc_address(acct),
        "arc_chain_id": arc.CHAIN_ID,
        "totals": {**totals, "cost_usd": round(totals["cost_usd"], 8),
                   "total_tokens": totals["prompt_tokens"] + totals["completion_tokens"]},
        "by_model": models,
        "by_day": sorted(by_day.values(), key=lambda d: d["day"]),
        # Newest first: a dashboard reads downward from the most recent request.
        "recent": list(reversed(mine[-40:])),
        "open_tier": {
            "requests_remaining": max(0, core.FREE_REQUESTS_PER_DAY - quota["requests"]),
            "requests_limit": core.FREE_REQUESTS_PER_DAY,
            "tokens_remaining": max(0, core.FREE_TOKENS_PER_DAY - quota["tokens"]),
            "tokens_limit": core.FREE_TOKENS_PER_DAY,
        },
        # The receipt log is capped, so a long-lived key's early history rolls off.
        "history_capped_at": 500,
        "receipts_held": len(mine),
    })


def reconcile(store, only_account: str | None = None) -> list[dict]:
    """Credits anything sitting on a derived address, whether or not a page is open.

    Crediting used to happen only when a browser polled the deposit endpoint, which
    meant money that landed after someone closed the tab stayed uncredited. This walks
    the addresses instead, so the balance on chain and the balance on the key agree
    regardless of who is watching.
    """
    ready, why = arc.configured()
    if not ready:
        raise arc.ChainError(why)

    applied = []
    accounts = store.state.get("accounts", {})
    for acct_id, acct in list(accounts.items()):
        if only_account and acct_id != only_account:
            continue
        address = acct.get("arc_address")
        if not address or acct.get("revoked"):
            continue
        try:
            balance = arc.balance_of(address)
        except arc.ChainError:
            continue                      # a blip on one address must not stop the rest
        credited = int(acct.get("arc_credited_native", 0))
        owed = max(0, balance - credited)
        if not owed:
            continue
        acct["arc_credited_native"] = credited + owed
        store.credit(acct, arc.native_usd(owed))
        applied.append({
            "account": acct_id, "address": address,
            "credited_usd": arc.native_usd(owed),
            "balance_usd": round(acct["balance_usd"], 6),
        })
    store.persist()
    return applied


def _reconcile_route(h) -> None:
    acct, err = principal(h)
    if err:
        h.fail_msg(err, "sign in or send a key to reconcile a deposit")
        return
    try:
        applied = reconcile(h.store, acct["id"])
    except arc.ChainError as err_:
        h.fail_msg("invalid_request", f"could not reach the chain: {err_}")
        return
    h.reply(200, {
        "account": acct["id"],
        "arc_address": h.store.arc_address(acct),
        "credited": applied,
        "balance_usd": round(acct["balance_usd"], 6),
    })


def _deposit_status(h, reference: str) -> None:
    acct, err = principal(h)
    if err:
        h.fail_msg(err, 'sign in to check a deposit')
        return
    deposit = h.store.state.setdefault("deposits", {}).get(reference)
    if not deposit or deposit["account"] != acct["id"]:
        h.fail_msg("invalid_request", "no such deposit")
        return
    try:
        deposit, owed_native = arc.check(deposit)
    except arc.ChainError as err:
        h.reply(200, {**deposit, "chain_error": str(err)})
        return

    # Credit the difference between the address balance and what has already been
    # credited, so running this twice cannot pay twice.
    if owed_native:
        h.store.credit(acct, arc.native_usd(owed_native))
    h.store.persist()
    h.reply(200, {**deposit, "balance_usd": round(acct["balance_usd"], 6)})
