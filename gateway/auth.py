"""Verification for every sign-in method the front door offers.

Nothing here trusts the client. Passkey assertions are verified against the stored
public key, wallet sign-ins against the ed25519 key the address encodes, and OAuth
codes are exchanged server-side. A method whose credentials are not configured
reports itself unavailable rather than degrading into something that always says yes.

`cryptography` carries the signature verification. It is the one dependency outside
the standard library, and it is optional: without it, passkeys and wallet sign-in go
unavailable and every other method still works.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import urllib.parse
import urllib.request

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec, ed25519, padding, rsa
    CRYPTO = True
except ImportError:  # pragma: no cover - depends on the host
    CRYPTO = False

RP_ID = os.environ.get("ONEROUTER_RP_ID", "localhost")
ORIGINS = [o for o in os.environ.get(
    "ONEROUTER_ORIGINS", "http://localhost:4321,http://127.0.0.1:4321").split(",") if o]

OAUTH = {
    "google": {
        "client_id": os.environ.get("ONEROUTER_GOOGLE_CLIENT_ID", ""),
        "client_secret": os.environ.get("ONEROUTER_GOOGLE_CLIENT_SECRET", ""),
        "auth": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "userinfo": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email",
        "subject": lambda p: p.get("sub"),
        "label": lambda p: p.get("email") or p.get("sub"),
    },
    "github": {
        "client_id": os.environ.get("ONEROUTER_GITHUB_CLIENT_ID", ""),
        "client_secret": os.environ.get("ONEROUTER_GITHUB_CLIENT_SECRET", ""),
        "auth": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "userinfo": "https://api.github.com/user",
        "scope": "read:user user:email",
        "subject": lambda p: str(p.get("id")),
        "label": lambda p: p.get("login") or str(p.get("id")),
    },
}

SMTP_HOST = os.environ.get("ONEROUTER_SMTP_HOST", "")
# With no mail sender wired up the code cannot be delivered. Echoing it back makes the
# flow testable locally and must never be on where real accounts exist.
EMAIL_ECHO = os.environ.get("ONEROUTER_EMAIL_ECHO", "0" if SMTP_HOST else "1") == "1"


def available() -> dict:
    """What the sign-in page should offer. Anything unconfigured is reported with the
    reason, so the button can be disabled honestly instead of failing on click."""
    return {
        "email": {"ready": True,
                  "note": "code shown by the server" if EMAIL_ECHO else "code sent by email"},
        "password": {"ready": True, "note": "email and password"},
        "google": {"ready": bool(OAUTH["google"]["client_id"] and OAUTH["google"]["client_secret"]),
                   "note": "set ONEROUTER_GOOGLE_CLIENT_ID and _SECRET"},
        "github": {"ready": bool(OAUTH["github"]["client_id"] and OAUTH["github"]["client_secret"]),
                   "note": "set ONEROUTER_GITHUB_CLIENT_ID and _SECRET"},
        "passkey": {"ready": CRYPTO, "note": "needs the cryptography package"},
        "wallet": {"ready": CRYPTO, "note": "needs the cryptography package"},
        "anonymous": {"ready": True, "note": "no identity attached"},
    }


# ── Encoding helpers ────────────────────────────────────────────────────────────
def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def unb64url(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58decode(text: str) -> bytes:
    """Solana addresses are base58 of a 32-byte ed25519 public key."""
    number = 0
    for char in text:
        index = B58.find(char)
        if index < 0:
            raise ValueError(f"{char!r} is not base58")
        number = number * 58 + index
    body = number.to_bytes((number.bit_length() + 7) // 8, "big")
    pad = len(text) - len(text.lstrip("1"))
    return b"\x00" * pad + body


# ── Minimal CBOR ────────────────────────────────────────────────────────────────
def cbor(data: bytes, at: int = 0):
    """Decodes the subset WebAuthn uses: ints, byte/text strings, arrays, maps.

    Returns (value, next_offset). Anything outside that subset raises, which is the
    right outcome — an attestation this cannot read is one this cannot verify.
    """
    first = data[at]
    major, info = first >> 5, first & 0x1F
    at += 1
    if info < 24:
        value = info
    elif info == 24:
        value, at = data[at], at + 1
    elif info == 25:
        value, at = int.from_bytes(data[at:at + 2], "big"), at + 2
    elif info == 26:
        value, at = int.from_bytes(data[at:at + 4], "big"), at + 4
    elif info == 27:
        value, at = int.from_bytes(data[at:at + 8], "big"), at + 8
    else:
        raise ValueError(f"unsupported CBOR length {info}")

    if major == 0:
        return value, at
    if major == 1:
        return -1 - value, at
    if major in (2, 3):
        chunk = data[at:at + value]
        return (chunk if major == 2 else chunk.decode("utf-8")), at + value
    if major == 4:
        items = []
        for _ in range(value):
            item, at = cbor(data, at)
            items.append(item)
        return items, at
    if major == 5:
        table = {}
        for _ in range(value):
            key, at = cbor(data, at)
            val, at = cbor(data, at)
            table[key] = val
        return table, at
    raise ValueError(f"unsupported CBOR major type {major}")


# ── WebAuthn ────────────────────────────────────────────────────────────────────
class AuthError(Exception):
    """A sign-in attempt that did not verify. The message is safe to show."""


def _check_client_data(raw: bytes, expect_type: str, challenge: str) -> None:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise AuthError("clientDataJSON is not JSON") from err
    if data.get("type") != expect_type:
        raise AuthError(f"expected {expect_type}, got {data.get('type')!r}")
    if not hmac.compare_digest(data.get("challenge", ""), challenge):
        raise AuthError("challenge does not match the one issued")
    if data.get("origin") not in ORIGINS:
        raise AuthError(f"origin {data.get('origin')!r} is not allowed")


def _check_auth_data(auth_data: bytes, *, require_user_present: bool = True) -> tuple[int, int]:
    if len(auth_data) < 37:
        raise AuthError("authenticator data is too short")
    if not hmac.compare_digest(auth_data[:32], hashlib.sha256(RP_ID.encode()).digest()):
        raise AuthError(f"authenticator signed for a different relying party than {RP_ID!r}")
    flags = auth_data[32]
    if require_user_present and not flags & 0x01:
        raise AuthError("the authenticator did not report user presence")
    return flags, int.from_bytes(auth_data[33:37], "big")


def _public_key_from_cose(cose: dict):
    kty = cose.get(1)
    if kty == 2:  # EC2 / P-256, the usual passkey
        if cose.get(-1) != 1:
            raise AuthError("only the P-256 curve is supported")
        x = int.from_bytes(cose[-2], "big")
        y = int.from_bytes(cose[-3], "big")
        return ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()
    if kty == 3:  # RSA
        n = int.from_bytes(cose[-1], "big")
        e = int.from_bytes(cose[-2], "big")
        return rsa.RSAPublicNumbers(e, n).public_key()
    raise AuthError(f"unsupported key type {kty}")


def register_passkey(challenge: str, attestation_b64: str, client_data_b64: str) -> dict:
    """Verifies a registration ceremony and returns what to store.

    The attestation statement itself is not checked: passkeys are registered with
    "none" attestation in practice, and verifying provenance of the authenticator is
    a different problem from verifying that this credential signed this challenge.
    """
    if not CRYPTO:
        raise AuthError("passkeys need the cryptography package")
    _check_client_data(unb64url(client_data_b64), "webauthn.create", challenge)
    attestation, _ = cbor(unb64url(attestation_b64))
    auth_data = attestation["authData"]
    flags, sign_count = _check_auth_data(auth_data)
    if not flags & 0x40:
        raise AuthError("no credential was attested")

    cred_len = int.from_bytes(auth_data[53:55], "big")
    cred_id = auth_data[55:55 + cred_len]
    cose, _ = cbor(auth_data, 55 + cred_len)
    _public_key_from_cose(cose)  # rejects anything unverifiable before it is stored
    return {"credential_id": b64url(cred_id), "cose": b64url(auth_data[55 + cred_len:]),
            "sign_count": sign_count}


def verify_passkey(challenge: str, stored_cose_b64: str, stored_count: int,
                   auth_data_b64: str, client_data_b64: str, signature_b64: str) -> int:
    """Verifies an assertion. Returns the new signature counter."""
    if not CRYPTO:
        raise AuthError("passkeys need the cryptography package")
    client_data = unb64url(client_data_b64)
    _check_client_data(client_data, "webauthn.get", challenge)
    auth_data = unb64url(auth_data_b64)
    _, sign_count = _check_auth_data(auth_data)

    cose, _ = cbor(unb64url(stored_cose_b64))
    key = _public_key_from_cose(cose)
    signed = auth_data + hashlib.sha256(client_data).digest()
    signature = unb64url(signature_b64)
    try:
        if isinstance(key, ec.EllipticCurvePublicKey):
            key.verify(signature, signed, ec.ECDSA(hashes.SHA256()))
        else:
            key.verify(signature, signed, padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature as err:
        raise AuthError("the passkey signature did not verify") from err

    # A counter that fails to advance can mean a cloned authenticator. Authenticators
    # that never count report 0 forever, which is allowed.
    if sign_count and stored_count and sign_count <= stored_count:
        raise AuthError("the authenticator's signature counter went backwards")
    return sign_count


# ── Solana wallet ───────────────────────────────────────────────────────────────
def wallet_statement(nonce: str, domain: str, chain: str = "arc") -> str:
    label = {"arc": "Arc", "solana": "Solana"}.get(chain, chain)
    return (f"{domain} wants you to sign in with your {label} account.\n\n"
            f"This proves you hold the key. It authorises nothing else: no transaction, "
            f"no transfer, no spend.\n\nNonce: {nonce}")


def verify_evm_wallet(address: str, message: str, signature_hex: str) -> str:
    """Recovers the signer of an EIP-191 personal_sign and checks it is who they claim.

    EVM signatures carry no public key, so the address is recovered from the curve and
    compared — there is nothing to trust from the client but the signature itself.
    """
    from gateway import evm
    try:
        signature = bytes.fromhex(signature_hex.removeprefix("0x"))
    except ValueError as err:
        raise AuthError("signature is not hex") from err
    try:
        recovered = evm.recover_address(evm.personal_hash(message), signature)
    except ValueError as err:
        raise AuthError(f"could not recover a signer: {err}") from err
    if recovered.lower() != address.lower().strip():
        raise AuthError("the signature was produced by a different address")
    return recovered


def verify_wallet(address: str, message: str, signature_b64: str) -> str:
    """Checks an ed25519 signature against the key the address encodes."""
    if not CRYPTO:
        raise AuthError("wallet sign-in needs the cryptography package")
    try:
        raw = b58decode(address)
    except ValueError as err:
        raise AuthError("that is not a base58 address") from err
    if len(raw) != 32:
        raise AuthError("a Solana address decodes to 32 bytes")
    try:
        ed25519.Ed25519PublicKey.from_public_bytes(raw).verify(
            unb64url(signature_b64), message.encode())
    except (InvalidSignature, ValueError) as err:
        raise AuthError("the wallet signature did not verify") from err
    return address


# ── OAuth 2.0 ───────────────────────────────────────────────────────────────────
def oauth_start(provider: str, redirect_uri: str, state: str) -> str:
    cfg = OAUTH[provider]
    if not cfg["client_id"]:
        raise AuthError(f"{provider} sign-in is not configured on this gateway")
    query = urllib.parse.urlencode({
        "client_id": cfg["client_id"], "redirect_uri": redirect_uri,
        "response_type": "code", "scope": cfg["scope"], "state": state,
    })
    return f"{cfg['auth']}?{query}"


def _post_form(url: str, fields: dict, headers: dict) -> dict:
    req = urllib.request.Request(
        url, data=urllib.parse.urlencode(fields).encode(),
        headers={"Accept": "application/json", **headers}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read())


def oauth_finish(provider: str, code: str, redirect_uri: str) -> tuple[str, str]:
    """Exchanges the code server-side and returns (identity, label)."""
    cfg = OAUTH[provider]
    if not cfg["client_id"]:
        raise AuthError(f"{provider} sign-in is not configured on this gateway")
    try:
        token = _post_form(cfg["token"], {
            "client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
            "code": code, "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }, {})
    except urllib.error.HTTPError as err:
        # The provider answered and refused. Saying "could not reach" here sends
        # people looking for a network fault instead of reading the reason.
        detail = ""
        try:
            body = json.loads(err.read())
            detail = body.get("error_description") or body.get("error") or ""
        except (json.JSONDecodeError, OSError, ValueError):
            pass
        hint = {
            "invalid_grant": " — the code was already used, or has expired",
            "redirect_uri_mismatch": (" — the redirect URI does not match the one "
                                      "registered with the provider"),
            "invalid_client": " — the client id or secret is wrong",
        }.get(detail, "")
        raise AuthError(
            f"{provider} refused the authorisation code: {detail or err.code}{hint}"
        ) from err
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as err:
        raise AuthError(f"could not reach {provider}: {err}") from err

    access = token.get("access_token")
    if not access:
        raise AuthError(f"{provider} refused the code: {token.get('error', 'no token')}")
    req = urllib.request.Request(cfg["userinfo"], headers={
        "Authorization": f"Bearer {access}", "Accept": "application/json",
        "User-Agent": "onerouter"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            profile = json.loads(res.read())
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as err:
        raise AuthError(f"could not read the {provider} profile: {err}") from err

    subject = cfg["subject"](profile)
    if not subject:
        raise AuthError(f"{provider} returned no account id")
    return f"{provider}:{subject}", cfg["label"](profile)


# ── Email codes ─────────────────────────────────────────────────────────────────
def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def send_code(address: str, code: str) -> None:
    """Delivers the code, or raises if no sender is configured and echoing is off."""
    if EMAIL_ECHO:
        print(f"  [email] code for {address}: {code}")
        return
    import smtplib
    from email.message import EmailMessage
    msg = EmailMessage()
    msg["Subject"] = f"Your sign-in code: {code}"
    msg["From"] = os.environ.get("ONEROUTER_SMTP_FROM", "no-reply@onerouter.dev")
    msg["To"] = address
    msg.set_content(f"Your sign-in code is {code}. It expires in 10 minutes.")
    with smtplib.SMTP(SMTP_HOST, int(os.environ.get("ONEROUTER_SMTP_PORT", 587))) as smtp:
        smtp.starttls()
        user = os.environ.get("ONEROUTER_SMTP_USER")
        if user:
            smtp.login(user, os.environ.get("ONEROUTER_SMTP_PASSWORD", ""))
        smtp.send_message(msg)
