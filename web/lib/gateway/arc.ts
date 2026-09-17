// USDC deposits on Arc. Ported from gateway/arc.py — see that file's docstring for the
// decimals trap (18-dp EVM native units vs 6-dp USDC precompile units; everything here
// stays in the 6-dp precompile units read from Transfer logs).
//
// USDC is Arc's *native* asset (the payment help text says so: "send it as an ordinary
// transfer; no token approval and no contract call is needed"). An ordinary native
// transfer moves balance directly and never emits an ERC-20 Transfer log at all — only
// an actual call into the precompile contract does. So Transfer-log scanning alone
// misses the exact path the product tells people to use. A deposit address is
// single-purpose and receive-only (nothing ever spends from it), so its own native
// balance is a second, simpler ground truth: `nativeCredited` below tracks it
// alongside the log scan, and the two are summed without overlap.
import { randomBytes } from "node:crypto";
import { TRANSFER_TOPIC, toChecksum } from "./evm";

export const RPC = process.env.ONEROUTER_ARC_RPC || "https://rpc.mainnet.arc.io";
export const CHAIN_ID = Number(process.env.ONEROUTER_ARC_CHAIN_ID || "5042");
export const USDC = process.env.ONEROUTER_ARC_USDC || "0x3600000000000000000000000000000000000000";
export const DECIMALS = Number(process.env.ONEROUTER_ARC_DECIMALS || "6");
export const NATIVE_DECIMALS = Number(process.env.ONEROUTER_ARC_NATIVE_DECIMALS || "18");
export const CONFIRMATIONS = Number(process.env.ONEROUTER_ARC_CONFIRMATIONS || "2");
export const EXPLORER = (process.env.ONEROUTER_ARC_EXPLORER || "https://explorer.arc.io").replace(/\/$/, "");
export const NETWORK = process.env.ONEROUTER_ARC_NETWORK || "Arc";
export const ENABLED = process.env.ONEROUTER_ARC_ENABLE === "1";

export const MIN_USD = 0.5;
const MAX_SCAN = 20_000;
const LOG_WINDOW = 500;
export const SEEN_LIMIT = 25;
const DEPOSIT_TTL = 24 * 3600;
const MAINNET_IDS = new Set([5042]);

export class ChainError extends Error {}

export function configured(): [boolean, string] {
  // Read live rather than the frozen ENABLED constant, so tests (and any future
  // runtime env change) can flip this without a process restart.
  if (process.env.ONEROUTER_ARC_ENABLE !== "1") {
    return [false, "deposits are off — set ONEROUTER_ARC_ENABLE=1 to accept real USDC on this chain"];
  }
  if (!RPC) return [false, "ONEROUTER_ARC_RPC is not set"];
  if (!USDC) return [false, "ONEROUTER_ARC_USDC is not set"];
  return [true, ""];
}

export function isMainnet(): boolean {
  return MAINNET_IDS.has(CHAIN_ID);
}

export interface ArcDescribe {
  ready: boolean;
  reason: string;
  network: string;
  asset: "USDC";
  mode: string;
  chain_id: number;
  token: string | null;
  decimals: number;
  confirmations: number;
  minimum_usd: number;
  explorer: string | null;
  mainnet: boolean;
  rpc: string;
}

export function describe(): ArcDescribe {
  const [ready, reason] = configured();
  return {
    ready,
    reason,
    network: NETWORK,
    asset: "USDC",
    mode: "native+precompile",
    chain_id: CHAIN_ID,
    token: USDC ? toChecksum(USDC) : null,
    decimals: DECIMALS,
    confirmations: CONFIRMATIONS,
    minimum_usd: MIN_USD,
    explorer: EXPLORER || null,
    mainnet: isMainnet(),
    rpc: RPC,
  };
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  if (!RPC) throw new ChainError("no Arc RPC is configured");
  let res: Response;
  try {
    res = await fetch(RPC, {
      method: "POST",
      // The endpoint rejects the default fetch agent with 403, so name ourselves.
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "onerouter-gateway/1.0",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    throw new ChainError(`Arc RPC unreachable: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ChainError(`Arc RPC answered ${res.status}`);
  let body: { error?: { message?: string } | string; result?: unknown };
  try {
    body = await res.json();
  } catch (err) {
    throw new ChainError(`Arc RPC unreachable: ${(err as Error).message}`);
  }
  if (body.error) {
    const msg = typeof body.error === "string" ? body.error : body.error.message ?? JSON.stringify(body.error);
    throw new ChainError(`Arc RPC error: ${msg}`);
  }
  return body.result;
}

export function units(usd: number): number {
  return Math.round(usd * 10 ** DECIMALS);
}

export function usd(raw: number): number {
  return raw / 10 ** DECIMALS;
}

async function headBlockImpl(): Promise<number> {
  const result = (await rpc("eth_blockNumber", [])) as string;
  return parseInt(result, 16);
}

async function balanceAtImpl(address: string, blockTag: string): Promise<bigint> {
  const result = (await rpc("eth_getBalance", [address, blockTag])) as string;
  return BigInt(result);
}

function topic(address: string): string {
  return "0x" + address.toLowerCase().replace("0x", "").padStart(64, "0");
}

interface RawLog {
  transactionHash: string;
  blockNumber: string;
  topics: string[];
  data?: string;
}

async function getLogs(address: string, first: number, last: number): Promise<RawLog[]> {
  const result = await rpc("eth_getLogs", [
    {
      fromBlock: "0x" + Math.max(first, 0).toString(16),
      toBlock: "0x" + last.toString(16),
      address: USDC,
      topics: [TRANSFER_TOPIC, null, topic(address)],
    },
  ]);
  return (result as RawLog[]) || [];
}

export interface Transfer {
  tx: string;
  block: number;
  from: string;
  units: number;
  confirmations?: number;
  explorer_url?: string;
}

/** USDC transfers into `address`, oldest first. The endpoint caps a query by result
 * count, not by range, so the range is walked in chunks and any chunk that trips the
 * cap is quartered until it fits, easing back up once a fetch succeeds. */
async function incomingImpl(address: string, fromBlock: number, toBlock: number): Promise<Transfer[]> {
  const raw: RawLog[] = [];
  let window = LOG_WINDOW;
  let cursor = Math.max(fromBlock, 0);
  while (cursor <= toBlock) {
    const stop = Math.min(cursor + window - 1, toBlock);
    try {
      raw.push(...(await getLogs(address, cursor, stop)));
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("max results") || msg.includes("range")) {
        if (window > 1) {
          window = Math.max(1, Math.floor(window / 4));
          continue; // retry the same cursor with a tighter window
        }
      }
      throw err;
    }
    cursor = stop + 1;
    if (window < LOG_WINDOW) window = Math.min(LOG_WINDOW, window * 2);
  }

  const out: Transfer[] = raw.map((entry) => ({
    tx: entry.transactionHash,
    block: parseInt(entry.blockNumber, 16),
    from: toChecksum("0x" + entry.topics[1].slice(-40)),
    units: parseInt(entry.data || "0x0", 16),
  }));
  out.sort((a, b) => a.block - b.block);
  return out;
}

// Test seam: the real chain calls, held behind a mutable object so tests can stub them
// against a fake chain (mirrors Python's `arc.head_block = lambda: ...` monkeypatching
// in test_deposits.py — bare function bindings can't be swapped like that in ESM).
export const chain = { headBlock: headBlockImpl, incoming: incomingImpl, balanceAt: balanceAtImpl };

export interface Deposit {
  reference: string;
  account: string;
  address: string;
  chain_id: number;
  network: string;
  asset: "USDC";
  token: string;
  decimals: number;
  suggested_usd: number;
  from_block: number;
  cursor: number;
  confirmations: number;
  received_units: number;
  seen: Transfer[];
  created: number;
  expires: number;
  status: "waiting" | "pending" | "credited" | "expired";
  mainnet: boolean;
  credited_through?: number;
  credited_at_edge?: string[];
  pending_units?: number;
  confirmations_seen?: number;
  received_usd?: number;
  head?: number;
  // High-water mark for the native-balance path (see the file header) — an absolute
  // reading, not a delta, so unlike the log path it needs no hash bookkeeping to
  // avoid double-crediting the same funds across polls.
  native_credited?: number;
  native_baseline_set?: boolean;
}

/** A deposit intent. The address is the account's own, so the amount is a suggestion
 * for the UI — any amount sent to it credits. */
export async function openDeposit(accountId: string, address: string, usdWanted: number): Promise<Deposit> {
  const [ready, why] = configured();
  if (!ready) throw new ChainError(why);
  let start = 0;
  let headKnown = false;
  try {
    start = await chain.headBlock();
    headKnown = true;
  } catch {
    start = 0;
  }
  let nativeCredited = 0;
  let nativeBaselineSet = false;
  if (headKnown) {
    try {
      const confirmedBlock = Math.max(0, start - CONFIRMATIONS + 1);
      const confirmedWei = await chain.balanceAt(address, "0x" + confirmedBlock.toString(16));
      const scale = 10n ** BigInt(NATIVE_DECIMALS - DECIMALS);
      nativeCredited = Number(confirmedWei / scale);
      nativeBaselineSet = true;
    } catch {
      // The first successful status check establishes the baseline instead.
    }
  }
  const now = Math.floor(Date.now() / 1000);
  return {
    reference: "dep_" + randomBytes(6).toString("hex"),
    account: accountId,
    address,
    chain_id: CHAIN_ID,
    network: NETWORK,
    asset: "USDC",
    token: toChecksum(USDC),
    decimals: DECIMALS,
    suggested_usd: Math.max(usdWanted, MIN_USD),
    from_block: start,
    cursor: start,
    confirmations: CONFIRMATIONS,
    received_units: 0,
    seen: [],
    created: now,
    expires: now + DEPOSIT_TTL,
    status: "waiting",
    mainnet: isMainnet(),
    native_credited: nativeCredited,
    native_baseline_set: nativeBaselineSet,
  };
}

/** Scans for new transfers and returns [deposit, newlyCreditedUnits]. Double-crediting
 * is prevented by a high-water mark (credited_through + credited_at_edge, one block's
 * worth of hashes), not by an unbounded seen-list — see arc.py's docstring for why an
 * earlier, capped-list version double-credited. */
export async function check(deposit: Deposit): Promise<[Deposit, number]> {
  const [ready, why] = configured();
  if (!ready) throw new ChainError(why);

  const head = await chain.headBlock();
  const start = deposit.cursor ?? deposit.from_block;
  const stop = Math.min(head, start + MAX_SCAN);

  let credited = 0;
  const pending: Transfer[] = [];
  const seen = deposit.seen ?? [];
  let receivedUnits = deposit.received_units ?? 0;

  if (stop >= start) {
    const transfers = await chain.incoming(deposit.address, start, stop);
    let mark = deposit.credited_through ?? -1;
    let edge = new Set(deposit.credited_at_edge ?? []);

    for (const entry of transfers) {
      const block = entry.block;
      if (block < mark || (block === mark && edge.has(entry.tx))) continue; // already paid
      if (head - block + 1 < CONFIRMATIONS) {
        pending.push(entry);
        continue; // not buried yet; next pass will take it
      }
      entry.confirmations = head - block + 1;
      if (EXPLORER) entry.explorer_url = `${EXPLORER}/tx/${entry.tx}`;
      seen.push(entry);
      receivedUnits += entry.units;
      credited += entry.units;
      if (block > mark) {
        mark = block;
        edge = new Set([entry.tx]);
      } else {
        edge.add(entry.tx);
      }
    }

    deposit.credited_through = mark;
    deposit.credited_at_edge = Array.from(edge).sort();
    // Hold back the confirmation depth so a shallow transfer is re-seen, and never
    // let the cursor run past the head.
    deposit.cursor = Math.max(start, Math.min(stop - CONFIRMATIONS + 1, head));
  }

  // Native-balance path (see the file header): an absolute reading against the
  // confirmed block, so — unlike the log scan — no hash bookkeeping is needed to
  // avoid re-crediting the same funds on the next poll.
  let nativePendingUnits = 0;
  try {
    const confirmedBlock = Math.max(0, head - CONFIRMATIONS + 1);
    const [confirmedWei, latestWei] = await Promise.all([
      chain.balanceAt(deposit.address, "0x" + confirmedBlock.toString(16)),
      chain.balanceAt(deposit.address, "latest"),
    ]);
    const scale = 10n ** BigInt(NATIVE_DECIMALS - DECIMALS);
    const nativeConfirmedUnits = Number(confirmedWei / scale);
    nativePendingUnits = Number((latestWei > confirmedWei ? latestWei - confirmedWei : 0n) / scale);

    const priorNative = deposit.native_credited ?? 0;
    const newlyCreditedNative = deposit.native_baseline_set ? Math.max(0, nativeConfirmedUnits - priorNative) : 0;
    deposit.native_credited = nativeConfirmedUnits;
    deposit.native_baseline_set = true;
    if (newlyCreditedNative > 0) {
      receivedUnits += newlyCreditedNative;
      credited += newlyCreditedNative;
    }
  } catch {
    // No RPC support for a historical-block balance, an address the chain doesn't
    // recognise (e.g. a stubbed test address), or a transient network error — the
    // log-scan result above still stands on its own.
  }

  deposit.seen = seen.slice(-SEEN_LIMIT);
  deposit.received_units = receivedUnits;

  const now = Math.floor(Date.now() / 1000);
  if (receivedUnits > 0) {
    deposit.status = "credited";
  } else if (pending.length || nativePendingUnits > 0) {
    deposit.status = "pending";
    deposit.pending_units = pending.reduce((sum, e) => sum + e.units, 0) + nativePendingUnits;
    deposit.confirmations_seen = pending.length ? head - pending[pending.length - 1].block + 1 : 0;
  } else if (deposit.expires < now) {
    deposit.status = "expired";
  } else {
    deposit.status = "waiting";
  }
  deposit.received_usd = usd(receivedUnits);
  deposit.head = head;
  return [deposit, credited];
}
