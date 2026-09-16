'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '@/lib/format';

type Rail = {
  ready: boolean; reason: string; network: string; chain_id: number;
  minimum_usd: number; confirmations: number; mainnet: boolean; explorer: string | null;
};

type Seen = { tx: string; block: number; units: number; explorer_url?: string };

type Dep = {
  reference: string; address: string; suggested_usd: number; chain_id: number;
  network: string; confirmations: number; mainnet: boolean; status: string;
  received_usd?: number; balance_usd?: number; confirmations_seen?: number;
  seen?: Seen[]; chain_error?: string;
};

const LABEL: Record<string, string> = {
  waiting: 'Waiting', pending: 'Seen — confirming', credited: 'Credited', expired: 'Expired',
};

/** The deposit screen, shared by /pay and the last step of /keys. */
export default function Deposit({
  api, amount, onCredited,
}: { api: string; amount: number; onCredited?: (balance: number) => void }) {
  const [rail, setRail] = useState<Rail | null>(null);
  const [dep, setDep] = useState<Dep | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${api}/pay/methods`).then((r) => r.json()).then(({ arc }) => setRail(arc))
      .catch(() => setError('Could not reach the gateway.'));
  }, [api]);

  const token = () => store('or-session') || store('or-key');

  const open = useCallback(async () => {
    const auth = token();
    if (!auth) { setError('You need a key first.'); return; }
    try {
      const res = await fetch(`${api}/pay/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ amount_usd: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? `answered ${res.status}`);
      setDep(data);
    } catch (e) { setError((e as Error).message); }
  }, [api, amount]);

  useEffect(() => { void open(); }, [open]);

  // Poll while the deposit is outstanding. Cleared on credit, expiry or unmount.
  useEffect(() => {
    if (!dep) return;
    const auth = token();
    const tick = async () => {
      try {
        const res = await fetch(`${api}/pay/deposit/${dep.reference}`, {
          headers: { Authorization: `Bearer ${auth}` },
        });
        if (!res.ok) return;
        const now: Dep = await res.json();
        setDep((prev) => ({ ...prev!, ...now }));
        if (now.status === 'credited') {
          if (poll.current) clearInterval(poll.current);
          onCredited?.(Number(now.balance_usd ?? 0));
        } else if (now.status === 'expired' && poll.current) {
          clearInterval(poll.current);
        }
      } catch {
        /* a polling blip is not worth surfacing; the next tick retries */
      }
    };
    poll.current = setInterval(tick, 5000);
    void tick();
    return () => { if (poll.current) clearInterval(poll.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, dep?.reference]);

  if (error && !dep) return <p className="note bad">{error}</p>;
  if (rail && !rail.ready) {
    return (
      <p className="note bad">
        <b>Deposits are not configured on this gateway.</b> {rail.reason}. There is no
        address to show, and this page will not invent one.
      </p>
    );
  }
  if (!dep) return <p className="note">Opening a deposit…</p>;

  const state = dep.status === 'pending'
    ? `Seen — ${dep.confirmations_seen ?? 0}/${dep.confirmations} confirmations`
    : (LABEL[dep.status] ?? dep.status);

  return (
    <>
      <p className={`waiting${dep.status === 'credited' ? ' done' : ''}`}>
        <span className="pip" />{state}
      </p>
      <h2 className="step-h center">Send USDC</h2>
      <p className="step-sub center">{dep.network} · ${rail?.minimum_usd ?? 0.5} minimum</p>

      {dep.mainnet && (
        <p className="livewarn">
          <b>Live network.</b> Arc mainnet (chain {dep.chain_id}). USDC sent to this
          address is real money and the transfer cannot be reversed. Check the address
          before sending.
        </p>
      )}

      <div className="paycard">
        <div className="qrbox">
          {/* The QR is rendered by the gateway, which reads it back and refuses to
              serve one that does not decode to this exact address. */}
          <img src={`${api}/pay/deposit/${dep.reference}/qr.svg`} width={196} height={196}
            alt="Your deposit address as a QR code" />
        </div>
        <div className="paycard-side">
          <div className="addr">
            <span className="addr-label">Your {dep.network} deposit address</span>
            <code>{dep.address}</code>
          </div>
          <div className="addr">
            <span className="addr-label">Suggested amount</span>
            <code>{Number(dep.suggested_usd).toFixed(2)} USDC</code>
          </div>
          <p className="watching"><span className="pip" />Watching now</p>
          <p className="watch-note">Checking every 5s · detection can take up to a minute</p>
          <div className="paycard-actions">
            <button
              className={`btn primary${copied ? ' done' : ''}`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(dep.address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1300);
                } catch { /* clipboard blocked */ }
              }}
            >
              {copied ? 'Copied' : 'Copy address'}
            </button>
            {dep.seen?.at(-1)?.explorer_url && (
              <a className="btn" href={dep.seen.at(-1)!.explorer_url} target="_blank" rel="noopener">
                View on the explorer ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {(dep.seen?.length ?? 0) > 0 && (
        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table>
            <thead><tr><th>Received</th><th className="num">Amount</th><th>Transaction</th></tr></thead>
            <tbody>
              {[...dep.seen!].reverse().map((t) => (
                <tr key={t.tx}>
                  <td>block {t.block}</td>
                  <td className="num">{(t.units / 1e6).toFixed(6)} USDC</td>
                  <td>
                    {t.explorer_url
                      ? <a href={t.explorer_url} target="_blank" rel="noopener">{t.tx.slice(0, 18)}…</a>
                      : `${t.tx.slice(0, 18)}…`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dep.received_usd ? (
        <p className="step-note">
          <b>
            Received {Number(dep.received_usd).toFixed(6)} USDC · balance $
            {Number(dep.balance_usd ?? 0).toFixed(4)}
          </b>
        </p>
      ) : (
        <p className="step-note">
          Nothing has arrived at this address yet. It is watched continuously, so you can
          close this page — the credit lands whenever the transfer does.
        </p>
      )}
      {dep.chain_error && <p className="step-note bad">{dep.chain_error}</p>}

      <details className="help">
        <summary>Payment help</summary>
        <ul>
          <li><b>Any amount works.</b> This address belongs to your key alone, so whatever arrives is credited.</li>
          <li><b>Right network.</b> Arc, chain {dep.chain_id}. USDC sent on another chain does not arrive and cannot be recovered.</li>
          <li><b>Native asset.</b> USDC is Arc&apos;s gas token — send it as an ordinary transfer, no approval or contract call.</li>
          <li><b>Nothing to keep open.</b> Leaving this page does not cancel anything; the transfer credits your key whenever it lands.</li>
        </ul>
      </details>
      <p className="note"><Link href="/chat">Open the playground →</Link></p>
    </>
  );
}
