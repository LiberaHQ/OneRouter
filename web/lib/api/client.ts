"use client";

import { ApiError, type ApiErrorBody, type AuthMethods, type Deposit, type HolderCreditClaim, type HolderCreditStatus, type MeInfo, type PayMethods, type SessionInfo, type SignedIn } from "./types";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: { message: "request failed" } }))) as ApiErrorBody;
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export const api = {
  authMethods: () => request<AuthMethods>("/v1/auth/methods"),

  emailStart: (email: string) => request<{ ref: string; expires_in: number; code?: string; note?: string }>("/v1/auth/email/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  }),
  emailVerify: (ref: string, code: string) => request<SignedIn>("/v1/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ ref, code }),
  }),
  passwordRegister: (email: string, password: string) => request<SignedIn>("/v1/auth/password/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }),
  passwordLogin: (email: string, password: string) => request<SignedIn>("/v1/auth/password/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }),

  walletChallenge: (chain: string, address: string) => request<{ ref: string; message: string; chain: string }>(
    "/v1/auth/wallet/challenge",
    { method: "POST", body: JSON.stringify({ chain, address }) }
  ),
  walletVerify: (ref: string, signature: string) => request<SignedIn>("/v1/auth/wallet/verify", {
    method: "POST",
    body: JSON.stringify({ ref, signature }),
  }),

  session: (token: string) => request<SessionInfo>("/v1/auth/session", { headers: authHeaders(token) }),
  signout: (token: string) => request<{ signed_out: boolean }>("/v1/auth/signout", { method: "POST", headers: authHeaders(token) }),

  me: (key: string) => request<MeInfo>("/v1/me", { headers: authHeaders(key) }),
  holderCredit: (token: string) => request<HolderCreditStatus>("/v1/me/holder-credit", { headers: authHeaders(token) }),
  claimHolderCredit: (token: string) => request<HolderCreditClaim>("/v1/me/holder-credit", {
    method: "POST",
    headers: authHeaders(token),
  }),

  mintKey: (bearer?: string) => request<{ key: string; account: string; balance_usd: number; recovery_url?: string }>("/v1/keys", {
    method: "POST",
    headers: bearer ? authHeaders(bearer) : undefined,
  }),
  rotateKey: (recovery: string) => request<{ key: string; account: string; balance_usd: number }>("/v1/keys/rotate", {
    method: "POST",
    body: JSON.stringify({ recovery }),
  }),

  payMethods: () => request<PayMethods>("/v1/pay/methods"),
  openDeposit: (token: string, amountUsd: number) => request<Deposit>("/v1/pay/deposit", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ amount_usd: amountUsd }),
  }),
  depositStatus: (token: string, reference: string) => request<Deposit>(`/v1/pay/deposit/${reference}`, {
    headers: authHeaders(token),
  }),
};
