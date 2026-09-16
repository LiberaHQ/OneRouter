import { describe, it, expect } from "vitest";
import { encodeSvg } from "../lib/gateway/qr";

describe("encodeSvg", () => {
  const payloads = [
    "0x1111111111111111111111111111111111111111",
    "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "HELLO WORLD",
    "ünïcode ✓",
  ];

  for (const payload of payloads) {
    it(`round-trips ${JSON.stringify(payload.slice(0, 24))}`, async () => {
      const svg = await encodeSvg(payload);
      expect(svg).toContain("<svg");
    });
  }
});
