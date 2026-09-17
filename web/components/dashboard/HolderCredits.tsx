"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { principal } from "@/lib/api/tokens";
import type { HolderCreditStatus } from "@/lib/api/types";
import { ApiError } from "@/lib/api/types";

const ARC_CHAIN = {
  chainId: "0x13b2",
  chainName: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.arc.io"],
  blockExplorerUrls: ["https://explorer.arc.io"],
};

export function HolderCredits() {
  const [status, setStatus] = useState<HolderCreditStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasEthereum, setHasEthereum] = useState(false);

  useEffect(() => {
    setHasEthereum(typeof window !== "undefined" && !!(window as any).ethereum);
  }, []);

  function refresh() {
    const token = principal();
    if (!token) {
      setBusy(false);
      return;
    }
    setBusy(true);
    api.holderCredit(token)
      .then(setStatus)
      .catch((reason: unknown) => setError(messageFor(reason)))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectWallet() {
    const token = principal();
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const eth = (window as any).ethereum;
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      const address = accounts[0];
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN.chainId }] });
      } catch {
        try {
          await eth.request({ method: "wallet_addEthereumChain", params: [ARC_CHAIN] });
        } catch {
          // proceed anyway — the signature itself doesn't require the chain switch to succeed
        }
      }
      const { ref, message } = await api.walletChallenge("arc", address);
      const signature: string = await eth.request({ method: "personal_sign", params: [message, address] });
      await api.walletLink(token, ref, signature);
      refresh();
    } catch (reason) {
      setError(messageFor(reason));
      setBusy(false);
    }
  }

  async function claim() {
    const token = principal();
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.claimHolderCredit(token);
      setStatus(result);
      setNotice(result.credited_usd > 0
        ? `$${result.credited_usd.toFixed(2)} added to your OneRouter balance.`
        : "This month’s holder credit is already claimed.");
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setBusy(false);
    }
  }

  const alreadyClaimed = !!status && status.entitlement_usd > 0 && status.claimable_usd <= 0;

  return (
    <section className="holder-benefit" aria-labelledby="holder-benefit-title">
      <div className="holder-benefit-head">
        <div>
          <span className="eyebrow">DUKE holder benefit</span>
          <h2 id="holder-benefit-title">Monthly API credit</h2>
        </div>
        <span className="holder-period">{status?.period ?? "This month"}</span>
      </div>

      {busy && !status && <p className="panel-note">Checking your verified Arc wallet…</p>}
      {!busy && !status && !error && (
        <p className="panel-note">Sign in to check and claim DUKE holder credit.</p>
      )}
      {error && <p className="auth-status bad">{error}</p>}

      {status && (
        <>
          <div className="holder-metrics">
            <div><span>Wallet balance</span><strong>{formatTokens(status.token_balance)} {status.symbol}</strong></div>
            <div><span>Monthly tier</span><strong>${status.entitlement_usd.toFixed(2)}</strong></div>
            <div><span>Available now</span><strong>${status.claimable_usd.toFixed(2)}</strong></div>
          </div>
          <div className="holder-actions">
            <div>
              <p>{status.reason ?? tierCopy(status)}</p>
              {status.wallet && <code>{shortAddress(status.wallet)}</code>}
            </div>
            {!status.wallet ? (
              hasEthereum ? (
                <button className="btn primary" type="button" disabled={busy} onClick={connectWallet}>
                  {busy ? "Connecting…" : "Connect Arc wallet"}
                </button>
              ) : (
                <span className="panel-note">No wallet extension detected in this browser.</span>
              )
            ) : (
              <button
                className="btn primary"
                type="button"
                disabled={busy || status.claimable_usd <= 0}
                onClick={claim}
              >
                {busy ? "Checking…" : status.claimable_usd > 0 ? "Claim credit" : alreadyClaimed ? "Claimed" : "Not eligible"}
              </button>
            )}
          </div>
          {notice && <p className="auth-status ok">{notice}</p>}
        </>
      )}
    </section>
  );
}

function tierCopy(status: HolderCreditStatus): string {
  if (status.next_tier) {
    return `Hold ${Number(status.next_tier.minimum_tokens).toLocaleString()} ${status.symbol} to reach the $${status.next_tier.credit_usd.toFixed(2)} tier.`;
  }
  return `You are in the highest ${status.symbol} holder tier.`;
}

function formatTokens(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function messageFor(reason: unknown): string {
  return reason instanceof ApiError ? reason.message : "Could not check DUKE holdings. Try again.";
}
