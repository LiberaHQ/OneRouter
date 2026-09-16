"""USDC deposits on Arc.

Arc uses USDC as its native gas token, which makes the decimals a trap worth stating
plainly, because both of these describe the same balance:

    eth_getBalance / tx.value          18 decimals (EVM native units)
    balanceOf() at the precompile       6 decimals (USDC units)

Mixing them silently matches nothing. Everything here works in the precompile's
6-decimal units, read from `Transfer` logs — a plain native send emits one, so an
ordinary wallet transfer is detected the same way a contract call would be.

Each account gets its own derived address (see `wallet.py`), so any amount can be
sent: attribution is by address, not by matching an exact figure.

    ONEROUTER_ARC_RPC           JSON-RPC endpoint
    ONEROUTER_ARC_CHAIN_ID      numeric chain id
    ONEROUTER_ARC_USDC          the USDC precompile / token address
    ONEROUTER_ARC_DECIMALS      token decimals, default 6
    ONEROUTER_ARC_CONFIRMATIONS blocks to wait, default 2
    ONEROUTER_ARC_EXPLORER      block explorer base URL
    ONEROUTER_ARC_NETWORK       label shown in the UI
    ONEROUTER_ARC_ENABLE        must be "1" — deposits stay off until set
"""

from __future__ import annotations

import json
import os
import secrets
import time
import urllib.error
import urllib.request

from gateway.evm import TRANSFER_TOPIC, to_checksum

# Defaults describe Arc as verified against the chain: id 5042, USDC at the 0x3600
# precompile with 6 decimals. Deposits still require ONEROUTER_ARC_ENABLE=1, because
# this is a live network and the addresses below receive real money.
RPC = os.environ.get("ONEROUTER_ARC_RPC", "https://rpc.mainnet.arc.io")
CHAIN_ID = int(os.environ.get("ONEROUTER_ARC_CHAIN_ID", "5042"))
USDC = os.environ.get("ONEROUTER_ARC_USDC",
                      "0x3600000000000000000000000000000000000000")
DECIMALS = int(os.environ.get("ONEROUTER_ARC_DECIMALS", "6"))
# The native balance is in EVM units (18 dp); the token interface reports USDC
# units (6 dp). Crediting reads the balance, so it works in the 18-dp scale and
# converts once, at the edge.
NATIVE_DECIMALS = int(os.environ.get("ONEROUTER_ARC_NATIVE_DECIMALS", "18"))
CONFIRMATIONS = int(os.environ.get("ONEROUTER_ARC_CONFIRMATIONS", "2"))
EXPLORER = os.environ.get("ONEROUTER_ARC_EXPLORER", "https://explorer.arc.io").rstrip("/")
NETWORK = os.environ.get("ONEROUTER_ARC_NETWORK", "Arc")
ENABLED = os.environ.get("ONEROUTER_ARC_ENABLE", "") == "1"

MIN_USD = 0.50
MAX_SCAN = 20_000        # blocks to catch up per poll, walked in chunks
LOG_WINDOW = 9000        # the endpoint refuses ranges of 10000 or more
SEEN_LIMIT = 25          # transfers kept for display
DEPOSIT_TTL = 24 * 3600  # how long a deposit intent stays "waiting" in the UI
# A live chain id means real funds. Anything else is treated as a test network.
MAINNET_IDS = {5042}


class ChainError(Exception):
    """The chain could not be reached, or answered with an error."""


def configured() -> tuple[bool, str]:
    if not ENABLED:
        return False, ("deposits are off — set ONEROUTER_ARC_ENABLE=1 to accept real "
                       "USDC on this chain")
    if not RPC:
        return False, "ONEROUTER_ARC_RPC is not set"
    if not USDC:
        return False, "ONEROUTER_ARC_USDC is not set"
    return True, ""


def is_mainnet() -> bool:
    return CHAIN_ID in MAINNET_IDS


def describe() -> dict:
    ready, why = configured()
    return {
        "ready": ready, "reason": why,
        "network": NETWORK, "asset": "USDC", "mode": "native+precompile",
        "chain_id": CHAIN_ID, "token": to_checksum(USDC) if USDC else None,
        "decimals": DECIMALS, "confirmations": CONFIRMATIONS,
        "minimum_usd": MIN_USD, "explorer": EXPLORER or None,
        "mainnet": is_mainnet(), "rpc": RPC,
    }


def rpc(method: str, params: list):
    if not RPC:
        raise ChainError("no Arc RPC is configured")
    payload = json.dumps({"jsonrpc": "2.0", "id": 1,
                          "method": method, "params": params}).encode()
    # The endpoint rejects the default urllib agent with 403, so name ourselves.
    req = urllib.request.Request(RPC, data=payload, method="POST", headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "onerouter-gateway/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            body = json.loads(res.read())
    except urllib.error.HTTPError as err:
        raise ChainError(f"Arc RPC answered {err.code}") from err
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as err:
        raise ChainError(f"Arc RPC unreachable: {err}") from err
    if "error" in body:
        raise ChainError(f"Arc RPC error: {body['error'].get('message', body['error'])}")
    return body.get("result")


def units(usd: float) -> int:
    return int(round(usd * 10 ** DECIMALS))


def usd(raw: int) -> float:
    """Token units (6 dp) -> dollars."""
    return raw / 10 ** DECIMALS


def native_usd(raw: int) -> float:
    """A native balance or tx value (18 dp) -> dollars."""
    return raw / 10 ** NATIVE_DECIMALS


def native_units(usd_amount: float) -> int:
    return int(round(usd_amount * 10 ** NATIVE_DECIMALS))


def balance_of(address: str) -> int:
    """The address's USDC balance in native units. One call, no range or result cap."""
    return int(rpc("eth_getBalance", [address, "latest"]), 16)


def head_block() -> int:
    return int(rpc("eth_blockNumber", []), 16)


def _topic(address: str) -> str:
    return "0x" + address.lower().replace("0x", "").rjust(64, "0")


def _get_logs(address: str, first: int, last: int) -> list[dict]:
    return rpc("eth_getLogs", [{
        "fromBlock": hex(max(first, 0)),
        "toBlock": hex(last),
        "address": USDC,
        "topics": [TRANSFER_TOPIC, None, _topic(address)],
    }]) or []


def incoming(address: str, from_block: int, to_block: int) -> list[dict]:
    """USDC transfers into `address`, oldest first.

    Read from the precompile's `Transfer` logs in 6-decimal units — a native send
    emits one, so an ordinary wallet transfer is found the same way.

    The endpoint caps a query by result count, not by range, so a busy address can
    blow the cap over a window a quiet one handles easily. The range is walked in
    chunks and any chunk that trips the cap is halved until it fits.
    """
    raw: list[dict] = []
    window = LOG_WINDOW
    cursor = max(from_block, 0)
    while cursor <= to_block:
        stop = min(cursor + window - 1, to_block)
        try:
            raw.extend(_get_logs(address, cursor, stop))
        except ChainError as err:
            if "max results" in str(err) or "range" in str(err):
                if window > 1:
                    window = max(1, window // 4)
                    continue          # retry the same cursor with a tighter window
                raise                 # a single block over the cap is unrecoverable
            raise
        cursor = stop + 1
        if window < LOG_WINDOW:
            window = min(LOG_WINDOW, window * 2)   # ease back up once it fits again

    out = [{
        "tx": entry["transactionHash"],
        "block": int(entry["blockNumber"], 16),
        "from": to_checksum("0x" + entry["topics"][1][-40:]),
        "units": int(entry.get("data", "0x0"), 16),
    } for entry in raw]
    out.sort(key=lambda e: e["block"])
    return out


def open_deposit(account_id: str, address: str, usd_wanted: float) -> dict:
    """A deposit intent. The address is the account's own, so the amount below is a
    suggestion for the UI — any amount sent to it credits."""
    ready, why = configured()
    if not ready:
        raise ChainError(why)
    try:
        start = head_block()
    except ChainError:
        start = 0
    return {
        "reference": "dep_" + secrets.token_hex(6),
        "account": account_id,
        "address": address,
        "chain_id": CHAIN_ID,
        "network": NETWORK,
        "asset": "USDC",
        "token": to_checksum(USDC),
        "decimals": DECIMALS,
        "suggested_usd": max(usd_wanted, MIN_USD),
        "from_block": start,
        "cursor": start,
        "confirmations": CONFIRMATIONS,
        "received_units": 0,
        "seen": [],
        "created": int(time.time()),
        "expires": int(time.time()) + DEPOSIT_TTL,
        "status": "waiting",
        "mainnet": is_mainnet(),
    }


def check(deposit: dict) -> tuple[dict, int]:
    """Credits whatever has arrived. Returns (deposit, newly_credited_native_units).

    Crediting reads the address balance rather than scanning `Transfer` logs. Logs
    looked like the tidier mechanism — they carry a tx hash and a block number — but
    on Arc they are not emitted for every arrival: a real 1 USDC deposit showed up in
    `eth_getBalance` with no matching log anywhere in 120k blocks, so a log-based
    watcher could never have seen it. The balance is what the chain actually owes.

    It is also one RPC call with no range or result cap, where the log walk needed up
    to forty and rate-limited itself into never catching up.

    A per-account address makes the arithmetic safe: everything that arrives belongs
    to this account, so `balance - already_credited` is the amount owed, and it cannot
    double-credit however often it runs.
    """
    ready, why = configured()
    if not ready:
        raise ChainError(why)

    balance = balance_of(deposit["address"])
    credited = int(deposit.get("credited_native", 0))
    owed = max(0, balance - credited)

    deposit["balance_native"] = balance
    deposit["balance_usd"] = native_usd(balance)
    if owed:
        deposit["credited_native"] = credited + owed
        deposit["received_native"] = int(deposit.get("received_native", 0)) + owed
        deposit["received_usd"] = native_usd(deposit["received_native"])
        deposit["status"] = "credited"
        deposit["credited_at"] = int(time.time())
    elif deposit.get("received_native"):
        deposit["status"] = "credited"
        deposit["received_usd"] = native_usd(deposit["received_native"])
    elif deposit["expires"] < time.time():
        deposit["status"] = "expired"
    else:
        deposit["status"] = "waiting"

    # Transfer logs are still read, but only to show a tx hash and an explorer link.
    # A failure here must never stop a credit, so it is contained.
    if owed and EXPLORER:
        try:
            head = head_block()
            recent = incoming(deposit["address"], max(head - LOG_WINDOW, 0), head)
            for entry in recent[-SEEN_LIMIT:]:
                entry["explorer_url"] = f"{EXPLORER}/tx/{entry['tx']}"
            if recent:
                deposit["seen"] = recent[-SEEN_LIMIT:]
        except ChainError:
            pass

    return deposit, owed
