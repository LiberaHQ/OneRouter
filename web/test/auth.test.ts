import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { b58decode, verifyWallet, walletStatement, b64url, AuthError } from "../lib/gateway/auth";

function b58encode(data: Uint8Array): string {
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt("0x" + Buffer.from(data).toString("hex"));
  let out = "";
  while (n > 0n) {
    const r = n % 58n;
    n = n / 58n;
    out = B58[Number(r)] + out;
  }
  let pad = 0;
  for (const b of data) {
    if (b !== 0) break;
    pad++;
  }
  return "1".repeat(pad) + out;
}

describe("walletStatement", () => {
  it("matches the exact template", () => {
    const s = walletStatement("nonce-123", "onerouter.dev");
    expect(s).toBe(
      "onerouter.dev wants you to sign in with your Arc account.\n\n" +
        "This proves you hold the key. It authorises nothing else: no transaction, " +
        "no transfer, no spend.\n\nNonce: nonce-123"
    );
  });
});

describe("Solana wallet verification", () => {
  const priv = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(priv);
  const address = b58encode(pub);
  const message = walletStatement("nonce-123", "onerouter.dev", "solana");
  const sig = ed25519.sign(new TextEncoder().encode(message), priv);
  const sigB64 = b64url(sig);

  it("round-trips a real signature", () => {
    expect(b58decode(address)).toEqual(pub);
    expect(verifyWallet(address, message, sigB64)).toBe(address);
  });

  it("rejects a signature over a different message", () => {
    expect(() => verifyWallet(address, message + "!", sigB64)).toThrow(AuthError);
  });

  it("rejects a signature from another wallet", () => {
    const other = ed25519.utils.randomSecretKey();
    const otherSig = b64url(ed25519.sign(new TextEncoder().encode(message), other));
    expect(() => verifyWallet(address, message, otherSig)).toThrow(AuthError);
  });
});
