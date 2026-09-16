// Per-account Arc deposit address, derived from one master seed via HMAC-SHA512.
// Ported from gateway/wallet.py. state.json never holds a private key — only the
// master seed is secret, and every address is deterministically re-derivable from it.
import { createHmac, randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak256, toChecksum, bytesToHex } from "./evm";

const PURPOSE = new TextEncoder().encode("onerouter/arc/deposit/v1:");
// secp256k1 curve order — must match @noble/curves' internal N exactly (it does; both
// derive from the same standard constant).
const N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");

export function seedFromEnv(): Buffer | null {
  const envSeed = process.env.ONEROUTER_ARC_MASTER_SEED || "";
  if (!envSeed) return null;
  const hex = envSeed.startsWith("0x") ? envSeed.slice(2) : envSeed;
  let raw: Buffer;
  try {
    raw = Buffer.from(hex, "hex");
  } catch {
    throw new Error("ONEROUTER_ARC_MASTER_SEED is not hex");
  }
  if (!/^[0-9a-fA-F]+$/.test(hex) || raw.length * 2 !== hex.length) {
    throw new Error("ONEROUTER_ARC_MASTER_SEED is not hex");
  }
  if (raw.length < 32) throw new Error("ONEROUTER_ARC_MASTER_SEED needs at least 32 bytes");
  return raw;
}

export function newSeed(): string {
  return randomBytes(32).toString("hex");
}

/** One account, one scalar. Rejected and re-derived in the vanishing case it falls
 * outside the curve order — matches wallet.py's retry loop exactly, not a mod-N
 * reduction, since reducing would bias the derived key. */
export function privateKey(seed: Buffer, accountId: string): bigint {
  const idBytes = new TextEncoder().encode(accountId);
  for (let round = 0; round < 256; round++) {
    const suffix = round === 0 ? new Uint8Array(0) : new Uint8Array([round]);
    const material = new Uint8Array(PURPOSE.length + idBytes.length + suffix.length);
    material.set(PURPOSE, 0);
    material.set(idBytes, PURPOSE.length);
    material.set(suffix, PURPOSE.length + idBytes.length);
    const digest = createHmac("sha512", seed).update(material).digest();
    const candidate = BigInt("0x" + digest.subarray(0, 32).toString("hex"));
    if (candidate > 0n && candidate < N) return candidate;
  }
  throw new Error("could not derive a key in range"); // unreachable in practice
}

function bigIntTo32Bytes(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The checksummed Arc address that account's deposits go to. */
export function addressFor(seed: Buffer, accountId: string): string {
  const scalar = privateKey(seed, accountId);
  const pub = secp256k1.getPublicKey(bigIntTo32Bytes(scalar), false); // 0x04 || x || y
  const raw = pub.slice(1);
  return toChecksum("0x" + bytesToHex(keccak256(raw)).slice(-40));
}
