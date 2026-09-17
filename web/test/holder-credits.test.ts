import { describe, expect, it } from "vitest";
import { entitlementFor } from "../lib/gateway/holderCredits";

const UNIT = 10n ** 18n;

describe("ONE holder credit tiers", () => {
  it.each([
    [999n, 0],
    [1_000n, 0.5],
    [9_999n, 0.5],
    [10_000n, 2],
    [100_000n, 5],
    [1_000_000n, 15],
    [10_000_000n, 40],
    [999_000_000n, 40],
  ])("maps %s whole tokens to $%s", (tokens, credit) => {
    expect(entitlementFor(tokens * UNIT, 18).creditUsd).toBe(credit);
  });

  it("does not round a fractional balance into the next tier", () => {
    expect(entitlementFor(10_000n * UNIT - 1n, 18).creditUsd).toBe(0.5);
  });
});
