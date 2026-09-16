"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { principal } from "@/lib/api/tokens";
import type { Deposit, PayMethods } from "@/lib/api/types";

const AMOUNTS = [5, 20, 50, 200];

export function PayFlow() {
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState(20);
  const [custom, setCustom] = useState("");
  const [payMethods, setPayMethods] = useState<PayMethods["arc"] | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.payMethods().then((r) => setPayMethods(r.arc)).catch(() => {});
  }, []);

  async function start() {
    const token = principal();
    if (!token) {
      setError("Sign in first to add credit.");
      return;
    }
    setError(null);
    const chosen = custom ? Number(custom) : amount;
    try {
      const d = await api.openDeposit(token, chosen);
      setDeposit(d);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open a deposit.");
    }
  }

  useEffect(() => {
    if (step !== 1 || !deposit) return;
    const token = principal();
    if (!token) return;
    async function tick() {
      try {
        const d = await api.depositStatus(token!, deposit!.reference);
        setDeposit(d);
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
      <ol className="flow" id="pay-flow">
        <li data-step="0" className={step === 0 ? "on" : ""}>
          <span>01</span>Amount
        </li>
        <li data-step="1" className={step === 1 ? "on" : ""}>
          <span>02</span>Send USDC
        </li>
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
                  {payMethods ? (payMethods.ready ? "Ready to accept deposits" : payMethods.reason) : "Checking the gateway…"}
                </span>
              </span>
              <span className="ro-min">
                $0.50<em>min</em>
              </span>
              <span className="ro-fee">
                0%<em>fee</em>
              </span>
            </label>
          </div>
          {payMethods && !payMethods.ready && <p className="livewarn">{payMethods.reason}</p>}

          <h2 className="step-h" style={{ marginTop: 26 }}>
            How much
          </h2>
          <p className="step-sub">A suggestion only — any amount sent to your address is credited.</p>
          <div className="chips" id="pay-amounts">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                className="chip"
                aria-pressed={!custom && amount === a}
                onClick={() => {
                  setAmount(a);
                  setCustom("");
                }}
              >
                ${a}
              </button>
            ))}
            <input
              type="number"
              id="pay-custom"
              min={0.5}
              step={0.5}
              placeholder="Other"
              aria-label="Custom amount in USD"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </div>
          <button className="btn primary lg wide" id="pay-start" onClick={start}>
            Continue
          </button>
          {error && <p className="note bad">{error}</p>}
          <p className="step-note" id="pay-note">
            Credit never expires and is spent only by your own requests.
          </p>
        </section>
      )}

      {step === 1 && deposit && <DepositStep deposit={deposit} onBack={() => setStep(0)} />}
    </>
  );
}

function DepositStep({ deposit, onBack }: { deposit: Deposit; onBack: () => void }) {
  const credited = deposit.status === "credited";
  return (
    <section className="step" data-step="1">
      <button className="linkish back" data-back="0" onClick={onBack}>
        ← Change amount
      </button>
      <p className={credited ? "waiting done" : "waiting"}>
        <span className="pip" id="pay-pip" />
        <span id="pay-state">{credited ? "Credited" : deposit.status === "pending" ? "Confirming" : "Waiting"}</span>
      </p>
      <h2 className="step-h center">Send USDC</h2>
      <p className="step-sub center" id="pay-sub">
        Arc · $0.50 minimum
      </p>

      <div className="paycard">
        <div className="qrbox">
          <img id="pay-qr" alt="Your deposit address as a QR code" width={196} height={196} src={`/v1/pay/deposit/${deposit.reference}/qr.svg`} />
        </div>
        <div className="paycard-side">
          <div className="addr">
            <span className="addr-label" id="pay-addr-label">
              Your Arc deposit address
            </span>
            <code id="pay-address">{deposit.address}</code>
          </div>
          <div className="addr">
            <span className="addr-label">Suggested amount</span>
            <code id="pay-amount">${deposit.suggested_usd}</code>
          </div>
          <p className="watching">
            <span className="pip" />
            Watching now
          </p>
          <p className="watch-note">Checking every 5s · detection can take up to a minute</p>
          <div className="paycard-actions">
            <CopyAddress address={deposit.address} />
          </div>
        </div>
      </div>

      {deposit.seen.length > 0 && (
        <div className="table-wrap" id="pay-received" style={{ marginTop: 18 }}>
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th className="num">Amount</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody id="pay-rows">
              {deposit.seen.map((t) => (
                <tr key={t.tx}>
                  <td>block {t.block}</td>
                  <td className="num">${(t.units / 10 ** deposit.decimals).toFixed(2)}</td>
                  <td>
                    {t.explorer_url ? (
                      <a href={t.explorer_url} target="_blank" rel="noopener">
                        {t.tx.slice(0, 10)}…
                      </a>
                    ) : (
                      t.tx.slice(0, 10) + "…"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="step-note">
        <b id="pay-balance">{deposit.balance_usd !== undefined ? `Balance $${deposit.balance_usd.toFixed(2)}` : ""}</b>
      </p>

      <details className="help">
        <summary>Payment help</summary>
        <ul>
          <li>
            <b>Any amount works.</b> This address belongs to your key alone, so whatever arrives is credited.
          </li>
          <li>
            <b>Right network.</b> Arc, chain 5042. USDC sent on another chain does not arrive and cannot be recovered.
          </li>
          <li>
            <b>Native asset.</b> USDC is Arc&rsquo;s gas token — send it as an ordinary transfer, no approval or
            contract call.
          </li>
          <li>
            <b>Nothing to keep open.</b> Leaving this page does not cancel anything; the transfer credits your key
            whenever it lands.
          </li>
        </ul>
      </details>
    </section>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn primary"
      id="pay-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setDone(true);
          setTimeout(() => setDone(false), 1300);
        } catch {
          // clipboard unavailable
        }
      }}
    >
      {done ? "Copied" : "Copy address"}
    </button>
  );
}
