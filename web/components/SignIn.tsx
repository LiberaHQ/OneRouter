'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { setStore } from '@/lib/format';

type Landed = {
  session: string; account: string; balance_usd: number;
  identities: string[]; new_account: boolean; key?: string; recovery?: string;
};

// Arc's own parameters, so a wallet that has never seen the chain can add it.
const ARC = {
  chainId: '0x13b2', // 5042
  chainName: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.arc.io'],
  blockExplorerUrls: ['https://explorer.arc.io'],
};

export default function SignIn({ api, brand }: { api: string; brand: string }) {
  const [ready, setReady] = useState<Record<string, boolean>>({ email: true, wallet: true });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'idle' | 'email' | 'code'>('idle');
  const [status, setStatus] = useState<{ text: string; kind: string }>({ text: '', kind: '' });
  const [landed, setLanded] = useState<Landed | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [ref, setRef] = useState('');
  const [shownCode, setShownCode] = useState('');

  useEffect(() => {
    fetch(`${api}/auth/methods`)
      .then((r) => r.json())
      .then(({ methods }) => {
        setReady(Object.fromEntries(Object.entries(methods).map(([k, v]) => [k, (v as { ready: boolean }).ready])));
        setNotes(Object.fromEntries(Object.entries(methods).map(([k, v]) => [k, (v as { note: string }).note])));
      })
      .catch(() => setStatus({ text: 'Could not reach the gateway. Is it running?', kind: 'bad' }));
  }, [api]);

  const post = async (path: string, body: unknown) => {
    const res = await fetch(api + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message ?? `gateway answered ${res.status}`);
    return data;
  };

  const land = (data: Landed) => {
    setStore('or-session', data.session);
    if (data.key) setStore('or-key', data.key);
    setLanded(data);
    setMode('idle');
    setStatus({ text: data.new_account ? 'Account created.' : 'Signed in.', kind: 'ok' });
  };

  const sendCode = async () => {
    setStatus({ text: 'Sending…', kind: '' });
    try {
      const out = await post('/auth/email/start', { email: email.trim() });
      setRef(out.ref);
      setShownCode(out.code ?? '');
      setMode('code');
      setStatus({ text: '', kind: '' });
    } catch (e) { setStatus({ text: (e as Error).message, kind: 'bad' }); }
  };

  const login = async () => {
    if (!password) return sendCode();
    setStatus({ text: 'Checking…', kind: '' });
    try { land(await post('/auth/password/login', { email: email.trim(), password })); }
    catch (e) { setStatus({ text: (e as Error).message, kind: 'bad' }); }
  };

  const register = async () => {
    setStatus({ text: 'Creating…', kind: '' });
    try { land(await post('/auth/password/register', { email: email.trim(), password })); }
    catch (e) { setStatus({ text: (e as Error).message, kind: 'bad' }); }
  };

  const verify = async () => {
    setStatus({ text: 'Checking…', kind: '' });
    try { land(await post('/auth/email/verify', { ref, code: code.trim() })); }
    catch (e) { setStatus({ text: (e as Error).message, kind: 'bad' }); }
  };

  const wallet = async () => {
    const evm = (window as unknown as { ethereum?: {
      request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
    } }).ethereum;
    if (!evm) {
      setStatus({
        text: 'No browser wallet found. Arc is EVM-compatible, so any injected wallet works.',
        kind: 'bad',
      });
      return;
    }
    setStatus({ text: 'Check your wallet…', kind: '' });
    try {
      const [address] = (await evm.request({ method: 'eth_requestAccounts' })) as string[];
      try {
        await evm.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC.chainId }] });
      } catch (err) {
        // 4902 is "unrecognised chain" — offer to add it. 4001 is the user declining.
        const code = (err as { code?: number }).code;
        if (code === 4902) await evm.request({ method: 'wallet_addEthereumChain', params: [ARC] });
        else if (code !== 4001) throw err;
      }
      const { ref: challenge, message } = await post('/auth/wallet/challenge', { chain: 'arc', address });
      const signature = await evm.request({ method: 'personal_sign', params: [message, address] });
      land(await post('/auth/wallet/verify', { ref: challenge, signature }));
    } catch (e) {
      const msg = (e as Error).message ?? '';
      setStatus({ text: msg.includes('User rejected') ? 'Signature declined.' : msg, kind: 'bad' });
    }
  };

  return (
    <main className="page auth-page">
      <section className="authbox">
        <h1>Welcome to {brand}</h1>
        <p className="auth-sub">Sign in with an email or a wallet. Either one mints your key.</p>

        <button
          type="button"
          className="auth-row primary"
          disabled={!ready.email}
          title={ready.email ? undefined : notes.email}
          onClick={() => setMode('email')}
        >
          <span>Continue with email</span><span className="arrow">→</span>
        </button>
        <button
          type="button"
          className="auth-row"
          disabled={!ready.wallet}
          title={ready.wallet ? undefined : notes.wallet}
          onClick={() => void wallet()}
        >
          <span>Continue with an Arc wallet</span><span className="arrow">→</span>
        </button>

        <p className="auth-foot">
          Your key is the account. There is no profile behind it, and nothing to fill in.
        </p>

        {landed && (
          <div className="auth-panel">
            <h2>{landed.new_account ? 'Account created' : 'Signed in'}</h2>
            {landed.key ? (
              <>
                <p>
                  This is the only time the key and recovery link are shown. Copy both —
                  losing both loses the balance, because there is no identity attached to
                  recover to.
                </p>
                <dl className="secret"><dt>API key</dt><dd><code>{landed.key}</code></dd></dl>
                <dl className="secret"><dt>Recovery secret</dt><dd><code>{landed.recovery}</code></dd></dl>
              </>
            ) : (
              <p>
                Welcome back. Account <code>{landed.account}</code>, balance $
                {Number(landed.balance_usd).toFixed(2)}.
              </p>
            )}
            <div className="auth-actions">
              <Link className="btn primary" href="/pay">Add credit →</Link>
              <Link className="btn" href="/chat">Open the playground</Link>
            </div>
          </div>
        )}

        {mode === 'email' && (
          <div className="auth-panel">
            <h2>Continue with email</h2>
            <p>Log in with your password, or have a one-time code sent instead.</p>
            <label htmlFor="auth-email">Email address</label>
            <input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="auth-pass">Password</label>
            <input id="auth-pass" type="password" autoComplete="current-password"
              placeholder="Leave empty to get a code instead"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void login(); }} />
            <div className="auth-actions">
              <button className="btn primary" onClick={() => void login()}>Log in</button>
              <button className="btn" onClick={() => void sendCode()}>Email me a code</button>
            </div>
            <p style={{ margin: '14px 0 0' }}>
              New here?{' '}
              <button type="button" className="linkish" onClick={() => void register()}>
                Create an account with a password
              </button>
            </p>
          </div>
        )}

        {mode === 'code' && (
          <div className="auth-panel">
            <h2>Enter the code</h2>
            <p>Sent to <b>{email}</b>. It expires in ten minutes.</p>
            <label htmlFor="auth-code">Six-digit code</label>
            <input id="auth-code" className="code" inputMode="numeric" maxLength={6}
              autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void verify(); }} />
            <div className="auth-actions">
              <button className="btn primary" onClick={() => void verify()}>Continue</button>
            </div>
            {shownCode && (
              <p style={{ marginTop: 12 }}>
                No mail sender is configured on this gateway, so here is the code:{' '}
                <b>{shownCode}</b>
              </p>
            )}
          </div>
        )}

        <p className={`auth-status ${status.kind}`} role="status">{status.text}</p>
      </section>
    </main>
  );
}
