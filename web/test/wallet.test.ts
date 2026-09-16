import { describe, it, expect } from "vitest";
import { addressFor } from "../lib/gateway/wallet";

describe("addressFor", () => {
  it("matches the Python reference implementation for a fixed seed", () => {
    const seed = Buffer.from("00".repeat(31) + "01", "hex");
    const address = addressFor(seed, "acct_test123");
    expect(address).toBe("0xe1C8BC96eDEb6b2533B32BCae13cA3BE1F729AC0");
  });

  it("is deterministic across calls", () => {
    const seed = Buffer.from("ab".repeat(32), "hex");
    expect(addressFor(seed, "acct_xyz")).toBe(addressFor(seed, "acct_xyz"));
  });

  it("differs per account id", () => {
    const seed = Buffer.from("ab".repeat(32), "hex");
    expect(addressFor(seed, "acct_a")).not.toBe(addressFor(seed, "acct_b"));
  });
});
