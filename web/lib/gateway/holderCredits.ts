import { createPublicClient, erc20Abi, formatUnits, http, isAddress, type Address } from "viem";
import type { Account } from "./store";
import * as arc from "./arc";

// Placeholder address — the ticker is ONE, but this contract address is a stand-in
// until the real one is set via ONEROUTER_HOLDER_TOKEN.
export const HOLDER_TOKEN = (process.env.ONEROUTER_HOLDER_TOKEN ||
  "0x41358Defd0dedc90528b3F1835715E907B686e6a") as Address;

export const HOLDER_TIERS = [
  { minimum: 1_000n, creditUsd: 0.5 },
  { minimum: 10_000n, creditUsd: 2 },
  { minimum: 100_000n, creditUsd: 5 },
  { minimum: 1_000_000n, creditUsd: 15 },
  { minimum: 10_000_000n, creditUsd: 40 },
] as const;

const chain = {
  id: arc.CHAIN_ID,
  name: arc.NETWORK,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: arc.NATIVE_DECIMALS },
  rpcUrls: { default: { http: [arc.RPC] } },
} as const;

const publicClient = createPublicClient({ chain, transport: http(arc.RPC) });

export const holderChain = {
  balanceOf: (token: Address, wallet: Address) =>
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
  decimals: (token: Address) =>
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
  symbol: (token: Address) =>
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
  totalSupply: (token: Address) =>
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
};

export interface HolderTier {
  minimum_tokens: string;
  credit_usd: number;
}

export interface HolderCreditStatus {
  eligible: boolean;
  reason: string | null;
  period: string;
  wallet: string | null;
  token: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  token_balance: string;
  entitlement_usd: number;
  claimed_usd: number;
  claimable_usd: number;
  current_tier: HolderTier | null;
  next_tier: HolderTier | null;
}

export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function arcWallet(acct: Account): Address | null {
  const identity = acct.identities.find((value) => value.startsWith("arc:"));
  const address = identity?.slice(4) ?? "";
  return isAddress(address) ? address : null;
}

export function entitlementFor(rawBalance: bigint, decimals: number): {
  creditUsd: number;
  current: HolderTier | null;
  next: HolderTier | null;
} {
  const scale = 10n ** BigInt(decimals);
  let current: HolderTier | null = null;
  let next: HolderTier | null = null;
  for (const tier of HOLDER_TIERS) {
    const publicTier = { minimum_tokens: tier.minimum.toString(), credit_usd: tier.creditUsd };
    if (rawBalance >= tier.minimum * scale) current = publicTier;
    else {
      next = publicTier;
      break;
    }
  }
  return { creditUsd: current?.credit_usd ?? 0, current, next };
}

export async function holderSnapshot(acct: Account, claimedUsd = 0): Promise<HolderCreditStatus> {
  const period = currentPeriod();
  const wallet = arcWallet(acct);
  if (!wallet) {
    return {
      eligible: false,
      reason: "Sign in with an Arc wallet to verify your ONE holdings.",
      period,
      wallet: null,
      token: HOLDER_TOKEN,
      symbol: "ONE",
      decimals: 18,
      total_supply: "1000000000",
      token_balance: "0",
      entitlement_usd: 0,
      claimed_usd: claimedUsd,
      claimable_usd: 0,
      current_tier: null,
      next_tier: { minimum_tokens: "1000", credit_usd: 0.5 },
    };
  }

  const [rawBalance, decimals, symbol, rawSupply] = await Promise.all([
    holderChain.balanceOf(HOLDER_TOKEN, wallet),
    holderChain.decimals(HOLDER_TOKEN),
    holderChain.symbol(HOLDER_TOKEN),
    holderChain.totalSupply(HOLDER_TOKEN),
  ]);
  const tier = entitlementFor(rawBalance, decimals);
  const claimable = Math.max(0, tier.creditUsd - claimedUsd);
  return {
    eligible: tier.creditUsd > 0,
    reason: tier.creditUsd > 0 ? null : `Hold at least ${HOLDER_TIERS[0].minimum.toLocaleString()} ${symbol} to qualify.`,
    period,
    wallet,
    token: HOLDER_TOKEN,
    symbol,
    decimals,
    total_supply: formatUnits(rawSupply, decimals),
    token_balance: formatUnits(rawBalance, decimals),
    entitlement_usd: tier.creditUsd,
    claimed_usd: claimedUsd,
    claimable_usd: claimable,
    current_tier: tier.current,
    next_tier: tier.next,
  };
}
