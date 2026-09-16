'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Mark from './Mark';
import ModelPicker from './ModelPicker';
import ThemeToggle from './ThemeToggle';
import { setStore, store, usd } from '@/lib/format';
import type { ChatModel, Convo, Meter, Turn } from '@/lib/types';

const SUGGESTIONS = [
  'Help me turn an idea into a plan',
  'Explain something complicated simply',
  'Review a piece of code',
];

/** Errors worth their own wording, keyed by the gateway's status. */
const KNOWN: Record<number, [string, string, string]> = {
  401: ['That key was refused.', '/docs/authentication', 'authentication →'],
  402: ['This key has no credit left.', '/pay', 'add credit →'],
  429: ['Rate limited — wait a moment and send it again.', '/docs/errors#rate_limited', 'rate limits →'],
  503: ['No host could serve that model right now.', '/docs/failover', 'failover →'],
};

export default function Chat({
  models, api, brand, defaultId, freeId,
}: { models: ChatModel[]; api: string; brand: string; defaultId: string; freeId: string }) {
  const [model, setModel] = useState<ChatModel>(
    () => models.find((m) => m.id === defaultId) ?? models[0],
  );
  const [spend, setSpend] = useState(true);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState('—');
  const [hasKey, setHasKey] = useState(true);
  const [keyDraft, setKeyDraft] = useState('');
  const [pasting, setPasting] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // The model actually sent: unticking "use my credit" routes to the free one.
  const effective = spend ? model : (models.find((m) => m.id === freeId) ?? model);

  const refresh = useCallback(async () => {
    const key = store('or-key');
    setHasKey(!!key);
    if (!key) { setBalance('—'); return; }
    try {
      // Ask the gateway to sweep this account's deposit address first: a transfer that
      // landed while nothing was watching should show up here, not stay invisible.
      await fetch(`${api}/pay/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: '{}',
      }).catch(() => undefined);
      const res = await fetch(`${api}/me`, { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) {
        const me = await res.json();
        setBalance(`$${Number(me.balance_usd).toFixed(4)}`);
      } else if (res.status === 401) {
        setHasKey(false);
      }
    } catch {
      setBalance('—');
    }
  }, [api]);

  useEffect(() => {
    try {
      setConvos(JSON.parse(store('or-convos') || '[]'));
    } catch {
      setConvos([]);
    }
    const saved = store('or-model');
    if (saved) {
      const found = models.find((m) => m.id === saved);
      if (found) setModel(found);
    }
    void refresh();
  }, [models, refresh]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns]);

  const persist = (next: Convo[]) => {
    setConvos(next);
    setStore('or-convos', JSON.stringify(next.slice(0, 60)));
  };

  const newChat = () => {
    abort.current?.abort();
    setActiveId(null);
    setTurns([]);
    setDraft('');
    box.current?.focus();
  };

  const open = (convo: Convo) => {
    abort.current?.abort();
    setActiveId(convo.id);
    setTurns(convo.turns);
  };

  const remove = (id: string) => {
    persist(convos.filter((c) => c.id !== id));
    if (activeId === id) newChat();
  };

  const send = async (text: string) => {
    const key = store('or-key');
    if (!key) { setHasKey(false); return; }
    const sending = effective;

    const history: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(history);
    setDraft('');
    setBusy(true);

    let convoId = activeId;
    if (!convoId) {
      convoId = `c${Date.now()}`;
      setActiveId(convoId);
      persist([{ id: convoId, title: text.trim().slice(0, 44) || 'New chat', turns: history }, ...convos]);
    }

    abort.current = new AbortController();
    let assistant: Turn = { role: 'assistant', content: '', model: sending.name };
    setTurns([...history, assistant]);

    try {
      const res = await fetch(`${api}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: sending.id,
          stream: true,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
        signal: abort.current.signal,
      });

      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.error?.message ?? ''; } catch { /* not JSON */ }
        const [msg, href, label] = KNOWN[res.status] ??
          [`The gateway answered ${res.status}.`, '/docs/errors', 'error catalog →'];
        setTurns([...history, { role: 'assistant', content: `__ERR__${detail || msg}__${href}__${label}` }]);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text2 = '';
      let meta = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) text2 += delta;
              if (parsed.x_onerouter) {
                const m: Meter = parsed.x_onerouter;
                const cost = Number(m.cost_usd);
                meta =
                  `${m.provider} · ${m.ttft_ms}ms to first token · ` +
                  `${parsed.usage ? `${parsed.usage.total_tokens} tokens · ` : ''}` +
                  `${cost ? `$${cost.toFixed(6)}` : 'free'} · ${m.receipt}`;
                setBalance(`$${Number(m.balance_usd).toFixed(4)}`);
              }
            } catch {
              /* keep-alive or a split frame; the next read completes it */
            }
          }
        }
        assistant = { role: 'assistant', content: text2, model: sending.name, meta };
        setTurns([...history, assistant]);
      }

      const finished: Turn[] = [...history, { ...assistant, content: text2 || '(the model returned nothing)', meta }];
      setTurns(finished);
      persist(
        convos.some((c) => c.id === convoId)
          ? convos.map((c) => (c.id === convoId ? { ...c, turns: finished } : c))
          : [{ id: convoId!, title: text.trim().slice(0, 44), turns: finished }, ...convos],
      );
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      setTurns([...history, {
        role: 'assistant',
        content: aborted
          ? '__ERR__Stopped before the reply finished.____'
          : `__ERR__Could not reach ${api}. The gateway is unreachable from this browser, ` +
            'or it refused the cross-origin request.__/status__check status →',
      }]);
    } finally {
      setBusy(false);
      abort.current = null;
      box.current?.focus();
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) { abort.current?.abort(); return; }
    const text = draft.trim();
    if (text) void send(text);
  };

  const saveKey = () => {
    const value = keyDraft.trim();
    if (!value) return;
    setStore('or-key', value);
    setKeyDraft('');
    setPasting(false);
    void refresh();
  };

  return (
    <div className={`app${sideOpen ? ' side-open' : ''}`}>
      <aside className="side">
        <div className="side-head">
          <Link className="brand" href="/"><Mark /><span>{brand}</span></Link>
          <button className="btn icon-btn ghost" id="side-close" aria-label="Hide the sidebar"
            onClick={() => setSideOpen(false)}>⇤</button>
        </div>
        <button className="btn newchat" onClick={newChat}>
          <span aria-hidden="true">+</span> New chat
        </button>
        <nav className="side-nav">
          <Link href="/chat" aria-current="page">Chat</Link>
          <Link href="/docs/integrations">Use in your app</Link>
          <Link href="/models">Browse models</Link>
        </nav>
        <div className="side-scroll">
          <h4 className="side-label">Conversations</h4>
          <div className="convos">
            {convos.map((c) => (
              <button
                key={c.id}
                type="button"
                className="convo"
                {...(c.id === activeId ? { 'aria-current': 'true' } : {})}
                onClick={() => open(c)}
              >
                <span className="convo-name">{c.title}</span>
                <span
                  className="convo-x"
                  role="button"
                  aria-label={`Delete ${c.title}`}
                  onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
          {convos.length === 0 && (
            <p className="side-empty">
              Nothing saved yet. Conversations stay on this device unless you clear them.
            </p>
          )}
        </div>
        <div className="side-foot">
          <p className="side-note">
            Your conversations stay on this device. The key is stored here too, and is only
            ever sent to the gateway.
          </p>
          <div className="credits">
            <div>
              <span className="credits-label">Available credit</span>
              <b>{balance}</b>
            </div>
            <Link className="btn sm" href="/pay">Add credit</Link>
          </div>
          <div className="side-base">
            <span className={`key-state${hasKey ? ' on' : ''}`}>{hasKey ? 'Key set' : 'No key'}</span>
            <span className="spacer" />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="chatmain">
        <header className="chattop">
          <button className="btn icon-btn ghost" id="side-open" aria-label="Show the sidebar"
            onClick={() => setSideOpen(true)}>☰</button>
          <ModelPicker
            models={models}
            current={model}
            onPick={(m) => { setModel(m); setStore('or-model', m.id); }}
          />
          <span className="spacer" />
          <span className="rate">
            {effective.free ? 'Free · Open Tier' : `${usd(effective.in)} in · ${usd(effective.out)} out / 1M`}
          </span>
          <Link className="btn sm" href="/signin">Account</Link>
        </header>

        <div className="chatscroll" ref={log}>
          {turns.length === 0 ? (
            <div className="chathero">
              <Mark />
              <h1>What would you like to explore?</h1>
              <div className="asks">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="ask" onClick={() => void send(s)}>
                    <span>{s}</span><span className="ask-go">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) => {
              if (t.role === 'assistant' && t.content.startsWith('__ERR__')) {
                const [, msg, href, label] = t.content.split('__');
                return (
                  <div key={i} className="turn err">
                    <span className="who">Not sent</span>
                    <div className="bubble">
                      {msg}{' '}
                      {href && <Link href={href}>{label}</Link>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className={`turn ${t.role === 'user' ? 'me' : 'ai'}`}>
                  <span className="who">{t.role === 'user' ? 'You' : (t.model ?? effective.name)}</span>
                  <div className="bubble">
                    {t.content}
                    {busy && i === turns.length - 1 && t.role === 'assistant' && (
                      <span className="caretblink" />
                    )}
                  </div>
                  {t.meta && <span className="meta">{t.meta}</span>}
                </div>
              );
            })
          )}
        </div>

        <div className="composer">
          <div className="composer-in">
            <label className="spend">
              <input type="checkbox" checked={spend} onChange={(e) => setSpend(e.target.checked)} />
              <span>Use my credit for this request</span>
            </label>
            <span className="dot">·</span>
            <Link href="/pricing">View model prices</Link>
          </div>
          <form className="composer-box" onSubmit={submit}>
            <textarea
              ref={box}
              rows={1}
              placeholder="Ask anything…"
              aria-label="Message"
              value={draft}
              disabled={busy}
              onChange={(e) => {
                setDraft(e.target.value);
                const el = e.target as HTMLTextAreaElement;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 190) + 2}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const text = draft.trim();
                  if (text && !busy) void send(text);
                }
              }}
            />
            <div className="composer-foot">
              <span className="mode">{effective.free ? 'Free chat' : 'Paid chat'}</span>
              <span className="spacer" />
              <button
                type="submit"
                className={`send${busy ? ' stop' : ''}`}
                aria-label={busy ? 'Stop generating' : 'Send message'}
              >
                {busy ? '■' : '↑'}
              </button>
            </div>
          </form>
          <p className="disclaimer">
            Models can be wrong — check anything that matters. Requests go straight to{' '}
            <code>{api}</code> from this browser.
          </p>
        </div>

        {!hasKey && (
          <div className="keygate">
            <div className="keygate-box">
              <h2>You need a key to chat</h2>
              <p>
                Keys are minted without an account. It takes one click, and the free model
                costs nothing to try.
              </p>
              <div className="keygate-actions">
                <Link className="btn primary" href="/signin">Get a key →</Link>
                <button className="btn" onClick={() => setPasting(true)}>I already have one</button>
              </div>
              {pasting && (
                <div id="keygate-form">
                  <input
                    autoFocus
                    type="password"
                    placeholder="or-live-…"
                    aria-label="Your API key"
                    autoComplete="off"
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveKey(); } }}
                  />
                  <button className="btn primary" onClick={saveKey}>Use key</button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
