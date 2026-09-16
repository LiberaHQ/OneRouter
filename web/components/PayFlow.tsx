'use client';

import Link from 'next/link';
import { useState } from 'react';
import AmountPicker from '@/components/AmountPicker';
import Deposit from '@/components/Deposit';

import { API } from '@/lib/config';

/** Two steps on two screens. Showing the address beside the amount picker put a live
 *  payment address on screen before anyone had chosen anything. */
export default function PayFlow() {
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState(20);

  return (
      <main className="page narrow">
        <section className="page-head">
          <div className="crumbs"><Link href="/">Home</Link> <span>/</span> <span>Add credit</span></div>
          <span className="kicker">Funding</span>
          <h1>Pay in USDC on Arc.</h1>
          <p className="sub">
            Your key has its own deposit address. Send USDC to it and the credit lands
            once the network confirms.
          </p>
        </section>

        <ol className="flow">
          <li className={step >= 0 ? 'on' : ''}><span>01</span>Amount</li>
          <li className={step >= 1 ? 'on' : ''}><span>02</span>Send USDC</li>
        </ol>

        {step === 0 ? (
          <section className="step">
            <h2 className="step-h">Choose how to pay</h2>
            <div className="rail-opts">
              <label className="rail-opt">
                <input type="radio" name="rail" defaultChecked />
                <span className="ro-body">
                  <b>USDC on Arc</b>
                  <span className="ro-note">Native USDC on Arc · chain 5042</span>
                </span>
                <span className="ro-min">$0.50<em>min</em></span>
                <span className="ro-fee">0%<em>fee</em></span>
              </label>
            </div>
            <h2 className="step-h" style={{ marginTop: 26 }}>How much</h2>
            <p className="step-sub">
              A suggestion only — any amount sent to your address is credited.
            </p>
            <AmountPicker amount={amount} setAmount={setAmount} min={0.5} />
            <button className="btn primary lg wide" onClick={() => setStep(1)}>Continue</button>
            <p className="step-note">
              Credit never expires and is spent only by your own requests.
            </p>
          </section>
        ) : (
          <section className="step">
            <button className="linkish back" onClick={() => setStep(0)}>← Change amount</button>
            <Deposit api={API} amount={amount} />
          </section>
        )}
      </main>
  );
}
