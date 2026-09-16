import { describe, it, expect } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak256, toChecksum, recoverAddress, personalHash, bytesToHex } from "../lib/gateway/evm";

describe("recoverAddress", () => {
  it("recovers the signer of a personal_sign message", () => {
    const priv = secp256k1.utils.randomSecretKey();
    const pub = secp256k1.getPublicKey(priv, false); // 0x04 || x || y
    const raw = pub.slice(1);
    const address = toChecksum("0x" + bytesToHex(keccak256(raw)).slice(-40));

    const message = "test statement to sign";
    const hash = personalHash(message);

    const sig = secp256k1.sign(hash, priv, { prehash: false, lowS: true }); // 64 bytes, r||s
    // Try both v candidates the way the gateway does — recovery bit is 0 or 1.
    let found: Uint8Array | null = null;
    for (const v of [27, 28]) {
      const candidate = new Uint8Array(65);
      candidate.set(sig, 0);
      candidate[64] = v;
      try {
        const recovered = recoverAddress(hash, candidate);
        if (recovered === address) {
          found = candidate;
          break;
        }
      } catch {
        // wrong recovery bit for this r — expected for one of the two
      }
    }
    expect(found).not.toBeNull();
  });

  it("rejects a malformed signature", () => {
    expect(() => recoverAddress(new Uint8Array(32), new Uint8Array(10))).toThrow();
  });
});
