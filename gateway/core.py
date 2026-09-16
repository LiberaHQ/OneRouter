"""Keys, balances and usage accounting.

One JSON file holds the lot. That is enough for a single-process gateway and it keeps
the promise the rest of this repo makes: standard library only, no install step, and a
state file you can read with `cat`.

Secrets are stored as SHA-256 digests, never in the clear — the same reason the docs
say a lost key is unrecoverable. Losing the file loses the balances with it.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = Path(__file__).resolve().parent / "state.json"
CATALOG = ROOT / "data" / "models.json"

# Open Tier quotas. Mirrors what /docs/open-tier promises.
FREE_REQUESTS_PER_DAY = 50
FREE_TOKENS_PER_DAY = 100_000
FREE_MAX_OUTPUT = 2048

_lock = threading.Lock()


def digest(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _blank() -> dict:
    return {"accounts": {}, "index": {}, "receipts": [],
            # Auth: an identity is "<provider>:<subject>" and maps to one account.
            "identities": {}, "sessions": {}, "credentials": {}, "pending": {},
            "deposits": {}, "throttle": {}}


def load() -> dict:
    if not STATE.exists():
        return _blank()
    try:
        state = json.loads(STATE.read_text())
    except (json.JSONDecodeError, OSError):
        # A truncated write should not take the gateway down with it.
        return _blank()
    # A state file written before auth existed is missing these.
    for table, blank in _blank().items():
        state.setdefault(table, blank)
    return state


def save(state: dict) -> None:
    tmp = STATE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(STATE)


class Store:
    """Serialises every read-modify-write. One lock is enough at this size."""

    def __init__(self) -> None:
        self.state = load()

    # ── Keys ────────────────────────────────────────────────────────────────
    def mint(self, *, funded: float = 0.0) -> dict:
        """A new account with a key and a recovery secret. Both are returned in the
        clear exactly once; only their digests are kept."""
        with _lock:
            key = "or-live-" + secrets.token_hex(16)
            recovery = "or-rec-" + secrets.token_hex(16)
            acct_id = "acct_" + secrets.token_hex(6)
            self.state["accounts"][acct_id] = {
                "id": acct_id,
                "created": int(time.time()),
                "balance_usd": float(funded),
                "spent_usd": 0.0,
                "requests": 0,
                "key_hash": digest(key),
                "recovery_hash": digest(recovery),
                "revoked": False,
                "open_tier": {"day": str(date.today()), "requests": 0, "tokens": 0},
                "identities": [],
            }
            self.state["index"][digest(key)] = acct_id
            self.state["index"][digest(recovery)] = acct_id
            save(self.state)
            return {"key": key, "recovery": recovery, "account": acct_id,
                    "balance_usd": float(funded)}

    def resolve(self, secret: str) -> dict | None:
        """The account behind a bearer secret, or None. Revoked keys resolve to None."""
        acct_id = self.state["index"].get(digest(secret or ""))
        if not acct_id:
            return None
        acct = self.state["accounts"].get(acct_id)
        if not acct or acct["revoked"]:
            return None
        return acct

    def revoked(self, secret: str) -> bool:
        """Whether this secret belongs to an account that has been revoked."""
        acct_id = self.state["index"].get(digest(secret or ""))
        acct = self.state["accounts"].get(acct_id or "")
        return bool(acct and acct["revoked"])

    def rotate(self, recovery: str) -> dict | None:
        """Spend a recovery secret for a fresh key. The old key stops resolving."""
        with _lock:
            acct_id = self.state["index"].get(digest(recovery or ""))
            acct = self.state["accounts"].get(acct_id or "")
            if not acct or acct["revoked"] or digest(recovery) != acct["recovery_hash"]:
                return None
            self.state["index"].pop(acct["key_hash"], None)
            key = "or-live-" + secrets.token_hex(16)
            acct["key_hash"] = digest(key)
            self.state["index"][digest(key)] = acct_id
            save(self.state)
            return {"key": key, "account": acct_id, "balance_usd": acct["balance_usd"]}

    def credit(self, acct: dict, amount: float) -> dict:
        with _lock:
            acct["balance_usd"] = round(acct["balance_usd"] + float(amount), 6)
            save(self.state)
            return acct

    # ── Billing ─────────────────────────────────────────────────────────────
    def charge(self, acct: dict, cost: float, receipt: dict) -> None:
        with _lock:
            acct["balance_usd"] = round(max(0.0, acct["balance_usd"] - cost), 6)
            acct["spent_usd"] = round(acct["spent_usd"] + cost, 6)
            acct["requests"] += 1
            self.state["receipts"].append(receipt)
            # The receipt log is a demo convenience, not an audit trail. Cap it so a
            # long-running gateway does not grow the state file without bound.
            del self.state["receipts"][:-500]
            save(self.state)

    def receipt(self, rid: str) -> dict | None:
        return next((r for r in self.state["receipts"] if r["id"] == rid), None)

    def persist(self) -> None:
        """Flush after a caller has mutated state in place."""
        with _lock:
            save(self.state)

    # ── Identities and sessions ─────────────────────────────────────────────
    def account_by_id(self, acct_id: str) -> dict | None:
        acct = self.state["accounts"].get(acct_id or "")
        return None if not acct or acct["revoked"] else acct

    def by_identity(self, identity: str) -> dict | None:
        """`<provider>:<subject>` -> the account it signs into, if any."""
        return self.account_by_id(self.state["identities"].get(identity, ""))

    def link(self, acct: dict, identity: str) -> dict:
        """Attach an identity to an account. One identity signs into one account; a
        second attempt to link it elsewhere is refused rather than silently moved."""
        with _lock:
            owner = self.state["identities"].get(identity)
            if owner and owner != acct["id"]:
                raise ValueError("identity is already attached to another account")
            self.state["identities"][identity] = acct["id"]
            if identity not in acct["identities"]:
                acct["identities"].append(identity)
            save(self.state)
            return acct

    def sign_in(self, identity: str) -> tuple[dict, dict | None]:
        """The account behind an identity, creating one on first sight.

        Returns (account, minted) where `minted` carries the key and recovery secret
        the very first time — an account is useless without a key, and this is the
        only moment either secret can be shown."""
        existing = self.by_identity(identity)
        if existing:
            return existing, None
        minted = self.mint()
        acct = self.state["accounts"][minted["account"]]
        self.link(acct, identity)
        return acct, minted

    def open_session(self, acct: dict, ttl: int = 30 * 86400) -> str:
        with _lock:
            token = "or-sess-" + secrets.token_urlsafe(32)
            self.state["sessions"][digest(token)] = {
                "account": acct["id"], "expires": int(time.time()) + ttl,
            }
            self._expire_sessions()
            save(self.state)
            return token

    def session(self, token: str) -> dict | None:
        row = self.state["sessions"].get(digest(token or ""))
        if not row or row["expires"] < time.time():
            return None
        return self.account_by_id(row["account"])

    def close_session(self, token: str) -> None:
        with _lock:
            self.state["sessions"].pop(digest(token or ""), None)
            save(self.state)

    def _expire_sessions(self) -> None:
        now = time.time()
        for key in [k for k, v in self.state["sessions"].items() if v["expires"] < now]:
            del self.state["sessions"][key]

    # ── Short-lived challenges (OTP codes, WebAuthn, wallet nonces) ──────────
    def stash(self, kind: str, payload: dict, ttl: int = 600) -> str:
        with _lock:
            ref = secrets.token_urlsafe(18)
            now = int(time.time())
            for k in [k for k, v in self.state["pending"].items() if v["expires"] < now]:
                del self.state["pending"][k]
            self.state["pending"][ref] = {"kind": kind, "expires": now + ttl, **payload}
            save(self.state)
            return ref

    def take(self, ref: str, kind: str) -> dict | None:
        """One-shot: a challenge that has been read cannot be replayed."""
        with _lock:
            row = self.state["pending"].pop(ref or "", None)
            save(self.state)
        if not row or row["kind"] != kind or row["expires"] < time.time():
            return None
        return row

    def peek(self, ref: str, kind: str) -> dict | None:
        row = self.state["pending"].get(ref or "")
        if not row or row["kind"] != kind or row["expires"] < time.time():
            return None
        return row

    def bump(self, ref: str, field: str) -> int:
        with _lock:
            row = self.state["pending"].get(ref or "")
            if not row:
                return 0
            row[field] = row.get(field, 0) + 1
            save(self.state)
            return row[field]

    # ── Arc deposit addresses ───────────────────────────────────────────────
    def arc_seed(self) -> bytes:
        """The master seed every deposit address derives from.

        Prefers the environment. Failing that it generates one and keeps it in the
        state file so addresses survive a restart — convenient for development, and
        the wrong place for it once real money is involved.
        """
        from gateway import wallet
        from_env = wallet.seed_from_env()
        if from_env:
            return from_env
        with _lock:
            held = self.state.get("arc_seed")
            if not held:
                held = wallet.new_seed()
                self.state["arc_seed"] = held
                self.state["arc_seed_generated"] = int(time.time())
                save(self.state)
            return bytes.fromhex(held)

    def seed_is_generated(self) -> bool:
        from gateway import wallet
        return wallet.seed_from_env() is None

    def arc_address(self, acct: dict) -> str:
        """This account's deposit address, derived once and then remembered so a
        changed seed cannot silently move where someone was told to send funds."""
        held = acct.get("arc_address")
        if held:
            return held
        from gateway import wallet
        address = wallet.address_for(self.arc_seed(), acct["id"])
        with _lock:
            acct["arc_address"] = address
            save(self.state)
        return address

    # ── Passwords ───────────────────────────────────────────────────────────
    # scrypt from the standard library. Deliberately slow, per-account salt, and the
    # stored value is useless on its own — the state file never holds a password.
    SCRYPT = {"n": 1 << 14, "r": 8, "p": 1, "dklen": 32}

    @classmethod
    def hash_password(cls, password: str, salt: bytes | None = None) -> dict:
        salt = salt or secrets.token_bytes(16)
        raw = hashlib.scrypt(password.encode(), salt=salt, **cls.SCRYPT)
        return {"algo": "scrypt", "salt": salt.hex(), "hash": raw.hex(),
                "params": cls.SCRYPT, "updated": int(time.time())}

    def set_password(self, acct: dict, password: str) -> None:
        with _lock:
            acct["password"] = self.hash_password(password)
            save(self.state)

    @staticmethod
    def password_matches(acct: dict, password: str) -> bool:
        stored = acct.get("password")
        if not stored:
            return False
        raw = hashlib.scrypt(password.encode(), salt=bytes.fromhex(stored["salt"]),
                             **stored["params"])
        return hmac.compare_digest(raw.hex(), stored["hash"])

    def note_failure(self, subject: str) -> int:
        """Counts recent failures for one subject and returns the total. Guessing has
        to cost something, or a password is only as good as the attacker's patience."""
        with _lock:
            table = self.state.setdefault("throttle", {})
            now = int(time.time())
            row = table.get(subject)
            if not row or row["until"] < now:
                row = {"count": 0, "until": now + 900}
            row["count"] += 1
            table[subject] = row
            save(self.state)
            return row["count"]

    def failures(self, subject: str) -> int:
        row = self.state.get("throttle", {}).get(subject)
        return row["count"] if row and row["until"] > time.time() else 0

    def clear_failures(self, subject: str) -> None:
        with _lock:
            self.state.setdefault("throttle", {}).pop(subject, None)
            save(self.state)

    # ── Passkey credentials ─────────────────────────────────────────────────
    def save_credential(self, cred_id: str, account: str, public_key: str,
                        sign_count: int, label: str) -> None:
        with _lock:
            self.state["credentials"][cred_id] = {
                "account": account, "public_key": public_key,
                "sign_count": sign_count, "label": label,
                "created": int(time.time()),
            }
            save(self.state)

    def credential(self, cred_id: str) -> dict | None:
        return self.state["credentials"].get(cred_id or "")

    def touch_credential(self, cred_id: str, sign_count: int) -> None:
        with _lock:
            row = self.state["credentials"].get(cred_id)
            if row:
                row["sign_count"] = sign_count
                save(self.state)

    def keys_for(self, acct: dict) -> list[dict]:
        """What the dashboard can show about an account without exposing a secret."""
        return [{"account": acct["id"], "balance_usd": round(acct["balance_usd"], 6),
                 "spent_usd": round(acct["spent_usd"], 6), "requests": acct["requests"],
                 "identities": acct.get("identities", []), "created": acct["created"]}]

    # ── Open Tier ───────────────────────────────────────────────────────────
    def open_tier(self, acct: dict) -> dict:
        """Today's free-tier counters, rolled over at 00:00 UTC."""
        quota = acct["open_tier"]
        today = str(date.today())
        if quota["day"] != today:
            quota.update(day=today, requests=0, tokens=0)
        return quota

    def spend_open_tier(self, acct: dict, tokens: int) -> None:
        with _lock:
            quota = self.open_tier(acct)
            quota["requests"] += 1
            quota["tokens"] += tokens
            save(self.state)


def catalog() -> list[dict]:
    return json.loads(CATALOG.read_text())


def by_id(models: list[dict]) -> dict[str, dict]:
    return {m["id"]: m for m in models}


def resolve_model(models: list[dict], wanted: str) -> dict | None:
    """`onerouter/auto` picks the cheapest paid route; `:free` the free one. Anything
    else has to be a catalog id — the router never silently substitutes a model."""
    index = by_id(models)
    if wanted in index:
        return index[wanted]
    if wanted in ("onerouter/auto:free", "auto:free"):
        index = by_id(models)
        # A named preference first: "whichever free model sorts first" picked a
        # narrow code model that answered with nothing.
        preferred = os.environ.get("ONEROUTER_FREE_MODEL", "openrouter/free")
        if preferred in index:
            return index[preferred]
        return next((m for m in models if "free" in m["tags"]), None)
    if wanted in ("onerouter/auto", "auto"):
        paid = [m for m in models if m["per_m"]["in"] > 0]
        return min(paid, key=lambda m: m["per_m"]["in"]) if paid else None
    return None


def price(model: dict, prompt_tokens: int, completion_tokens: int) -> float:
    per = model["per_m"]
    return round(prompt_tokens * per["in"] / 1e6 + completion_tokens * per["out"] / 1e6, 8)
