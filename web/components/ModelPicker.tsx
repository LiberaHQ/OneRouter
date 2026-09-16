'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatModel } from '@/lib/types';
import { usd } from '@/lib/format';

/** The top-bar model chooser: searchable, grouped by author, 420 entries. */
export default function ModelPicker({
  models, current, onPick,
}: { models: ChatModel[]; current: ChatModel; onPick: (m: ChatModel) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = models.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q));
    const byAuthor = new Map<string, ChatModel[]>();
    for (const m of hits) {
      const list = byAuthor.get(m.author) ?? [];
      list.push(m);
      byAuthor.set(m.author, list);
    }
    return [...byAuthor.entries()];
  }, [models, query]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="modelpick"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => { setOpen(!open); setQuery(''); }}
      >
        <span className="modeldot" aria-hidden="true" />
        <span>{current.name}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="chatpick" ref={box}>
          <input
            autoFocus
            type="search"
            placeholder="Search models"
            aria-label="Search models"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="chatpick-list" role="listbox" aria-label="Choose a model">
            {groups.length === 0 && <p className="chat-none">No model matches that.</p>}
            {groups.map(([author, list]) => (
              <div key={author}>
                <div className="chat-group">{author}</div>
                {list.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chat-opt"
                    role="option"
                    aria-selected={m.id === current.id}
                    onClick={() => { onPick(m); setOpen(false); }}
                  >
                    <span className="chat-opt-txt">
                      <b>{m.name}</b>
                      <code>{m.id}</code>
                    </span>
                    <span className={`tag ${m.free ? 't-free' : 't-cheap'}`}>
                      {m.free ? 'free' : usd(m.in)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
