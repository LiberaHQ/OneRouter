"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/chrome/CopyButton";
import { money, tokens } from "@/lib/content/format";
import { modelUrlPath } from "@/lib/content/modelUrl";
import type { Model } from "@/lib/content/data";

const MODALITY_ICON: Record<string, [string, string]> = {
  text: ["T", "Text input"],
  image: ["▣", "Image input"],
  pdf: ["▤", "Document input"],
  video: ["▶", "Video input"],
};

const PAGE_SIZE = 25;

type SortKey = "order" | "in" | "out" | "ctx" | "max" | "name";

export function ModelCatalog({ models, showLabel = true }: { models: Model[]; showLabel?: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("order");
  const [mod, setMod] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = models.map((m, i) => ({ m, i }));
    if (q) {
      rows = rows.filter(({ m }) => `${m.id} ${m.name} ${m.author}`.toLowerCase().includes(q));
    }
    if (mod) {
      rows = rows.filter(({ m }) => m.input_modalities.includes(mod));
    }
    if (freeOnly) {
      rows = rows.filter(({ m }) => m.tags.includes("free"));
    }
    const sorted = [...rows];
    switch (sort) {
      case "in":
        sorted.sort((a, b) => a.m.per_m.in - b.m.per_m.in);
        break;
      case "out":
        sorted.sort((a, b) => a.m.per_m.out - b.m.per_m.out);
        break;
      case "ctx":
        sorted.sort((a, b) => b.m.context_length - a.m.context_length);
        break;
      case "max":
        sorted.sort((a, b) => b.m.max_output - a.m.max_output);
        break;
      case "name":
        sorted.sort((a, b) => a.m.name.localeCompare(b.m.name));
        break;
      default:
        sorted.sort((a, b) => a.i - b.i);
    }
    return sorted.map((r) => r.m);
  }, [models, query, sort, mod, freeOnly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  function setModFilter(next: string) {
    setMod(next);
    setPage(0);
  }

  return (
    <>
      {showLabel && <h2 className="cat-label">All models</h2>}
      <div className="cat-controls">
        <input
          type="search"
          id="model-search"
          placeholder="Search model name or ID"
          aria-label="Search models"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          id="model-sort"
          aria-label="Sort models"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="order">Catalog order</option>
          <option value="in">Cheapest input</option>
          <option value="out">Cheapest output</option>
          <option value="ctx">Largest context</option>
          <option value="max">Largest output</option>
          <option value="name">A–Z</option>
        </select>
      </div>
      <div className="chips" role="group" aria-label="Filter by input">
        <button className="chip" aria-pressed={mod === ""} onClick={() => setModFilter("")}>
          All inputs
        </button>
        <button className="chip" aria-pressed={mod === "text"} onClick={() => setModFilter("text")}>
          Text
        </button>
        <button className="chip" aria-pressed={mod === "image"} onClick={() => setModFilter("image")}>
          Image input
        </button>
        <button className="chip" aria-pressed={mod === "pdf"} onClick={() => setModFilter("pdf")}>
          Documents
        </button>
        <button className="chip" aria-pressed={mod === "video"} onClick={() => setModFilter("video")}>
          Video
        </button>
        <button
          className="chip"
          aria-pressed={freeOnly}
          onClick={() => {
            setFreeOnly((v) => !v);
            setPage(0);
          }}
        >
          Free models
        </button>
      </div>

      <p className="count">
        <span id="model-count">{filtered.length}</span> models
      </p>

      <div className="table-wrap">
        <table id="model-table">
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
            {pageRows.map((m) => {
              const tags = m.tags.slice(0, 2);
              const badges = m.input_modalities.filter((k) => k in MODALITY_ICON);
              return (
                <tr key={m.id}>
                  <td>
                    <div className="m-row">
                      <span className="m-badge" aria-hidden="true">
                        {m.author.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="m-text">
                        <span className="m-name">
                          <Link href={modelUrlPath(m.id)}>{m.name}</Link>
                          {tags.map((t) => (
                            <span className={`tag t-${t}`} key={t}>
                              {t}
                            </span>
                          ))}
                        </span>
                        <CopyButton text={m.id} className="m-id">
                          {m.id}
                        </CopyButton>
                      </span>
                    </div>
                  </td>
                  <td className="num">{tokens(m.context_length)}</td>
                  <td className="num">{tokens(m.max_output)}</td>
                  <td className="num">{money(m.per_m.in)}</td>
                  <td className="num">{money(m.per_m.out)}</td>
                  <td className="mods">
                    {badges.map((k) => (
                      <span className="mod" title={MODALITY_ICON[k][1]} aria-label={MODALITY_ICON[k][1]} key={k}>
                        {MODALITY_ICON[k][0]}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="cat-none" id="model-none">
            No model matches that. Try clearing a filter.
          </p>
        )}
      </div>

      <nav className="pager" aria-label="Catalog pages">
        <button
          className="linkish"
          id="page-prev"
          disabled={clampedPage === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← Previous
        </button>
        <span id="page-label">
          Page {clampedPage + 1} of {pageCount}
        </span>
        <button
          className="linkish"
          id="page-next"
          disabled={clampedPage >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
        >
          Next →
        </button>
      </nav>
    </>
  );
}
