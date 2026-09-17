"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { getKey, principal, setKey } from "@/lib/api/tokens";
import { formatUsd } from "@/lib/format";
import type { Deposit, PayMethods } from "@/lib/api/types";

const STEP_LABELS = ["Choose", "Copy key", "Send", "Ready"];

export function KeysFlow() {
  const [step, setStep] = useState(0);
  const [payMethods, setPayMethods] = useState<PayMethods["arc"] | null>(null);
  const [key, setKeyState] = useState<string | null>(null);
  // Bearer token used for the deposit: the raw key when we have one, else a session
  // (Google/wallet sign-in). Either authenticates /v1/pay/deposit.
  const [token, setToken] = useState<string | null>(null);
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.payMethods().then((r) => setPayMethods(r.arc)).catch(() => {});
    // Reuse whatever this device already has instead of minting a new, unrelated
    // anonymous account every time this wizard runs — a signed-in account (Google or
    // wallet) or an existing local key should only ever change when the user
    // explicitly rotates it.
    const existingKey = getKey();
    if (existingKey) {
      setKeyState(existingKey);
      setToken(existingKey);
    } else {
      const existingToken = principal();
      if (existingToken) setToken(existingToken);
    }
  }, []);

  async function openDepositWith(bearer: string) {
    setBusy(true);
    setError(null);
    try {
      const d = await api.openDeposit(bearer, 20);
      setDeposit(d);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open a deposit.");
    } finally {
      setBusy(false);
    }
  }

  async function mintAndAdvance() {
    if (key) {
      // Already have a key on this device — show it again rather than minting one.
      setStep(1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // With no local key, `token` (a Google/wallet session) tells the gateway to
      // issue a fresh key for *this same account* instead of minting an unrelated
      // anonymous one — still a real, visible key, just tied to who is signed in.
      const minted = await api.mintKey(token ?? undefined);
      setKeyState(minted.key);
      setRecoveryUrl(minted.recovery_url ?? null);
      setKey(minted.key);
      setToken(minted.key);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a key.");
    } finally {
      setBusy(false);
    }
  }

  async function goToPayment() {
    if (!token) return;
    await openDepositWith(token);
  }

  useEffect(() => {
    if (step !== 2 || !deposit || !token) return;
    async function tick() {
      try {
        const d = await api.depositStatus(token!, deposit!.reference);
        setDeposit(d);
        if (d.status === "credited") setStep(3);
      } catch {
        // transient — next tick retries
      }
    }
    tick();
    pollRef.current = setInterval(tick, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, deposit?.reference]);

  return (
    <>
      <ol className="flow" id="flow">
        {STEP_LABELS.map((label, i) => (
          <li key={label} data-step={i} className={step === i ? "on" : ""}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="step" data-step="0">
          <h2 className="step-h">Choose how to pay</h2>
          <div className="rail-opts">
            <label className="rail-opt">
              <input type="radio" name="rail" value="arc-usdc" checked readOnly />
              <span className="ro-body">
                <b>USDC on Arc</b>
                <span className="ro-note">
                  {payMethods ? (payMethods.ready ? "the native asset on Arc" : payMethods.reason) : "Checking the gateway…"}
                </span>
              </span>
              <span className="ro-min">
                $0.50<em>min</em>
              </span>
              <span className="ro-fee">
                0%<em>fee</em>
              </span>
            </label>
            <label className="rail-opt off">
              <input type="radio" name="rail" value="arc-wallet" disabled />
              <span className="ro-body">
                <b>Arc wallet</b>
                <span className="ro-note">Pay from a connected EVM wallet</span>
              </span>
              <span className="ro-min">$0.50</span>
              <span className="ro-fee">Unavailable</span>
            </label>
            <label className="rail-opt off">
              <input type="radio" name="rail" value="other" disabled />
              <span className="ro-body">
                <b>Other chains</b>
                <span className="ro-note">Solana, Bitcoin, Ethereum and more</span>
              </span>
              <span className="ro-min">—</span>
              <span className="ro-fee">Unavailable</span>
            </label>
          </div>
          <p className="selected-rail">
            <span>Selected rail</span>
            <b id="rail-label">USDC on Arc · the native asset on Arc</b>
          </p>
          <div className="panel-warn">
            Save the API key and the recovery link when they appear. Lose both and the balance is unrecoverable —
            there is no identity attached to recover to.
          </div>
          <button className="btn primary lg wide" id="go-key" disabled={busy} onClick={mintAndAdvance}>
            Continue
          </button>
          {error && <p className="note bad">{error}</p>}
        </section>
      )}

      {step === 1 && key && (
        <section className="step" data-step="1">
          <h2 className="step-h">Copy your API key</h2>
          <p className="step-sub">Use this key in your app. Then add credit.</p>
          <div className="keycard">
            <code id="the-key">{key}</code>
            <CopyButton text={key} label="Click to copy API key" className="btn keycopy" id="copy-key" />
          </div>
          <button className="btn primary lg wide" id="go-pay" disabled={busy} onClick={goToPayment}>
            Continue to payment →
          </button>
          <p className="step-note">Your credit lands on this key once the deposit confirms.</p>
          <details className="recovery">
            <summary>Recovery link</summary>
            <p>
              The second secret. It survives key rotation and can mint a replacement key, which is why there are two
              rather than one.
            </p>
            <RecoveryReveal recoveryUrl={recoveryUrl} />
          </details>
          <button className="linkish back" data-back="0" onClick={() => setStep(0)}>
            ← Change payment method
          </button>
          {error && <p className="note bad">{error}</p>}
        </section>
      )}

      {step === 2 && deposit && (
        <section className="step" data-step="2">
          <button className="linkish back" data-back="1" onClick={() => setStep(1)}>
            ← Change payment method
          </button>
          <p className="waiting">
            <span className="pip" id="pip" />
            <span id="pay-state">{deposit.status === "pending" ? "Confirming" : "Waiting"}</span>
          </p>
          <h2 className="step-h center">Send USDC</h2>
          <p className="step-sub center" id="pay-sub">
            Arc · $0.50 minimum
          </p>

          <div className="paycard">
            <div className="qrbox">
              <img id="qr" alt="Payment address as a QR code" width={196} height={196} src={`/v1/pay/deposit/${deposit.reference}/qr.svg`} />
            </div>
            <div className="paycard-side">
              <div className="addr">
                <span className="addr-label" id="addr-label">
                  Arc payment address
                </span>
                <code id="pay-address">{deposit.address}</code>
              </div>
              <div className="addr">
                <span className="addr-label">Suggested amount — any amount credits</span>
                <code id="pay-amount">${deposit.suggested_usd}</code>
              </div>
              <p className="watching">
                <span className="pip" />
                Watching now
              </p>
              <p className="watch-note">Checking every 5s · detection can take up to a minute</p>
              <div className="paycard-actions">
                <CopyButton text={deposit.address} label="Copy address" className="btn primary" id="copy-address" />
                <a className="btn" id="explorer" href="/chat">
                  Open the playground ↗
                </a>
              </div>
            </div>
          </div>

          <details className="help">
            <summary>Payment help</summary>
            <ul>
              <li>
                <b>Any amount works.</b> This address belongs to your key alone, so whatever arrives is credited —
                there is no figure to match.
              </li>
              <li>
                <b>Right network.</b> This address is on Arc (chain 5042). USDC sent on another chain does not arrive
                and cannot be recovered.
              </li>
              <li>
                <b>USDC is Arc&rsquo;s native asset.</b> Send it as an ordinary transfer; no token approval and no
                contract call is needed.
              </li>
              <li>
                <b>Nothing to save.</b> Leaving this page does not cancel the deposit — it credits the key whenever
                it lands.
              </li>
            </ul>
          </details>
        </section>
      )}

      {step === 3 && deposit && (
        <section className="step" data-step="3">
          <p className="waiting done">
            <span className="pip" />
            Credited
          </p>
          <h2 className="step-h center">Your key is funded</h2>
          <p className="step-sub center">
            Balance <b id="final-balance">{deposit.balance_usd !== undefined ? formatUsd(deposit.balance_usd) : "—"}</b>. It never expires.
          </p>
          <div className="done-actions">
            <a className="btn primary lg" href="/chat">
              Open the playground →
            </a>
            <a className="btn lg" href="/docs/quickstart">
              Read the quickstart
            </a>
          </div>
        </section>
      )}
    </>
  );
}

function RecoveryReveal({ recoveryUrl }: { recoveryUrl: string | null }) {
  // /v1/keys never returns the raw recovery secret — only a one-time link built from
  // it (recovery_url), which is what's saved here.
  if (!recoveryUrl) return null;
  return <CopyButton text={recoveryUrl} label={recoveryUrl} className="m-id" id="the-recovery" />;
}

function CopyButton({ text, label, className, id }: { text: string; label: string; className: string; id?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={done ? `${className} done` : className}
      id={id}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1300);
        } catch {
          // clipboard unavailable
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
