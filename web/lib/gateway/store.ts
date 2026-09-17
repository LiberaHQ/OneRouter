// Keys, balances and usage accounting. Ported from gateway/core.py. One row in
// SQLite holds the lot (see db.ts) — secrets are stored as SHA-256 digests, never in
// the clear.
import { createHash, randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import { loadStateBlob, saveStateBlob } from "./db";
import type { Deposit } from "./arc";

export const FREE_REQUESTS_PER_DAY = 50;
export const FREE_TOKENS_PER_DAY = 100_000;
export const FREE_MAX_OUTPUT = 2048;

export function digest(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PasswordRecord {
  algo: "scrypt";
  salt: string;
  hash: string;
  params: { n: number; r: number; p: number; dklen: number };
  updated: number;
}

export interface Account {
  id: string;
  created: number;
  balance_usd: number;
  spent_usd: number;
  requests: number;
  key_hash: string;
  api_key?: string;
  recovery_hash: string;
  revoked: boolean;
  open_tier: { day: string; requests: number; tokens: number };
  identities: string[];
  email?: string;
  arc_address?: string;
  password?: PasswordRecord;
  // Charged but not yet settled to the treasury address on-chain — accumulates in
  // charge(), drained (in full or in part — see treasury.ts) by a sweep.
  owed_treasury?: number;
}

interface HolderClaim {
  account: string;
  wallet: string;
  token: string;
  period: string;
  credited_usd: number;
  token_balance: string;
  updated: number;
}

interface State {
  accounts: Record<string, Account>;
  index: Record<string, string>;
  receipts: Record<string, unknown>[];
  identities: Record<string, string>;
  sessions: Record<string, { account: string; expires: number }>;
  pending: Record<string, { kind: string; expires: number; [k: string]: unknown }>;
  deposits: Record<string, Deposit>;
  throttle: Record<string, { count: number; until: number }>;
  arc_seed?: string;
  arc_seed_generated?: number;
  sweeps?: { account: string; usd: number; tx: string; at: number }[];
  holder_claims: Record<string, HolderClaim>;
}

function blank(): State {
  return {
    accounts: {},
    index: {},
    receipts: [],
    identities: {},
    sessions: {},
    pending: {},
    deposits: {},
    throttle: {},
    holder_claims: {},
  };
}

function loadState(): State {
  const blob = loadStateBlob();
  if (!blob) return blank();
  try {
    const state = JSON.parse(blob) as State;
    const defaults = blank();
    for (const key of Object.keys(defaults) as Array<keyof State>) {
      if (state[key] === undefined) Object.assign(state, { [key]: defaults[key] });
    }
    return state;
  } catch {
    // A truncated write should not take the gateway down with it.
    return blank();
  }
}

function saveState(state: State): void {
  saveStateBlob(JSON.stringify(state));
}

// Serialises every read-modify-write. Node's single-threaded JS execution means this
// only needs to guard against interleaving across `await` points during file I/O, not
// true parallel access — a simple promise-chain queue is enough (Python's
// threading.Lock protected the same operations under real OS threads).
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => T): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.catch(() => {});
  return result as Promise<T>;
}

const SCRYPT_PARAMS = { n: 1 << 14, r: 8, p: 1, dklen: 32 };
// N=16384,r=8 needs close to Node's default 32MB scrypt maxmem cap — raise it.
const SCRYPT_MAXMEM = 128 * SCRYPT_PARAMS.n * SCRYPT_PARAMS.r * 2;

export class Store {
  state: State;

  constructor() {
    this.state = loadState();
  }

  /** Next.js can evaluate route handlers in separate module instances. Refresh
   * cross-route auth state before reading it so one handler sees another handler's
   * committed sessions and one-shot challenges. */
  private refresh(): void {
    this.state = loadState();
  }

  // ── Keys ──────────────────────────────────────────────────────────────────
  async mint(funded = 0.0): Promise<{ key: string; recovery: string; account: string; balance_usd: number }> {
    return withLock(() => {
      const key = "or-live-" + randomHex(16);
      const recovery = "or-rec-" + randomHex(16);
      const acctId = "acct_" + randomHex(6);
      this.state.accounts[acctId] = {
        id: acctId,
        created: Math.floor(Date.now() / 1000),
        balance_usd: funded,
        spent_usd: 0.0,
        requests: 0,
        key_hash: digest(key),
        api_key: key,
        recovery_hash: digest(recovery),
        revoked: false,
        open_tier: { day: todayUTC(), requests: 0, tokens: 0 },
        identities: [],
      };
      this.state.index[digest(key)] = acctId;
      this.state.index[digest(recovery)] = acctId;
      saveState(this.state);
      return { key, recovery, account: acctId, balance_usd: funded };
    });
  }

  /** The account behind a bearer secret, or null. Revoked keys resolve to null. */
  resolve(secret: string | undefined): Account | null {
    const acctId = this.state.index[digest(secret || "")];
    if (!acctId) return null;
    const acct = this.state.accounts[acctId];
    if (!acct || acct.revoked) return null;
    return acct;
  }

  revoked(secret: string | undefined): boolean {
    const acctId = this.state.index[digest(secret || "")];
    const acct = acctId ? this.state.accounts[acctId] : undefined;
    return !!acct?.revoked;
  }

  /** Spend a recovery secret for a fresh key. The old key stops resolving. */
  async rotate(recovery: string | undefined): Promise<{ key: string; account: string; balance_usd: number } | null> {
    return withLock(() => {
      const acctId = this.state.index[digest(recovery || "")];
      const acct = acctId ? this.state.accounts[acctId] : undefined;
      if (!acct || acct.revoked || digest(recovery || "") !== acct.recovery_hash) return null;
      delete this.state.index[acct.key_hash];
      const key = "or-live-" + randomHex(16);
      acct.key_hash = digest(key);
      acct.api_key = key;
      this.state.index[digest(key)] = acctId;
      saveState(this.state);
      return { key, account: acctId, balance_usd: acct.balance_usd };
    });
  }

  /** Same replacement as `rotate`, but for a caller already authenticated by session
   * or an existing key rather than the recovery secret — the device has no local key
   * (a returning Google/wallet sign-in never gets the original one back) but is still
   * provably this account, so it can be issued a fresh one for itself. The recovery
   * secret is left untouched, exactly like `rotate`. */
  async issueKeyFor(acct: Account): Promise<{ key: string; account: string; balance_usd: number }> {
    return withLock(() => {
      delete this.state.index[acct.key_hash];
      const key = "or-live-" + randomHex(16);
      acct.key_hash = digest(key);
      acct.api_key = key;
      this.state.index[digest(key)] = acct.id;
      saveState(this.state);
      return { key, account: acct.id, balance_usd: acct.balance_usd };
    });
  }

  /** Returns the account's stable key. Legacy accounts only have a hash, so they
   * receive one replacement the first time they are loaded after this migration. */
  async keyFor(acct: Account): Promise<{ key: string; account: string; balance_usd: number }> {
    if (acct.api_key) return { key: acct.api_key, account: acct.id, balance_usd: acct.balance_usd };
    return this.issueKeyFor(acct);
  }

  async credit(acct: Account, amount: number): Promise<Account> {
    return withLock(() => {
      acct.balance_usd = round6(acct.balance_usd + amount);
      saveState(this.state);
      return acct;
    });
  }

  // ── Billing ───────────────────────────────────────────────────────────────
  async charge(acct: Account, cost: number, receipt: Record<string, unknown>): Promise<void> {
    await withLock(() => {
      acct.balance_usd = round6(Math.max(0, acct.balance_usd - cost));
      acct.spent_usd = round6(acct.spent_usd + cost);
      acct.owed_treasury = round6((acct.owed_treasury ?? 0) + cost);
      acct.requests += 1;
      this.state.receipts.push(receipt);
      // The receipt log is a demo convenience, not an audit trail — cap it so a
      // long-running gateway does not grow the state file without bound.
      if (this.state.receipts.length > 500) {
        this.state.receipts = this.state.receipts.slice(-500);
      }
      saveState(this.state);
    });
  }

  /** Every account currently owing at least `minUsd` to the treasury — the sweep's
   * worklist. */
  accountsOwingTreasury(minUsd: number): Account[] {
    return Object.values(this.state.accounts).filter((a) => !a.revoked && (a.owed_treasury ?? 0) >= minUsd);
  }

  /** Records what a sweep actually moved and clears the corresponding ledger amount.
   * `sweptUsd` may be less than what was owed (a partial sweep, capped by on-chain
   * balance or gas) — only that much is drained, and the rest stays owed. */
  async recordSweep(acct: Account, sweptUsd: number, tx: string): Promise<void> {
    await withLock(() => {
      acct.owed_treasury = round6(Math.max(0, (acct.owed_treasury ?? 0) - sweptUsd));
      this.state.sweeps = this.state.sweeps ?? [];
      this.state.sweeps.push({ account: acct.id, usd: sweptUsd, tx, at: Math.floor(Date.now() / 1000) });
      if (this.state.sweeps.length > 500) this.state.sweeps = this.state.sweeps.slice(-500);
      saveState(this.state);
    });
  }

  receipt(rid: string): Record<string, unknown> | null {
    return this.state.receipts.find((r) => r.id === rid) ?? null;
  }

  /** Flush after a caller has mutated state in place (e.g. state.deposits directly). */
  async persist(): Promise<void> {
    await withLock(() => saveState(this.state));
  }

  // ── Identities and sessions ──────────────────────────────────────────────
  accountById(acctId: string | undefined): Account | null {
    const acct = acctId ? this.state.accounts[acctId] : undefined;
    return !acct || acct.revoked ? null : acct;
  }

  byIdentity(identity: string): Account | null {
    return this.accountById(this.state.identities[identity]);
  }

  async link(acct: Account, identity: string): Promise<Account> {
    return withLock(() => {
      const owner = this.state.identities[identity];
      if (owner && owner !== acct.id) {
        throw new Error("identity is already attached to another account");
      }
      this.state.identities[identity] = acct.id;
      if (!acct.identities.includes(identity)) acct.identities.push(identity);
      saveState(this.state);
      return acct;
    });
  }

  /** The account behind an identity, creating one on first sight. `minted` carries the
   * key and recovery secret the very first time — the only moment either is shown. */
  async signIn(identity: string): Promise<[Account, { key: string; recovery: string; account: string; balance_usd: number } | null]> {
    const existing = this.byIdentity(identity);
    if (existing) return [existing, null];
    const minted = await this.mint();
    const acct = this.state.accounts[minted.account];
    await this.link(acct, identity);
    return [acct, minted];
  }

  async openSession(acct: Account, ttl = 30 * 86400): Promise<string> {
    return withLock(() => {
      const token = "or-sess-" + randomBytes(32).toString("base64url");
      this.state.sessions[digest(token)] = { account: acct.id, expires: Math.floor(Date.now() / 1000) + ttl };
      this.expireSessions();
      saveState(this.state);
      return token;
    });
  }

  session(token: string | undefined): Account | null {
    this.refresh();
    const row = this.state.sessions[digest(token || "")];
    if (!row || row.expires < Date.now() / 1000) return null;
    return this.accountById(row.account);
  }

  async closeSession(token: string | undefined): Promise<void> {
    await withLock(() => {
      this.refresh();
      delete this.state.sessions[digest(token || "")];
      saveState(this.state);
    });
  }

  holderClaim(wallet: string, token: string, period: string): HolderClaim | null {
    this.refresh();
    return this.state.holder_claims[holderClaimKey(wallet, token, period)] ?? null;
  }

  async applyHolderCredit(
    acctId: string,
    wallet: string,
    token: string,
    period: string,
    entitlementUsd: number,
    tokenBalance: string
  ): Promise<{ credited_usd: number; claimed_usd: number; balance_usd: number }> {
    return withLock(() => {
      this.refresh();
      const acct = this.accountById(acctId);
      if (!acct) throw new Error("account no longer exists");
      const key = holderClaimKey(wallet, token, period);
      const previous = this.state.holder_claims[key];
      if (previous && previous.account !== acct.id) throw new Error("wallet benefit already belongs to another account");
      const claimed = previous?.credited_usd ?? 0;
      const credited = round6(Math.max(0, entitlementUsd - claimed));
      if (credited > 0) acct.balance_usd = round6(acct.balance_usd + credited);
      const claimedTotal = round6(claimed + credited);
      this.state.holder_claims[key] = {
        account: acct.id,
        wallet: wallet.toLowerCase(),
        token: token.toLowerCase(),
        period,
        credited_usd: claimedTotal,
        token_balance: tokenBalance,
        updated: Math.floor(Date.now() / 1000),
      };
      saveState(this.state);
      return { credited_usd: credited, claimed_usd: claimedTotal, balance_usd: acct.balance_usd };
    });
  }

  private expireSessions(): void {
    const now = Date.now() / 1000;
    for (const key of Object.keys(this.state.sessions)) {
      if (this.state.sessions[key].expires < now) delete this.state.sessions[key];
    }
  }

  // ── Short-lived challenges (OTP codes, wallet nonces) ────────────────────
  async stash(kind: string, payload: Record<string, unknown>, ttl = 600): Promise<string> {
    return withLock(() => {
      this.refresh();
      const ref = randomBytes(18).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      for (const k of Object.keys(this.state.pending)) {
        if (this.state.pending[k].expires < now) delete this.state.pending[k];
      }
      this.state.pending[ref] = { kind, expires: now + ttl, ...payload };
      saveState(this.state);
      return ref;
    });
  }

  /** One-shot: a challenge that has been read cannot be replayed. */
  async take(ref: string | undefined, kind: string): Promise<Record<string, unknown> | null> {
    const row = await withLock(() => {
      this.refresh();
      const r = this.state.pending[ref || ""];
      delete this.state.pending[ref || ""];
      saveState(this.state);
      return r;
    });
    if (!row || row.kind !== kind || row.expires < Date.now() / 1000) return null;
    return row;
  }

  peek(ref: string | undefined, kind: string): Record<string, unknown> | null {
    this.refresh();
    const row = this.state.pending[ref || ""];
    if (!row || row.kind !== kind || row.expires < Date.now() / 1000) return null;
    return row;
  }

  async bump(ref: string | undefined, field: string): Promise<number> {
    return withLock(() => {
      this.refresh();
      const row = this.state.pending[ref || ""];
      if (!row) return 0;
      row[field] = ((row[field] as number) ?? 0) + 1;
      saveState(this.state);
      return row[field] as number;
    });
  }

  // ── Arc deposit addresses ────────────────────────────────────────────────
  async arcSeed(): Promise<Buffer> {
    const wallet = await import("./wallet");
    const fromEnv = wallet.seedFromEnv();
    if (fromEnv) return fromEnv;
    return withLock(() => {
      let held = this.state.arc_seed;
      if (!held) {
        held = wallet.newSeed();
        this.state.arc_seed = held;
        this.state.arc_seed_generated = Math.floor(Date.now() / 1000);
        saveState(this.state);
      }
      return Buffer.from(held, "hex");
    });
  }

  async seedIsGenerated(): Promise<boolean> {
    const wallet = await import("./wallet");
    return wallet.seedFromEnv() === null;
  }

  /** This account's deposit address, derived once and then remembered so a changed
   * seed cannot silently move where someone was told to send funds. */
  async arcAddress(acct: Account): Promise<string> {
    if (acct.arc_address) return acct.arc_address;
    const wallet = await import("./wallet");
    const seed = await this.arcSeed();
    const address = wallet.addressFor(seed, acct.id);
    await withLock(() => {
      acct.arc_address = address;
      saveState(this.state);
    });
    return address;
  }

  // ── Passwords ─────────────────────────────────────────────────────────────
  static hashPassword(password: string, salt?: Buffer): PasswordRecord {
    const s = salt || randomBytes(16);
    const raw = scryptSync(password, s, SCRYPT_PARAMS.dklen, {
      N: SCRYPT_PARAMS.n,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: SCRYPT_MAXMEM,
    });
    return {
      algo: "scrypt",
      salt: s.toString("hex"),
      hash: raw.toString("hex"),
      params: SCRYPT_PARAMS,
      updated: Math.floor(Date.now() / 1000),
    };
  }

  async setPassword(acct: Account, password: string): Promise<void> {
    await withLock(() => {
      acct.password = Store.hashPassword(password);
      saveState(this.state);
    });
  }

  static passwordMatches(acct: Account, password: string): boolean {
    const stored = acct.password;
    if (!stored) return false;
    const raw = scryptSync(password, Buffer.from(stored.salt, "hex"), stored.params.dklen, {
      N: stored.params.n,
      r: stored.params.r,
      p: stored.params.p,
      maxmem: SCRYPT_MAXMEM,
    });
    const a = Buffer.from(raw.toString("hex"));
    const b = Buffer.from(stored.hash);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Counts recent failures for one subject and returns the total. */
  async noteFailure(subject: string): Promise<number> {
    return withLock(() => {
      const now = Math.floor(Date.now() / 1000);
      let row = this.state.throttle[subject];
      if (!row || row.until < now) row = { count: 0, until: now + 900 };
      row.count += 1;
      this.state.throttle[subject] = row;
      saveState(this.state);
      return row.count;
    });
  }

  failures(subject: string): number {
    const row = this.state.throttle[subject];
    return row && row.until > Date.now() / 1000 ? row.count : 0;
  }

  async clearFailures(subject: string): Promise<void> {
    await withLock(() => {
      delete this.state.throttle[subject];
      saveState(this.state);
    });
  }

  // ── Open Tier ─────────────────────────────────────────────────────────────
  /** Today's free-tier counters, rolled over at 00:00 UTC. */
  openTier(acct: Account): Account["open_tier"] {
    const quota = acct.open_tier;
    const today = todayUTC();
    if (quota.day !== today) {
      quota.day = today;
      quota.requests = 0;
      quota.tokens = 0;
    }
    return quota;
  }

  async spendOpenTier(acct: Account, tokens: number): Promise<void> {
    await withLock(() => {
      const quota = this.openTier(acct);
      quota.requests += 1;
      quota.tokens += tokens;
      saveState(this.state);
    });
  }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function holderClaimKey(wallet: string, token: string, period: string): string {
  return `${token.toLowerCase()}:${period}:${wallet.toLowerCase()}`;
}

export const STORE = new Store();
