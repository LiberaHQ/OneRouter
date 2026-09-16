"""Deterministic test of balance-based deposit crediting.

    python3 gateway/test_credit_balance.py

Crediting reads `eth_getBalance` rather than scanning `Transfer` logs. That was not the
first design: logs carry a tx hash and a block, which looked tidier. But on Arc a real
1 USDC deposit landed in the balance with no matching log anywhere in 120k blocks, so a
log-based watcher could never have credited it. These cases pin the replacement.

The two scales are the other trap: a native balance is 18 decimals, the token
interface reports 6. Confusing them is a 10^12 error in someone's favour or against.
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

CHAIN = {"balance": 0}
arc.balance_of = lambda address: CHAIN["balance"]
arc.head_block = lambda: 1000

def deposit():
    return {"reference": "d", "account": "a", "address": "0xabc",
            "from_block": 900, "cursor": 900, "confirmations": arc.CONFIRMATIONS,
            "created": int(time.time()), "expires": int(time.time()) + 3600,
            "status": "waiting"}

# ── scales ─────────────────────────────────────────────────────────────────
check("native 18dp: 1 USDC", arc.native_usd(10**18) == 1.0, arc.native_usd(10**18))
check("token 6dp: 1 USDC", arc.usd(10**6) == 1.0, arc.usd(10**6))
check("the two scales differ by 1e12",
      arc.native_units(1.0) == arc.units(1.0) * 10**12,
      (arc.native_units(1.0), arc.units(1.0)))

# ── nothing sent ───────────────────────────────────────────────────────────
d = deposit()
d, owed = arc.check(d)
check("empty address -> waiting, nothing owed", owed == 0 and d["status"] == "waiting")

# ── a deposit arrives ──────────────────────────────────────────────────────
CHAIN["balance"] = arc.native_units(1.0)
d, owed = arc.check(d)
check("1 USDC arriving credits 1 USDC", owed == arc.native_units(1.0), arc.native_usd(owed))
check("status becomes credited", d["status"] == "credited")
check("received_usd reads 1.0", d["received_usd"] == 1.0, d["received_usd"])

# ── the crucial property: running again pays nothing ───────────────────────
for n in (2, 3):
    d, again = arc.check(d)
    check(f"pass {n} on an unchanged balance credits nothing", again == 0, arc.native_usd(again))

# ── a second deposit to the same address ───────────────────────────────────
CHAIN["balance"] = arc.native_units(3.5)
d, owed = arc.check(d)
check("a further 2.5 credits only the difference",
      abs(arc.native_usd(owed) - 2.5) < 1e-9, arc.native_usd(owed))
check("total received is 3.5", abs(d["received_usd"] - 3.5) < 1e-9, d["received_usd"])
d, again = arc.check(d)
check("and not again", again == 0, arc.native_usd(again))

# ── a balance that goes down must never produce a negative credit ──────────
CHAIN["balance"] = arc.native_units(1.0)
d, owed = arc.check(d)
check("a swept address credits nothing negative", owed == 0, owed)

# ── dust ───────────────────────────────────────────────────────────────────
fresh = deposit()
CHAIN["balance"] = 1            # one wei-scale unit
fresh, owed = arc.check(fresh)
check("sub-cent dust still credits exactly what arrived", owed == 1, owed)

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
