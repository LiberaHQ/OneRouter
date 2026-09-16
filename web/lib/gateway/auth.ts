// Verification for the sign-in methods the front door offers. Ported from
// gateway/auth.py. Wallet sign-in uses @noble/curves/ed25519 (audited) in place of
// the Python cryptography package; there is no "unavailable without an optional
// dependency" state here since the npm package is a normal, always-present dependency.
import { randomInt } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { recoverAddress, personalHash } from "./evm";

export const ORIGINS = (process.env.ONEROUTER_ORIGINS || "http://localhost:4321,http://127.0.0.1:4321")
  .split(",")
  .filter(Boolean);

const SMTP_HOST = process.env.ONEROUTER_SMTP_HOST || "";
// With no mail sender wired up the code cannot be delivered. Echoing it back makes the
// flow testable locally and must never be on where real accounts exist.
export const EMAIL_ECHO = (process.env.ONEROUTER_EMAIL_ECHO ?? (SMTP_HOST ? "0" : "1")) === "1";

export function available() {
  return {
    email: { ready: true, note: EMAIL_ECHO ? "code shown by the server" : "code sent by email" },
    password: { ready: true, note: "email and password" },
    wallet: { ready: true, note: "" },
  };
}

// ── Encoding helpers ─────────────────────────────────────────────────────────
export function b64url(raw: Uint8Array): string {
  return Buffer.from(raw).toString("base64url");
}

export function unb64url(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Solana addresses are base58 of a 32-byte ed25519 public key. */
export function b58decode(text: string): Uint8Array {
  let number = 0n;
  for (const char of text) {
    const index = B58.indexOf(char);
    if (index < 0) throw new AuthError(`${char} is not base58`);
    number = number * 58n + BigInt(index);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = hex === "0" ? new Uint8Array(0) : Buffer.from(hex, "hex");
  let padCount = 0;
  for (const ch of text) {
    if (ch !== "1") break;
    padCount++;
  }
  const out = new Uint8Array(padCount + body.length);
  out.set(body, padCount);
  return out;
}

export class AuthError extends Error {}

// ── Wallet statement ─────────────────────────────────────────────────────────
export function walletStatement(nonce: string, domain: string, chain: "arc" | "solana" | string = "arc"): string {
  const label = chain === "arc" ? "Arc" : chain === "solana" ? "Solana" : chain;
  return (
    `${domain} wants you to sign in with your ${label} account.\n\n` +
    `This proves you hold the key. It authorises nothing else: no transaction, ` +
    `no transfer, no spend.\n\nNonce: ${nonce}`
  );
}

/** Recovers the signer of an EIP-191 personal_sign and checks it is who they claim. */
export function verifyEvmWallet(address: string, message: string, signatureHex: string): string {
  let signature: Uint8Array;
  try {
    const hex = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) throw new Error();
    signature = new Uint8Array(Buffer.from(hex, "hex"));
  } catch {
    throw new AuthError("signature is not hex");
  }
  let recovered: string;
  try {
    recovered = recoverAddress(personalHash(message), signature);
  } catch (err) {
    throw new AuthError(`could not recover a signer: ${(err as Error).message}`);
  }
  if (recovered.toLowerCase() !== address.toLowerCase().trim()) {
    throw new AuthError("the signature was produced by a different address");
  }
  return recovered;
}

/** Checks an ed25519 signature against the key the address encodes. */
export function verifyWallet(address: string, message: string, signatureB64: string): string {
  let raw: Uint8Array;
  try {
    raw = b58decode(address);
  } catch {
    throw new AuthError("that is not a base58 address");
  }
  if (raw.length !== 32) throw new AuthError("a Solana address decodes to 32 bytes");
  let ok: boolean;
  try {
    ok = ed25519.verify(unb64url(signatureB64), new TextEncoder().encode(message), raw);
  } catch {
    throw new AuthError("the wallet signature did not verify");
  }
  if (!ok) throw new AuthError("the wallet signature did not verify");
  return address;
}

// ── Email codes ───────────────────────────────────────────────────────────────
export function newCode(): string {
  // crypto.randomInt is unbiased (rejection sampling), matching secrets.randbelow.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function sendCode(address: string, code: string): Promise<void> {
  if (EMAIL_ECHO) {
    console.log(`  [email] code for ${address}: ${code}`);
    return;
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.ONEROUTER_SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: process.env.ONEROUTER_SMTP_USER
      ? { user: process.env.ONEROUTER_SMTP_USER, pass: process.env.ONEROUTER_SMTP_PASSWORD || "" }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.ONEROUTER_SMTP_FROM || "no-reply@onerouter.dev",
    to: address,
    subject: `Your sign-in code: ${code}`,
    text: `Your sign-in code is ${code}. It expires in 10 minutes.`,
  });
}
