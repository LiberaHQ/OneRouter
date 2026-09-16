"""Sign-in and deposit routes.

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

from gateway import arc, auth, qr

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
        # The redirect URI a provider must have registered. Surfaced because
        # redirect_uri_mismatch is the single most common way this is misconfigured,
        # and the fix is to paste this exact string into the provider's console.
        for provider, cfg in auth.OAUTH.items():
            if cfg["client_id"]:
                methods[provider]["redirect_uri"] = _callback_url(h, provider)
        h.reply(200, {"methods": methods, "rp_id": auth.RP_ID, "origins": auth.ORIGINS})
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

    if match := re.fullmatch(r"/v1/auth/oauth/(\w+)/start", path):
        provider = match.group(1)
        if provider not in auth.OAUTH:
            h.fail_msg("invalid_request", f"unknown provider {provider!r}")
            return True
        redirect = query.get("redirect_uri", [""])[0] or _callback_url(h, provider)
        state = h.store.stash("oauth", {"provider": provider, "redirect": redirect,
                                        "return_to": query.get("return_to", ["/"])[0]})
        try:
            url = auth.oauth_start(provider, redirect, state)
        except auth.AuthError as err:
            h.fail_msg("invalid_request", str(err))
            return True
        h.send_response(302)
        h.send_header("Location", url)
        h.send_header("Content-Length", "0")
        h._cors()
        h.end_headers()
        return True

    if match := re.fullmatch(r"/v1/auth/oauth/(\w+)/callback", path):
        _oauth_callback(h, match.group(1), query)
        return True

    # Providers hold an allow-list of redirect URIs, and an existing OAuth client
    # often already has one registered under a different convention. Rather than
    # insist on our own path, the common shapes are served as aliases so a client
    # that is already set up needs no console change.
    if match := re.fullmatch(r"/api/auth/(\w+)/callback", path):
        _oauth_callback(h, match.group(1), query)
        return True

    if match := re.fullmatch(r"/api/auth/callback/(\w+)", path):
        _oauth_callback(h, match.group(1), query)
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


def _callback_url(h, provider: str) -> str:
    """The redirect URI, which must match the provider's registration exactly.

    Derived from the Host header so local development needs no configuration, and
    overridable because a deployment behind a proxy or a different hostname has to
    send the URI that was actually registered.
    """
    import os
    base = os.environ.get("ONEROUTER_OAUTH_REDIRECT_BASE", "").rstrip("/")
    if not base:
        host = h.headers.get("Host", "127.0.0.1:8080")
        scheme = "https" if h.headers.get("X-Forwarded-Proto") == "https" else "http"
        base = f"{scheme}://{host}"
    # The path is configurable because it has to match the provider's registration
    # exactly. `{provider}` is substituted so one setting covers every provider.
    template = os.environ.get("ONEROUTER_OAUTH_CALLBACK_PATH",
                              "/v1/auth/oauth/{provider}/callback")
    return f"{base}{template.format(provider=provider)}"


def _oauth_callback(h, provider: str, query: dict) -> None:
    state = query.get("state", [""])[0]
    row = h.store.take(state, "oauth")
    if not row or row["provider"] != provider:
        h.fail_msg("invalid_request", "this sign-in link has expired; start again")
        return
    if "error" in query:
        h.fail_msg("invalid_request", f"{provider} returned {query['error'][0]}")
        return
    code = query.get("code", [""])[0]
    if not code:
        h.fail_msg("invalid_request", "no authorisation code came back")
        return
    try:
        identity, label = auth.oauth_finish(provider, code, row["redirect"])
    except auth.AuthError as err:
        h.fail_msg("invalid_request", str(err))
        return

    acct, minted = h.store.sign_in(identity)
    token = h.store.open_session(acct)
    # The browser started this in a redirect, so it has to come back as one. The
    # hand-off token is single-use and short-lived; the page swaps it for a session.
    ref = h.store.stash("handoff", {"session": token, "account": acct["id"],
                                    "label": label,
                                    "key": minted["key"] if minted else None,
                                    "recovery": minted["recovery"] if minted else None},
                        ttl=120)
    target = row.get("return_to") or "/"
    sep = "&" if "?" in target else "?"
    h.send_response(302)
    h.send_header("Location", f"{target}{sep}handoff={urllib.parse.quote(ref)}")
    h.send_header("Content-Length", "0")
    h._cors()
    h.end_headers()


# ── POST ────────────────────────────────────────────────────────────────────────
def handle_post(h, path: str, body: dict) -> bool:
    if path == "/v1/auth/anonymous":
        minted = h.store.mint()
        acct = h.store.state["accounts"][minted["account"]]
        signed_in(h, acct, minted)
        return True

    if path == "/v1/auth/handoff":
        row = h.store.take(body.get("handoff", ""), "handoff")
        if not row:
            h.fail_msg("invalid_request", "that sign-in has already been used or expired")
            return True
        h.reply(200, {k: row[k] for k in
                      ("session", "account", "label", "key", "recovery") if row.get(k)})
        return True

    if path == "/v1/auth/email/start":
        _email_start(h, body)
        return True

    if path == "/v1/auth/email/verify":
        _email_verify(h, body)
        return True

    if path == "/v1/auth/email/attach":
        _email_attach(h, body)
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

    if path == "/v1/auth/passkey/register/start":
        _passkey_register_start(h)
        return True

    if path == "/v1/auth/passkey/register/finish":
        _passkey_register_finish(h, body)
        return True

    if path == "/v1/auth/passkey/login/start":
        ref = h.store.stash("passkey-login", {"challenge": auth.b64url(secrets.token_bytes(32))})
        row = h.store.peek(ref, "passkey-login")
        h.reply(200, {"ref": ref, "challenge": row["challenge"],
                      "rp_id": auth.RP_ID, "timeout": 120000})
        return True

    if path == "/v1/auth/passkey/login/finish":
        _passkey_login_finish(h, body)
        return True

    if path == "/v1/auth/signout":
        h.store.close_session(h.bearer())
        h.reply(200, {"signed_out": True})
        return True

    if path == "/v1/pay/deposit":
        _open_deposit(h, body)
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


def _email_attach(h, body: dict) -> None:
    """Puts an email on an account you already hold the key to. Proves both: the code
    proves the address, the key proves the account."""
    row = _check_code(h, body)
    if not row:
        return
    acct = h.store.resolve(str(body.get("key", "")))
    if not acct:
        h.fail_msg("invalid_api_key", "that key was not recognised")
        return
    try:
        h.store.link(acct, f"email:{row['email']}")
    except ValueError:
        h.fail_msg("invalid_request",
                   "that email already signs into a different account")
        return
    signed_in(h, acct, None, {"label": row["email"]})


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
    account created by code, wallet or passkey can grow one."""
    acct, err = principal(h)
    if err:
        h.fail_msg(err, "sign in first, then set a password on that account")
        return
    password = str(body.get("password", ""))
    problem = _password_problem(password)
    if problem:
        h.fail_msg("invalid_request", problem)
        return
    # Changing an existing password requires the old one; setting a first one does not,
    # because the session already proved the account.
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


# ── Passkeys ────────────────────────────────────────────────────────────────────
def _passkey_register_start(h) -> None:
    acct, err = principal(h)
    if err:
        h.fail(err, "sign in first, then add a passkey to that account")
        return
    challenge = auth.b64url(secrets.token_bytes(32))
    ref = h.store.stash("passkey-register", {"challenge": challenge, "account": acct["id"]})
    h.reply(200, {
        "ref": ref, "challenge": challenge, "rp_id": auth.RP_ID,
        "rp_name": h.brand, "timeout": 120000,
        "user": {"id": auth.b64url(acct["id"].encode()), "name": acct["id"],
                 "display_name": f"{h.brand} {acct['id']}"},
        "pubkey_params": [{"type": "public-key", "alg": -7},
                          {"type": "public-key", "alg": -257}],
    })


def _passkey_register_finish(h, body: dict) -> None:
    row = h.store.take(str(body.get("ref", "")), "passkey-register")
    if not row:
        h.fail_msg("invalid_request", "that registration has expired; start again")
        return
    acct = h.store.account_by_id(row["account"])
    if not acct:
        h.fail_msg("invalid_api_key", "the account went away mid-registration")
        return
    try:
        stored = auth.register_passkey(row["challenge"],
                                       str(body.get("attestation", "")),
                                       str(body.get("client_data", "")))
    except (auth.AuthError, KeyError, ValueError, IndexError) as err:
        h.fail_msg("invalid_request", f"the passkey did not verify: {err}")
        return
    h.store.save_credential(stored["credential_id"], acct["id"], stored["cose"],
                            stored["sign_count"], str(body.get("label", "passkey")))
    h.store.link(acct, f"passkey:{stored['credential_id']}")
    h.reply(200, {"credential_id": stored["credential_id"], "account": acct["id"]})


def _passkey_login_finish(h, body: dict) -> None:
    row = h.store.take(str(body.get("ref", "")), "passkey-login")
    if not row:
        h.fail_msg("invalid_request", "that sign-in has expired; start again")
        return
    cred_id = str(body.get("credential_id", ""))
    cred = h.store.credential(cred_id)
    if not cred:
        h.fail_msg("invalid_api_key", "that passkey is not registered here")
        return
    try:
        count = auth.verify_passkey(
            row["challenge"], cred["public_key"], cred.get("sign_count", 0),
            str(body.get("authenticator_data", "")), str(body.get("client_data", "")),
            str(body.get("signature", "")))
    except (auth.AuthError, ValueError, KeyError) as err:
        h.fail_msg("invalid_request", f"the passkey did not verify: {err}")
        return
    h.store.touch_credential(cred_id, count)
    acct = h.store.account_by_id(cred["account"])
    if not acct:
        h.fail_msg("invalid_api_key", "the account behind that passkey is gone")
        return
    signed_in(h, acct, None, {"label": cred.get("label", "passkey")})


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
        deposit, new_units = arc.check(deposit)
    except arc.ChainError as err:
        h.reply(200, {**deposit, "chain_error": str(err)})
        return

    # Credit what actually arrived, once per transaction. arc.check only reports a
    # transfer once it is buried, and never reports the same hash twice.
    if new_units:
        h.store.credit(acct, arc.usd(new_units))
    h.store.persist()
    h.reply(200, {**deposit, "balance_usd": round(acct["balance_usd"], 6)})
