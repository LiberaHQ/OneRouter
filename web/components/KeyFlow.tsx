'use client';

import Link from 'next/link';
import { useState } from 'react';
import Deposit from '@/components/Deposit';
import { setStore } from '@/lib/format';

import { API } from '@/lib/config';
const STEPS = ['Choose', 'Copy key', 'Send', 'Ready'];

/** Getting started with no account: take a key, send USDC, watch it land. */
export default function KeyFlow() {
  const [step, setStep] = useState(0);
  const [key, setKey] = useState('');
  const [recovery, setRecovery] = useState('');
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const mint = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/keys`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!res.ok) throw new Error(`the gateway answered ${res.status}`);
      const data = await res.json();
      setKey(data.key);
      setRecovery(data.recovery_url);
      setStore('or-key', data.key);
      setNote('');
      setStep(1);
    } catch (e) {
      setNote(`Could not create a key — ${(e as Error).message}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
      <main className="page narrow">
        <section className="page-head">
          <div className="crumbs"><Link href="/">Get started</Link> <span>/</span> <span>Get a key</span></div>
          <h1>Get an API key</h1>
        </section>

        <ol className="flow">
          {STEPS.map((label, i) => (
            <li key={label} className={step >= i ? 'on' : ''}>
              <span>{String(i + 1).padStart(2, '0')}</span>{label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="step">
            <h2 className="step-h">Choose how to pay</h2>
            <div className="rail-opts">
              <label className="rail-opt">
                <input type="radio" name="rail" defaultChecked />
                <span className="ro-body">
                  <b>USDC on Arc</b>
                  <span className="ro-note">Native USDC — the asset Arc settles in</span>
                </span>
                <span className="ro-min">$0.50<em>min</em></span>
                <span className="ro-fee">0%<em>fee</em></span>
              </label>
            </div>
            <div className="panel-warn">
              Save the API key and the recovery secret when they appear. Lose both and the
              balance is unrecoverable — there is no identity attached to recover to.
            </div>
            <button className="btn primary lg wide" disabled={busy} onClick={() => void mint()}>
              {busy ? 'Creating your key…' : 'Continue'}
            </button>
          </section>
        )}

        {step === 1 && (
          <section className="step">
            <h2 className="step-h">Copy your API key</h2>
            <p className="step-sub">Use this key in your app. Then add credit.</p>
            <div className="keycard">
              <code>{key}</code>
              <button
                className={`btn keycopy${copied ? ' done' : ''}`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(key);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1300);
                  } catch { /* clipboard blocked */ }
                }}
              >
                {copied ? 'Copied' : 'Click to copy API key'}
              </button>
            </div>
            <button className="btn primary lg wide" onClick={() => setStep(2)}>
              Continue to payment →
            </button>
            <p className="step-note">Your credit lands on this key once the deposit confirms.</p>
            <details className="recovery">
              <summary>Recovery link</summary>
              <p>
                The second secret. It survives key rotation and can mint a replacement key,
                which is why there are two rather than one.
              </p>
              <code>{recovery}</code>
            </details>
            <button className="linkish back" onClick={() => setStep(0)}>← Change payment method</button>
          </section>
        )}

        {step === 2 && (
          <section className="step">
            <button className="linkish back" onClick={() => setStep(1)}>← Change payment method</button>
            <Deposit api={API} amount={0.5} onCredited={(b) => { setBalance(b); setStep(3); }} />
          </section>
        )}

        {step === 3 && (
          <section className="step">
            <p className="waiting done"><span className="pip" />Credited</p>
            <h2 className="step-h center">Your key is funded</h2>
            <p className="step-sub center">
              Balance <b>${balance.toFixed(4)}</b>. It never expires.
            </p>
            <div className="done-actions">
              <Link className="btn primary lg" href="/chat">Open the playground →</Link>
              <Link className="btn lg" href="/docs/quickstart">Read the quickstart</Link>
            </div>
          </section>
        )}

        {note && <p className="note bad">{note}</p>}
      </main>
  );
}
