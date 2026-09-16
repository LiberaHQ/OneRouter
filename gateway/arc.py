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
CONFIRMATIONS = int(os.environ.get("ONEROUTER_ARC_CONFIRMATIONS", "2"))
EXPLORER = os.environ.get("ONEROUTER_ARC_EXPLORER", "https://explorer.arc.io").rstrip("/")
NETWORK = os.environ.get("ONEROUTER_ARC_NETWORK", "Arc")
ENABLED = os.environ.get("ONEROUTER_ARC_ENABLE", "") == "1"

MIN_USD = 0.50
MAX_SCAN = 20_000        # blocks to catch up per poll, walked in chunks
LOG_WINDOW = 500         # starting chunk size; halved on a cap error
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
    return raw / 10 ** DECIMALS


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
    """Scans for new transfers and returns (deposit, newly_credited_units).

    Double-crediting is prevented by a high-water mark, not by a list of hashes. A
    list has to be capped or it grows without bound, and a capped list silently
    forgets — which is how the same transfer gets paid twice. Instead:

        credited_through   the highest block fully credited
        credited_at_edge   hashes credited *in* that block

    Anything below the mark is known-credited; anything in the mark's own block is
    checked against the edge set, which only ever holds one block's worth. The test
    for this rewinds the cursor and re-scans, and must credit nothing.
    """
    ready, why = configured()
    if not ready:
        raise ChainError(why)

    head = head_block()
    start = deposit.get("cursor", deposit["from_block"])
    stop = min(head, start + MAX_SCAN)
    if stop < start:
        return deposit, 0

    # One scan per call, reused for both crediting and the pending report.
    transfers = incoming(deposit["address"], start, stop)
    mark = deposit.get("credited_through", -1)
    edge = set(deposit.get("credited_at_edge", []))

    credited, pending = 0, []
    for entry in transfers:
        block = entry["block"]
        if block < mark or (block == mark and entry["tx"] in edge):
            continue                      # already paid
        if head - block + 1 < CONFIRMATIONS:
            pending.append(entry)
            continue                      # not buried yet; next pass will take it
        entry["confirmations"] = head - block + 1
        if EXPLORER:
            entry["explorer_url"] = f"{EXPLORER}/tx/{entry['tx']}"
        deposit.setdefault("seen", []).append(entry)
        deposit["received_units"] = deposit.get("received_units", 0) + entry["units"]
        credited += entry["units"]
        if block > mark:
            mark, edge = block, {entry["tx"]}
        else:
            edge.add(entry["tx"])

    deposit["credited_through"] = mark
    deposit["credited_at_edge"] = sorted(edge)
    deposit["seen"] = deposit.get("seen", [])[-SEEN_LIMIT:]

    # Hold back the confirmation depth so a shallow transfer is re-seen, and never
    # let the cursor run past the head.
    deposit["cursor"] = max(start, min(stop - CONFIRMATIONS + 1, head))

    if deposit.get("received_units", 0) > 0:
        deposit["status"] = "credited"
    elif pending:
        deposit["status"] = "pending"
        deposit["pending_units"] = sum(e["units"] for e in pending)
        deposit["confirmations_seen"] = head - pending[-1]["block"] + 1
    elif deposit["expires"] < time.time():
        deposit["status"] = "expired"
    else:
        deposit["status"] = "waiting"
    deposit["received_usd"] = usd(deposit.get("received_units", 0))
    deposit["head"] = head
    return deposit, credited
