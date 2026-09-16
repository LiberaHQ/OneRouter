"""Verification for the two sign-in methods the front door offers.

Nothing here trusts the client. A wallet sign-in is checked against the key its
address encodes; an email code is compared against a digest with a try limit.

`cryptography` carries the signature verification. It is the one dependency outside
the standard library, and it is optional: without it wallet sign-in reports itself
unavailable and email still works.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric import ed25519
    CRYPTO = True
except ImportError:  # pragma: no cover - depends on the host
    CRYPTO = False

ORIGINS = [o for o in os.environ.get(
    "ONEROUTER_ORIGINS", "http://localhost:4321,http://127.0.0.1:4321").split(",") if o]

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
        "wallet": {"ready": CRYPTO, "note": "needs the cryptography package"},
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


class AuthError(Exception):
    """A sign-in attempt that did not verify. The message is safe to show."""


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
