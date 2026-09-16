'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { store } from '@/lib/format';

type ModelRow = {
  model: string; requests: number; prompt_tokens: number;
  completion_tokens: number; cost_usd: number; ttft_ms_avg: number;
};
type DayRow = { day: string; requests: number; cost_usd: number; tokens: number };
type Receipt = {
  id: string; model: string; provider: string; prompt_tokens: number;
  completion_tokens: number; cost_usd: number; ttft_ms: number; free: boolean;
  created: number;
};
type Usage = {
  account: string; created: number; identities: string[];
  balance_usd: number; spent_usd: number; arc_address: string; arc_chain_id: number;
  totals: {
    requests: number; prompt_tokens: number; completion_tokens: number;
    total_tokens: number; cost_usd: number; free_requests: number;
  };
  by_model: ModelRow[]; by_day: DayRow[]; recent: Receipt[];
  open_tier: {
    requests_remaining: number; requests_limit: number;
    tokens_remaining: number; tokens_limit: number;
  };
  history_capped_at: number; receipts_held: number;
};

const cash = (v: number, dp = 4) => `$${v.toFixed(dp)}`;
const num = (v: number) => v.toLocaleString('en-US');
const when = (unix: number) =>
  new Date(unix * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

export default function Dashboard({ api }: { api: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const token = () => store('or-session') || store('or-key');

  const load = useCallback(async () => {
    const auth = token();
    if (!auth) { setError('no-key'); return; }
    try {
      const res = await fetch(`${api}/usage`, { headers: { Authorization: `Bearer ${auth}` } });
      if (res.status === 401) { setError('no-key'); return; }
      if (!res.ok) throw new Error(`the gateway answered ${res.status}`);
      setUsage(await res.json());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const sweep = async () => {
    setBusy(true);
    setNote('Checking the chain…');
    try {
      const res = await fetch(`${api}/pay/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? `answered ${res.status}`);
      const credited = (data.credited ?? []) as { credited_usd: number }[];
      setNote(credited.length
        ? `Credited ${cash(credited.reduce((a, c) => a + c.credited_usd, 0), 6)} from the chain.`
        : 'Nothing outstanding on your deposit address.');
      await load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error === 'no-key') {
    return (
      <main className="page narrow">
        <section className="page-head">
          <span className="kicker">Dashboard</span>
          <h1>No key on this device</h1>
          <p className="sub">
            The dashboard reads one key&apos;s own credit and usage. There is no account
            behind it, so it needs the key itself.
          </p>
          <div className="hero-cta">
            <Link className="btn primary lg" href="/signin">Get a key →</Link>
            <Link className="btn lg" href="/chat">Open the playground</Link>
          </div>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page narrow">
        <section className="page-head">
          <h1>Dashboard</h1>
          <p className="note bad">Could not reach the gateway — {error}.</p>
        </section>
      </main>
    );
  }

  if (!usage) {
    return (
      <main className="page narrow">
        <section className="page-head"><h1>Dashboard</h1><p className="sub">Loading…</p></section>
      </main>
    );
  }

  const { totals, open_tier: quota } = usage;
  const peak = Math.max(...usage.by_day.map((d) => d.cost_usd), 0);
  const spendShare = (c: number) => (totals.cost_usd ? (c / totals.cost_usd) * 100 : 0);

  return (
    <main className="page narrow">
      <section className="page-head">
        <div className="crumbs"><Link href="/">Home</Link> <span>/</span> <span>Dashboard</span></div>
        <span className="kicker">Dashboard</span>
        <h1>Credit and usage</h1>
        <p className="sub">
          Everything here comes from the receipts your own requests produced — the same
          figures each response carried in its <code>x-onerouter-*</code> headers.
        </p>
        <div className="urlchip"><code>{usage.account}</code></div>
      </section>

      <div className="strip four-up">
        <div><b>{cash(usage.balance_usd)}</b><span>Credit remaining</span></div>
        <div><b>{cash(usage.spent_usd, 6)}</b><span>Spent all time</span></div>
        <div><b>{num(totals.requests)}</b><span>Requests answered</span></div>
        <div><b>{num(totals.total_tokens)}</b><span>Tokens in + out</span></div>
      </div>

      <h2 className="sec">Credit</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            <tr><td>Balance</td><td className="num">{cash(usage.balance_usd, 6)}</td></tr>
            <tr><td>Spent</td><td className="num">{cash(usage.spent_usd, 6)}</td></tr>
            <tr>
              <td>Deposit address <span className="tag t-cheap">chain {usage.arc_chain_id}</span></td>
              <td className="num"><code>{usage.arc_address}</code></td>
            </tr>
            <tr><td>Key created</td><td className="num">{when(usage.created)}</td></tr>
            <tr>
              <td>Signs in with</td>
              <td className="num">{usage.identities.length ? usage.identities.join(', ') : 'nothing — the key is the account'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="auth-actions" style={{ marginTop: 14 }}>
        <Link className="btn primary" href="/pay">Add credit →</Link>
        <button className="btn" onClick={() => void sweep()} disabled={busy}>
          {busy ? 'Checking…' : 'Check for deposits'}
        </button>
      </div>
      {note && <p className="step-note">{note}</p>}

      <h2 className="sec">Free tier today</h2>
      <p>Quotas reset at 00:00 UTC. Paid requests are unaffected by them.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Allowance</th><th className="num">Remaining</th><th className="num">Limit</th><th>Used</th></tr></thead>
          <tbody>
            <tr>
              <td>Requests</td>
              <td className="num">{num(quota.requests_remaining)}</td>
              <td className="num">{num(quota.requests_limit)}</td>
              <td><Bar pct={100 - (quota.requests_remaining / quota.requests_limit) * 100} /></td>
            </tr>
            <tr>
              <td>Tokens</td>
              <td className="num">{num(quota.tokens_remaining)}</td>
              <td className="num">{num(quota.tokens_limit)}</td>
              <td><Bar pct={100 - (quota.tokens_remaining / quota.tokens_limit) * 100} /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="sec">Spend by model</h2>
      {usage.by_model.length === 0 ? (
        <p className="note">
          Nothing sent yet. <Link href="/chat">Open the playground</Link> and the first
          request will show up here.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th><th className="num">Requests</th><th className="num">Tokens</th>
                <th className="num">Cost</th><th className="num">Mean TTFT</th><th>Share</th>
              </tr>
            </thead>
            <tbody>
              {usage.by_model.map((m) => (
                <tr key={m.model}>
                  <td><Link href={`/models/${m.model}`}>{m.model}</Link></td>
                  <td className="num">{num(m.requests)}</td>
                  <td className="num">{num(m.prompt_tokens + m.completion_tokens)}</td>
                  <td className="num">{m.cost_usd ? cash(m.cost_usd, 6) : 'Free'}</td>
                  <td className="num">{m.ttft_ms_avg}ms</td>
                  <td><Bar pct={spendShare(m.cost_usd)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {usage.by_day.length > 0 && (
        <>
          <h2 className="sec">By day</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Day</th><th className="num">Requests</th><th className="num">Tokens</th><th className="num">Cost</th><th>Relative</th></tr></thead>
              <tbody>
                {[...usage.by_day].reverse().map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td className="num">{num(d.requests)}</td>
                    <td className="num">{num(d.tokens)}</td>
                    <td className="num">{d.cost_usd ? cash(d.cost_usd, 6) : 'Free'}</td>
                    <td><Bar pct={peak ? (d.cost_usd / peak) * 100 : 0} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="sec">Recent requests</h2>
      {usage.recent.length === 0 ? (
        <p className="note">No requests yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th><th>Model</th><th>Host</th><th className="num">In</th>
                <th className="num">Out</th><th className="num">TTFT</th>
                <th className="num">Cost</th><th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {usage.recent.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.created)}</td>
                  <td><code>{r.model}</code></td>
                  <td>{r.provider}</td>
                  <td className="num">{num(r.prompt_tokens)}</td>
                  <td className="num">{num(r.completion_tokens)}</td>
                  <td className="num">{r.ttft_ms}ms</td>
                  <td className="num">
                    {r.free ? <span className="tag t-free">free</span> : cash(r.cost_usd, 6)}
                  </td>
                  <td><code>{r.id}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="note">
        The gateway keeps the last {num(usage.history_capped_at)} receipts in total and is
        holding {num(usage.receipts_held)} of yours, so a long-lived key&apos;s earliest
        requests roll off. Balance and spend totals are cumulative and are not affected.
      </p>
    </main>
  );
}

/** A share bar. Deliberately plain: the number beside it is the fact, this is the shape. */
function Bar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className="usebar" title={`${clamped.toFixed(1)}%`} aria-hidden="true">
      <span style={{ width: `${clamped}%` }} />
    </span>
  );
}
