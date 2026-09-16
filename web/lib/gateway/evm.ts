// EVM primitives Arc needs: Keccak-256 (via @noble/hashes — NOT sha3_256, same
// permutation but different padding), address derivation, EIP-191 signature recovery
// (via @noble/curves/secp256k1). Ported from gateway/evm.py, using audited libraries
// in place of the original's from-scratch field/point arithmetic.
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";

export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/** The address that produced this signature, from (r, s, v). */
export function recoverAddress(messageHash: Uint8Array, signature: Uint8Array): string {
  if (signature.length !== 65) throw new Error("an EVM signature is 65 bytes");
  const r = BigInt("0x" + bytesToHex(signature.slice(0, 32)));
  const s = BigInt("0x" + bytesToHex(signature.slice(32, 64)));
  let v = signature[64];
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("signature values are out of range");

  const sig = new secp256k1.Signature(r, s, v);
  const point = sig.recoverPublicKey(messageHash);
  const uncompressed = point.toBytes(false); // 0x04 || x(32) || y(32)
  const raw = uncompressed.slice(1);
  return toChecksum("0x" + bytesToHex(keccak256(raw).slice(-20)));
}

/** EIP-55 mixed-case checksum. */
export function toChecksum(address: string): string {
  const body = address.toLowerCase().replace("0x", "");
  const digest = bytesToHex(keccak256(new TextEncoder().encode(body)));
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    out += /[a-f]/.test(ch) && parseInt(digest[i], 16) >= 8 ? ch.toUpperCase() : ch;
  }
  return "0x" + out;
}

/** EIP-191: what a wallet actually signs for personal_sign. */
export function personalHash(message: string): Uint8Array {
  const raw = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${raw.length}`);
  const combined = new Uint8Array(prefix.length + raw.length);
  combined.set(prefix, 0);
  combined.set(raw, prefix.length);
  return keccak256(combined);
}

export const TRANSFER_TOPIC = "0x" + bytesToHex(keccak256(new TextEncoder().encode("Transfer(address,address,uint256)")));

export { bytesToHex };
