import { describe, it, expect } from "vitest";
import { keccak256, TRANSFER_TOPIC, toChecksum, bytesToHex } from "../lib/gateway/evm";

describe("keccak256", () => {
  it("matches published vectors", () => {
    expect(bytesToHex(keccak256(new TextEncoder().encode("")))).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    );
    expect(bytesToHex(keccak256(new TextEncoder().encode("abc")))).toBe(
      "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
    );
  });

  it("ERC-20 Transfer topic matches", () => {
    expect(TRANSFER_TOPIC).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  });
});

describe("toChecksum", () => {
  it("EIP-55 checksum matches vector", () => {
    expect(toChecksum("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
    );
  });
});
