'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type Row = {
  id: string;
  name: string;
  author: string;
  ctx: number;
  max: number;
  in: number;
  out: number;
  mods: string[];
  tags: string[];
  free: boolean;
  inLabel: string;
  outLabel: string;
  ctxLabel: string;
  maxLabel: string;
};

const PER_PAGE = 25;

const MODALITY: Record<string, [string, string]> = {
  text: ['T', 'Text input'],
  image: ['▣', 'Image input'],
  pdf: ['▤', 'Document input'],
  video: ['▶', 'Video input'],
  audio: ['♪', 'Audio input'],
};

const SORTS = [
  ['order', 'Catalog order'],
  ['in', 'Cheapest input'],
  ['out', 'Cheapest output'],
  ['ctx', 'Largest context'],
  ['max', 'Largest output'],
  ['name', 'A–Z'],
] as const;

const FILTERS = [
  ['', 'All inputs'],
  ['text', 'Text'],
  ['image', 'Image input'],
  ['pdf', 'Documents'],
  ['video', 'Video'],
] as const;

export default function Catalog({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<string>('order');
  const [modality, setModality] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [page, setPage] = useState(1);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q && !`${r.id} ${r.name} ${r.author}`.toLowerCase().includes(q)) return false;
      if (freeOnly && !r.free) return false;
      if (modality && !r.mods.includes(modality)) return false;
      return true;
    });
    // A copy per sort: the incoming order is the catalog's own and must survive.
    out = [...out];
    if (sort === 'in') out.sort((a, b) => a.in - b.in);
    else if (sort === 'out') out.sort((a, b) => a.out - b.out);
    else if (sort === 'ctx') out.sort((a, b) => b.ctx - a.ctx);
    else if (sort === 'max') out.sort((a, b) => b.max - a.max);
    else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [rows, query, sort, modality, freeOnly]);

  const pages = Math.max(1, Math.ceil(matched.length / PER_PAGE));
  const current = Math.min(page, pages);
  const slice = matched.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <>
      <h2 className="cat-label">All models</h2>
      <div className="cat-controls">
        <input
          type="search"
          placeholder="Search model name or ID"
          aria-label="Search models"
          autoComplete="off"
          value={query}
          onChange={(e) => reset(setQuery)(e.target.value)}
        />
        <select aria-label="Sort models" value={sort} onChange={(e) => reset(setSort)(e.target.value)}>
          {SORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      <div className="chips" role="group" aria-label="Filter by input">
        {FILTERS.map(([value, label]) => (
          <button
            key={label}
            className="chip"
            aria-pressed={modality === value}
            onClick={() => reset(setModality)(value)}
          >
            {label}
          </button>
        ))}
        <button className="chip" aria-pressed={freeOnly} onClick={() => reset(setFreeOnly)(!freeOnly)}>
          Free models
        </button>
      </div>

      <p className="count"><span>{matched.length}</span> models</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th className="num">Context</th>
              <th className="num">Max output</th>
              <th className="num">Input / 1M</th>
              <th className="num">Output / 1M</th>
              <th>Input</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="m-row">
                    <span className="m-badge" aria-hidden="true">{r.author.slice(0, 2).toUpperCase()}</span>
                    <span className="m-text">
                      <span className="m-name">
                        <Link href={`/models/${r.id}`}>{r.name}</Link>
                        {r.tags.slice(0, 2).map((t) => (
                          <span key={t} className={`tag t-${t}`}>{t}</span>
                        ))}
                      </span>
                      <span className="m-id">{r.id}</span>
                    </span>
                  </div>
                </td>
                <td className="num">{r.ctxLabel}</td>
                <td className="num">{r.maxLabel}</td>
                <td className="num">{r.inLabel}</td>
                <td className="num">{r.outLabel}</td>
                <td className="mods">
                  {r.mods.filter((m) => MODALITY[m]).map((m) => (
                    <span key={m} className="mod" title={MODALITY[m][1]} aria-label={MODALITY[m][1]}>
                      {MODALITY[m][0]}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {slice.length === 0 && (
          <p className="cat-none">No model matches that. Try clearing a filter.</p>
        )}
      </div>

      <nav className="pager" aria-label="Catalog pages">
        <button className="linkish" disabled={current <= 1} onClick={() => setPage(current - 1)}>
          ← Previous
        </button>
        <span>Page {current} of {pages}</span>
        <button className="linkish" disabled={current >= pages} onClick={() => setPage(current + 1)}>
          Next →
        </button>
      </nav>
    </>
  );
}
