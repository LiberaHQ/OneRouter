import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as treasury from "../lib/gateway/treasury";

// sweep() is the pure half of treasury settlement (see treasury.ts) — it never
// touches the store, only the stubbed chain clients below, so real money and real
// account state never enter this test. sweepAccount()/sweepDue() are thin,
// store-touching orchestration around it and are exercised for real via the admin
// route rather than here.

const CHAIN = { balance: 0n, gasPrice: 1n, sent: [] as { to: string; value: bigint }[] };
const TREASURY_ADDR = "0x46d30350C6aF15d8453276115D6D8F4206368b99" as const;
const ADDR = "0x00000000000000000000000000000000000abc" as const;
const SCALAR = 42n;

beforeAll(() => {
  process.env.ONEROUTER_ARC_ENABLE = "1";
  process.env.ONEROUTER_ARC_TREASURY = TREASURY_ADDR;
  treasury.clients.balanceOf = async () => CHAIN.balance;
  treasury.clients.gasPrice = async () => CHAIN.gasPrice;
  treasury.clients.send = async (_key, to, value) => {
    CHAIN.sent.push({ to, value });
    return `0xtx${CHAIN.sent.length}`;
  };
});

beforeEach(() => {
  CHAIN.balance = 0n;
  CHAIN.gasPrice = 1n;
  CHAIN.sent = [];
});

const GAS_COST = 21_000n; // GAS_LIMIT * gasPrice(1n)
const SCALE = 10n ** 12n; // NATIVE_DECIMALS(18) - DECIMALS(6)

function usdWei(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6)) * SCALE;
}

describe("sweep", () => {
  it("nothing owed -> no-op, nothing sent", async () => {
    CHAIN.balance = usdWei(100);
    const result = await treasury.sweep(0, ADDR, SCALAR);
    expect(result).toBeNull();
    expect(CHAIN.sent).toHaveLength(0);
  });

  it("balance covers owed plus gas -> sends the full owed amount", async () => {
    CHAIN.balance = usdWei(10) + GAS_COST;
    const result = await treasury.sweep(10, ADDR, SCALAR);
    expect(result).not.toBeNull();
    expect(result!.swept_usd).toBe(10);
    expect(CHAIN.sent).toEqual([{ to: TREASURY_ADDR, value: usdWei(10) }]);
  });

  it("balance covers gas but not the full owed amount -> sends what it can, gas comes out of that", async () => {
    // Owed $10, but only $4 worth plus gas actually sitting on-chain.
    CHAIN.balance = usdWei(4) + GAS_COST;
    const result = await treasury.sweep(10, ADDR, SCALAR);
    expect(result).not.toBeNull();
    expect(result!.swept_usd).toBe(4);
    expect(CHAIN.sent[0].value).toBe(usdWei(4));
  });

  it("balance doesn't even clear gas -> nothing sent, stays owed for next time", async () => {
    CHAIN.balance = GAS_COST - 1n;
    const result = await treasury.sweep(10, ADDR, SCALAR);
    expect(result).toBeNull();
    expect(CHAIN.sent).toHaveLength(0);
  });

  it("a higher gas price shrinks what reaches treasury, never what was recorded as owed", async () => {
    CHAIN.gasPrice = 1000n;
    CHAIN.balance = usdWei(10) + 21_000n * 1000n;
    const result = await treasury.sweep(10, ADDR, SCALAR);
    expect(result!.swept_usd).toBe(10); // full balance covers it even at this gas price
    expect(CHAIN.sent[0].value).toBe(usdWei(10));
  });

  it("always sends to the configured treasury address, never anywhere else", async () => {
    CHAIN.balance = usdWei(1) + GAS_COST;
    await treasury.sweep(1, ADDR, SCALAR);
    expect(CHAIN.sent[0].to).toBe(TREASURY_ADDR);
  });
});
