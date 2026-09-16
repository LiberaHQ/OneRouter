"""A deposit address per account, derived rather than stored.

Each account's Arc address comes from one master seed and the account id, through
HMAC-SHA512. That means:

  * `state.json` never holds a private key — only the master seed is secret
  * the same account always resolves to the same address, across restarts
  * an address can be re-derived from a backup of the seed alone

This is a custodial arrangement: whoever holds the seed controls every deposit
address it derives. Back it up, keep it out of the state file in production, and
understand that losing it loses every balance that has not been swept.

    ONEROUTER_ARC_MASTER_SEED   hex, 32 bytes or more

With no seed configured the gateway generates one and writes it to the state file so
the flow works out of the box. That is a development convenience and it says so.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets

from gateway import evm

ENV_SEED = os.environ.get("ONEROUTER_ARC_MASTER_SEED", "")
PURPOSE = b"onerouter/arc/deposit/v1:"


def seed_from_env() -> bytes | None:
    if not ENV_SEED:
        return None
    try:
        raw = bytes.fromhex(ENV_SEED.removeprefix("0x"))
    except ValueError as err:
        raise ValueError("ONEROUTER_ARC_MASTER_SEED is not hex") from err
    if len(raw) < 32:
        raise ValueError("ONEROUTER_ARC_MASTER_SEED needs at least 32 bytes")
    return raw


def new_seed() -> str:
    return secrets.token_hex(32)


def private_key(seed: bytes, account_id: str) -> int:
    """One account, one scalar. Rejected and re-derived in the vanishing case that it
    falls outside the curve order."""
    for round_ in range(256):
        material = PURPOSE + account_id.encode() + (b"" if round_ == 0 else bytes([round_]))
        digest = hmac.new(seed, material, hashlib.sha512).digest()
        candidate = int.from_bytes(digest[:32], "big")
        if 0 < candidate < evm.N:
            return candidate
    raise ValueError("could not derive a key in range")   # unreachable in practice


def address_for(seed: bytes, account_id: str) -> str:
    """The checksummed Arc address that account's deposits go to."""
    scalar = private_key(seed, account_id)
    point = evm._mul((evm.GX, evm.GY), scalar)
    raw = point[0].to_bytes(32, "big") + point[1].to_bytes(32, "big")
    return evm.to_checksum("0x" + evm.keccak256(raw)[-20:].hex())
