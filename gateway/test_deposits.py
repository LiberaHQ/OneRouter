"""Deterministic test of the deposit crediting rule.

    python3 gateway/test_deposits.py

Money logic, so it is tested against a stubbed chain rather than the live one: a real
chain advances between calls, which makes it impossible to tell a genuine new transfer
from the same one paid twice. The case that matters is the last pair — 900 transfers
credited in full, then re-scanned crediting nothing. An earlier version guarded with a
capped list of hashes and failed exactly there, paying the forgotten ones again.
"""
import os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["ONEROUTER_ARC_ENABLE"] = "1"
from gateway import arc

ok = fail = 0
def check(name, cond, detail=""):
    global ok, fail
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'' if cond else '  ' + str(detail)}")
    ok += bool(cond); fail += not cond

CHAIN = {"head": 1000, "logs": []}
arc.head_block = lambda: CHAIN["head"]
arc.incoming = lambda address, first, last: [
    e for e in CHAIN["logs"] if first <= e["block"] <= last]

def deposit(first):
    return {"reference": "d", "account": "a", "address": "0xabc",
            "from_block": first, "cursor": first, "confirmations": arc.CONFIRMATIONS,
            "received_units": 0, "seen": [],
            "created": int(time.time()), "expires": int(time.time()) + 3600,
            "status": "waiting"}

def tx(block, units, name):
    return {"tx": name, "block": block, "from": "0xpayer", "units": units}

# ── nothing sent ───────────────────────────────────────────────────────────
d = deposit(990)
d, credited = arc.check(d)
check("no transfers -> waiting, nothing credited", d["status"] == "waiting" and credited == 0)

# ── one buried transfer ────────────────────────────────────────────────────
CHAIN["logs"] = [tx(995, arc.units(20), "0xaa")]
d = deposit(990)
d, credited = arc.check(d)
check("buried transfer credits exactly once",
      credited == arc.units(20) and d["status"] == "credited", credited)

# ── re-scanning the same range credits nothing ─────────────────────────────
d["cursor"] = 990
d, again = arc.check(d)
check("re-scan credits nothing", again == 0, again)

# ── a rewound cursor still credits nothing ─────────────────────────────────
d["cursor"] = 0
d, again = arc.check(d)
check("rewound cursor credits nothing", again == 0, again)
check("total stays at 20.00", d["received_usd"] == 20.0, d["received_usd"])

# ── a shallow transfer waits, then credits once buried ─────────────────────
CHAIN["head"] = 1000
CHAIN["logs"] = [tx(1000, arc.units(5), "0xbb")]     # depth 1, needs 2
d = deposit(995)
d, credited = arc.check(d)
check("unburied transfer is pending, not credited",
      credited == 0 and d["status"] == "pending", (credited, d["status"]))
CHAIN["head"] = 1001                                  # now depth 2
d, credited = arc.check(d)
check("credits once it is buried", credited == arc.units(5), credited)
d, again = arc.check(d)
check("and not a second time", again == 0, again)

# ── several transfers in one block ─────────────────────────────────────────
CHAIN["head"] = 1010
CHAIN["logs"] = [tx(1005, arc.units(1), "0xc1"),
                 tx(1005, arc.units(2), "0xc2"),
                 tx(1005, arc.units(3), "0xc3")]
d = deposit(1000)
d, credited = arc.check(d)
check("three transfers in one block all credit", credited == arc.units(6), credited)
d["cursor"] = 1000
d, again = arc.check(d)
check("same-block transfers do not re-credit", again == 0, again)

# ── a later transfer in the mark's own block ───────────────────────────────
CHAIN["logs"].append(tx(1005, arc.units(4), "0xc4"))  # arrives late, same block
d["cursor"] = 1000
d, late = arc.check(d)
check("a new transfer in the mark's block still credits", late == arc.units(4), late)

# ── many transfers: the guard must not forget ──────────────────────────────
CHAIN["head"] = 3000
CHAIN["logs"] = [tx(2000 + i, arc.units(1), f"0x{i:04x}") for i in range(900)]
d = deposit(1900)
d, credited = arc.check(d)
check("900 transfers credit in full", credited == arc.units(900), arc.usd(credited))
d["cursor"] = 1900
d, again = arc.check(d)
check("900 transfers do not re-credit (no lossy cap)", again == 0, arc.usd(again))
check("state stays bounded",
      len(d["seen"]) <= arc.SEEN_LIMIT and len(d["credited_at_edge"]) <= 8,
      (len(d["seen"]), len(d["credited_at_edge"])))

# ── the cursor never passes the head ───────────────────────────────────────
check("cursor stays at or below head", d["cursor"] <= CHAIN["head"], d["cursor"])

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
