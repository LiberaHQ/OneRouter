import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import * as arc from "../lib/gateway/arc";
import type { Deposit, Transfer } from "../lib/gateway/arc";

// Deterministic test of the deposit-crediting rule, ported from
// gateway/test_deposits.py. Money logic, so it's tested against a stubbed chain rather
// than the live one — a real chain advances between calls, which makes it impossible
// to tell a genuine new transfer from the same one paid twice. The case that matters
// is the last pair: 900 transfers credited in full, then re-scanned crediting nothing.
// An earlier version guarded with a capped list of hashes and failed exactly there.

const CHAIN = { head: 1000, logs: [] as Transfer[] };

beforeAll(() => {
  process.env.ONEROUTER_ARC_ENABLE = "1";
  arc.chain.headBlock = async () => CHAIN.head;
  arc.chain.incoming = async (_address: string, first: number, last: number) =>
    CHAIN.logs.filter((e) => e.block >= first && e.block <= last);
  // The native-balance path (below, in its own describe block) is exercised
  // separately — hold it at zero here so every assertion in this block stays about
  // the log-based path exactly as it was before that path existed.
  arc.chain.balanceAt = async () => 0n;
});

function deposit(first: number): Deposit {
  const now = Math.floor(Date.now() / 1000);
  return {
    reference: "d",
    account: "a",
    address: "0xabc",
    chain_id: arc.CHAIN_ID,
    network: arc.NETWORK,
    asset: "USDC",
    token: "0x0",
    decimals: arc.DECIMALS,
    suggested_usd: 20,
    from_block: first,
    cursor: first,
    confirmations: arc.CONFIRMATIONS,
    received_units: 0,
    seen: [],
    created: now,
    expires: now + 3600,
    status: "waiting",
    mainnet: false,
  };
}

function tx(block: number, units: number, name: string): Transfer {
  return { tx: name, block, from: "0xpayer", units };
}

describe("deposit crediting", () => {
  it("no transfers -> waiting, nothing credited", async () => {
    CHAIN.logs = [];
    const [d, credited] = await arc.check(deposit(990));
    expect(d.status).toBe("waiting");
    expect(credited).toBe(0);
  });

  it("buried transfer credits exactly once", async () => {
    CHAIN.logs = [tx(995, arc.units(20), "0xaa")];
    const [d, credited] = await arc.check(deposit(990));
    expect(credited).toBe(arc.units(20));
    expect(d.status).toBe("credited");

    d.cursor = 990;
    const [, again] = await arc.check(d);
    expect(again).toBe(0);

    d.cursor = 0;
    const [d2, again2] = await arc.check(d);
    expect(again2).toBe(0);
    expect(d2.received_usd).toBe(20.0);
  });

  it("a shallow transfer waits, then credits once buried", async () => {
    CHAIN.head = 1000;
    CHAIN.logs = [tx(1000, arc.units(5), "0xbb")]; // depth 1, needs 2
    let [d, credited] = await arc.check(deposit(995));
    expect(credited).toBe(0);
    expect(d.status).toBe("pending");

    CHAIN.head = 1001; // now depth 2
    [d, credited] = await arc.check(d);
    expect(credited).toBe(arc.units(5));

    const [, again] = await arc.check(d);
    expect(again).toBe(0);
  });

  it("several transfers in one block all credit, and a late one in the same block still credits", async () => {
    CHAIN.head = 1010;
    CHAIN.logs = [tx(1005, arc.units(1), "0xc1"), tx(1005, arc.units(2), "0xc2"), tx(1005, arc.units(3), "0xc3")];
    let [d, credited] = await arc.check(deposit(1000));
    expect(credited).toBe(arc.units(6));

    d.cursor = 1000;
    let again;
    [d, again] = await arc.check(d);
    expect(again).toBe(0);

    CHAIN.logs.push(tx(1005, arc.units(4), "0xc4")); // arrives late, same block
    d.cursor = 1000;
    const [, late] = await arc.check(d);
    expect(late).toBe(arc.units(4));
  });

  it("900 transfers credit in full and never double-credit, state stays bounded", async () => {
    CHAIN.head = 3000;
    CHAIN.logs = Array.from({ length: 900 }, (_, i) => tx(2000 + i, arc.units(1), `0x${i.toString(16).padStart(4, "0")}`));
    let [d, credited] = await arc.check(deposit(1900));
    expect(credited).toBe(arc.units(900));

    d.cursor = 1900;
    const [d2, again] = await arc.check(d);
    expect(again).toBe(0);
    expect(d2.seen!.length).toBeLessThanOrEqual(arc.SEEN_LIMIT);
    expect(d2.credited_at_edge!.length).toBeLessThanOrEqual(8);
    expect(d2.cursor).toBeLessThanOrEqual(CHAIN.head);
  });
});

// USDC is Arc's native asset: an ordinary wallet send moves native balance directly
// and never emits the ERC-20 Transfer log the suite above scans for. This is that
// second path — an address's own balance, since a deposit address only ever receives.
describe("native-balance deposit crediting", () => {
  const NATIVE_SCALE = 10n ** BigInt(arc.NATIVE_DECIMALS - arc.DECIMALS);
  let native: { block: number; wei: bigint }[] = [];

  function nativeUnits(usd: number): bigint {
    return BigInt(arc.units(usd)) * NATIVE_SCALE;
  }

  beforeEach(() => {
    native = [];
    arc.chain.balanceAt = async (_address: string, blockTag: string) => {
      const target = blockTag === "latest" ? CHAIN.head : parseInt(blockTag, 16);
      return native.filter((d) => d.block <= target).reduce((sum, d) => sum + d.wei, 0n);
    };
  });

  afterEach(() => {
    arc.chain.balanceAt = async () => 0n;
  });

  it("a buried native transfer credits exactly once", async () => {
    CHAIN.head = 2000;
    CHAIN.logs = [];
    native = [{ block: 1995, wei: nativeUnits(1) }];
    const [d, credited] = await arc.check(deposit(1990));
    expect(credited).toBe(arc.units(1));
    expect(d.status).toBe("credited");

    const [, again] = await arc.check(d);
    expect(again).toBe(0);
  });

  it("a native transfer at the head is pending until buried", async () => {
    CHAIN.head = 2000;
    CHAIN.logs = [];
    native = [{ block: 2000, wei: nativeUnits(1) }]; // depth 1, needs CONFIRMATIONS (2)
    let [d, credited] = await arc.check(deposit(1995));
    expect(credited).toBe(0);
    expect(d.status).toBe("pending");

    CHAIN.head = 2001; // now depth 2
    [d, credited] = await arc.check(d);
    expect(credited).toBe(arc.units(1));
    expect(d.status).toBe("credited");
  });

  it("sums with a log-based transfer in the same poll, without double-counting", async () => {
    CHAIN.head = 2000;
    CHAIN.logs = [tx(1995, arc.units(5), "0xnat1")];
    native = [{ block: 1990, wei: nativeUnits(2) }];
    const [d, credited] = await arc.check(deposit(1985));
    expect(credited).toBe(arc.units(7));
    expect(d.received_usd).toBe(7);

    const [, again] = await arc.check(d);
    expect(again).toBe(0);
  });
});
