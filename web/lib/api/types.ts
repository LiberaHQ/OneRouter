export interface SignedIn {
  session: string;
  account: string;
  balance_usd: number;
  identities: string[];
  new_account: boolean;
  key?: string;
  recovery?: string;
  label?: string;
  chain?: string;
}

export interface AuthMethods {
  methods: {
    email: { ready: boolean; note: string };
    password: { ready: boolean; note: string };
    wallet: { ready: boolean; note: string; chains: string[] };
    google: { ready: boolean; note: string };
  };
  origins: string[];
}

export interface SessionInfo {
  account: string;
  key: string;
  balance_usd: number;
  spent_usd: number;
  requests: number;
  identities: string[];
  email: string | null;
  arc_address: string;
  arc_chain_id: number;
}

export interface MeInfo {
  account: string;
  balance_usd: number;
  spent_usd: number;
  requests: number;
  created: number;
}

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

export interface HolderCreditClaim extends HolderCreditStatus {
  credited_usd: number;
  balance_usd: number;
}

export interface PayMethods {
  arc: {
    ready: boolean;
    reason: string;
    network: string;
    asset: string;
    chain_id: number;
    token: string | null;
    decimals: number;
    confirmations: number;
    minimum_usd: number;
    explorer: string | null;
    mainnet: boolean;
    rpc: string;
  };
}

export interface Transfer {
  tx: string;
  block: number;
  from: string;
  units: number;
  confirmations?: number;
  explorer_url?: string;
}

export interface Deposit {
  reference: string;
  account: string;
  address: string;
  chain_id: number;
  network: string;
  asset: string;
  token: string;
  decimals: number;
  suggested_usd: number;
  status: "waiting" | "pending" | "credited" | "expired";
  received_units: number;
  received_usd?: number;
  seen: Transfer[];
  balance_usd?: number;
  chain_error?: string;
}

export interface ApiErrorBody {
  error: { code: string; type: string; message: string; retryable: boolean };
}

export class ApiError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message || "request failed");
    this.code = body.error?.code || "unknown_error";
    this.status = status;
    this.retryable = body.error?.retryable ?? false;
  }
}
