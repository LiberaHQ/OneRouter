// Settles charged balances to the operator's treasury address on Arc. Deliberately
// separate from the completion request path: charge() only ever touches the internal
// ledger (owed_treasury, alongside spent_usd), and a sweep — triggered opportunistically
// once an account crosses SWEEP_THRESHOLD_USD, or on demand via the admin route — is
// what actually moves funds on-chain, in one real transaction per account rather than
// one per request. A live on-chain transfer on every request would tie completion
// latency to block time and spend real gas per call for what can just as safely settle
// in batches.
import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as arc from "./arc";
import { STORE, type Account } from "./store";

// Read live rather than frozen at import time, same as arc.ts's configured() — so
// tests (and any future runtime env change) can flip these without a process restart.
function treasuryAddress(): `0x${string}` | "" {
  return (process.env.ONEROUTER_ARC_TREASURY || "") as `0x${string}` | "";
}

export function sweepThresholdUsd(): number {
  return Number(process.env.ONEROUTER_ARC_SWEEP_THRESHOLD_USD || "2");
}

export function configured(): [boolean, string] {
  if (!treasuryAddress()) return [false, "ONEROUTER_ARC_TREASURY is not set"];
  const [arcReady, why] = arc.configured();
  if (!arcReady) return [false, why];
  return [true, ""];
}

function arcChain(): Chain {
  return {
    id: arc.CHAIN_ID,
    name: arc.NETWORK,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: arc.NATIVE_DECIMALS },
    rpcUrls: { default: { http: [arc.RPC] } },
  };
}

// Test seam, matching arc.ts's `chain` object — a stubbed client in tests, viem's real
// public/wallet clients against the real Arc RPC otherwise.
export const clients = {
  balanceOf: async (address: `0x${string}`): Promise<bigint> =>
    createPublicClient({ chain: arcChain(), transport: http(arc.RPC) }).getBalance({ address }),
  gasPrice: async (): Promise<bigint> => createPublicClient({ chain: arcChain(), transport: http(arc.RPC) }).getGasPrice(),
  send: async (privateKey: `0x${string}`, to: `0x${string}`, value: bigint): Promise<`0x${string}`> => {
    const account = privateKeyToAccount(privateKey);
    const wallet = createWalletClient({ account, chain: arcChain(), transport: http(arc.RPC) });
    return wallet.sendTransaction({ to, value });
  },
};

const GAS_LIMIT = 21_000n; // a plain native transfer, no calldata

function toHexPrivateKey(scalar: bigint): `0x${string}` {
  return `0x${scalar.toString(16).padStart(64, "0")}`;
}

export interface SweepResult {
  swept_usd: number;
  tx: string;
}

/** The pure half: given how much is owed and a signer for the address it sits at,
 * sends as much of it as the on-chain balance and gas allow, and reports what actually
 * moved. Touches only the chain, never the store, so it's the same shape whether
 * called for real or against the stubbed `clients` in tests. Returns null if there is
 * nothing to send yet — either owed is 0, or it doesn't clear gas (it stays owed and
 * accumulates toward the next attempt). */
export async function sweep(owedUsd: number, address: `0x${string}`, privateKeyScalar: bigint): Promise<SweepResult | null> {
  if (owedUsd <= 0) return null;

  const scale = 10n ** BigInt(arc.NATIVE_DECIMALS - arc.DECIMALS);
  const owedWei = BigInt(Math.round(owedUsd * 1e6)) * scale;

  const [available, gasPrice] = await Promise.all([clients.balanceOf(address), clients.gasPrice()]);
  const gasCost = gasPrice * GAS_LIMIT;
  const sendable = available > gasCost ? available - gasCost : 0n;
  const sendWei = sendable < owedWei ? sendable : owedWei;
  if (sendWei <= 0n) return null;

  const tx = await clients.send(toHexPrivateKey(privateKeyScalar), treasuryAddress() as `0x${string}`, sendWei);
  return { swept_usd: arc.usd(Number(sendWei / scale)), tx };
}

/** Resolves one account's address and key from the store, sweeps, and records the
 * outcome (clearing exactly what was swept from owed_treasury — see
 * Store.recordSweep). The store-touching half; sweep() above does the actual work. */
async function sweepAccount(acct: Account, seed: Buffer): Promise<(SweepResult & { account: string }) | null> {
  const wallet = await import("./wallet");
  const address = (await STORE.arcAddress(acct)) as `0x${string}`;
  const scalar = wallet.privateKey(seed, acct.id);
  const result = await sweep(acct.owed_treasury ?? 0, address, scalar);
  if (!result) return null;
  await STORE.recordSweep(acct, result.swept_usd, result.tx);
  return { ...result, account: acct.id };
}

/** The batch job: every account owing at least `minUsd`, swept one at a time so one
 * failure (a stuck RPC, a still-too-small balance) doesn't stop the rest. */
export async function sweepDue(minUsd = sweepThresholdUsd()): Promise<(SweepResult & { account: string })[]> {
  const [ready, why] = configured();
  if (!ready) throw new arc.ChainError(why);

  const seed = await STORE.arcSeed();
  const due = STORE.accountsOwingTreasury(minUsd);
  const results: (SweepResult & { account: string })[] = [];
  for (const acct of due) {
    try {
      const result = await sweepAccount(acct, seed);
      if (result) results.push(result);
    } catch {
      // this account's turn failed — its owed_treasury is untouched, so the next
      // sweep (or the next threshold crossing) retries it from scratch
    }
  }
  return results;
}

/** Fire-and-forget: called right after a charge crosses the threshold. Errors are
 * swallowed here on purpose — a failed sweep leaves owed_treasury untouched, so
 * sweepDue() (or the next threshold crossing) retries it; a completion response must
 * never wait on, or fail because of, on-chain settlement. */
export function sweepSoon(acct: Account): void {
  const [ready] = configured();
  if (!ready) return;
  if ((acct.owed_treasury ?? 0) < sweepThresholdUsd()) return;
  STORE.arcSeed()
    .then((seed) => sweepAccount(acct, seed))
    .catch(() => {});
}
