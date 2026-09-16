import { describe, it, expect } from "vitest";
import { countTokens, streamLocal } from "../lib/gateway/engine";
import type { Model } from "../lib/content/data";

const FAKE_MODEL: Model = {
  id: "test/model",
  name: "Test Model",
  author: "test",
  context_length: 128000,
  max_output: 4096,
  pricing: { prompt: "0", completion: "0" },
  per_m: { in: 1, out: 2 },
  upstream_per_m: { in: 1, out: 2 },
  input_modalities: ["text"],
  tags: [],
  hosts: ["test-host"],
};

describe("countTokens", () => {
  it("approximates four chars per token, floor 1", () => {
    expect(countTokens("")).toBe(1);
    expect(countTokens("ab")).toBe(1);
    expect(countTokens("a".repeat(8))).toBe(2);
    expect(countTokens("a".repeat(401))).toBe(100);
  });
});

describe("streamLocal", () => {
  it("labels itself as not model output and echoes routing facts", async () => {
    const pieces: string[] = [];
    for await (const piece of streamLocal(FAKE_MODEL, [{ role: "user", content: "ping" }], 0)) {
      pieces.push(piece);
    }
    const text = pieces.join("");
    expect(text).toContain("[local engine]");
    expect(text).toContain("test/model");
    expect(text).toContain("test-host");
    expect(text).toContain("You said:    ping");
  });

  it("respects a max_tokens budget (4 chars/token heuristic)", async () => {
    const pieces: string[] = [];
    for await (const piece of streamLocal(FAKE_MODEL, [{ role: "user", content: "ping" }], 5)) {
      pieces.push(piece);
    }
    expect(pieces.join("").length).toBeLessThanOrEqual(20);
  });
});
