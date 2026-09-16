"use client";

import { useMemo, useState } from "react";
import type { Model } from "@/lib/content/data";

const PRESETS: Array<[string, number, number]> = [
  ["Chat", 500000, 40000],
  ["Coding agent", 5000000, 300000],
  ["Long documents", 25000000, 150000],
];

function usd(v: number): string {
  if (v === 0) return "$0.00";
  if (v < 1) {
    let s = v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `$${s}`;
  }
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Calculator({ models }: { models: Model[] }) {
  const sorted = useMemo(() => [...models].sort((a, b) => a.per_m.in - b.per_m.in), [models]);
  const defaultModel = sorted.find((m) => m.id === "deepseek/deepseek-v4-flash") ?? sorted[0];

  const [modelId, setModelId] = useState(defaultModel?.id ?? "");
  const [tokensIn, setTokensIn] = useState(500000);
  const [tokensOut, setTokensOut] = useState(40000);
  const [activePreset, setActivePreset] = useState(0);

  const model = sorted.find((m) => m.id === modelId) ?? defaultModel;
  const costIn = model ? (tokensIn / 1_000_000) * model.per_m.in : 0;
  const costOut = model ? (tokensOut / 1_000_000) * model.per_m.out : 0;
  const total = costIn + costOut;

  return (
    <div className="calc" id="calc">
      <div className="calc-bar">
        <span>Estimate a workload</span>
        <span className="mono">USD</span>
      </div>
      <label className="field">
        <span>Model</span>
        <select id="calc-model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {sorted.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.per_m.in === 0 ? "Free" : `$${m.per_m.in.toLocaleString("en-US", { maximumFractionDigits: 4 })}`}/1M in
            </option>
          ))}
        </select>
      </label>
      <div className="preset" role="group" aria-label="Workload presets">
        {PRESETS.map(([label, pin, pout], i) => (
          <button
            key={label}
            className="chip"
            aria-pressed={activePreset === i}
            onClick={() => {
              setActivePreset(i);
              setTokensIn(pin);
              setTokensOut(pout);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Input tokens</span>
        <input
          type="number"
          id="calc-in"
          value={tokensIn}
          min={0}
          step={1000}
          onChange={(e) => {
            setTokensIn(Number(e.target.value) || 0);
            setActivePreset(-1);
          }}
        />
      </label>
      <label className="field">
        <span>Output tokens</span>
        <input
          type="number"
          id="calc-out"
          value={tokensOut}
          min={0}
          step={1000}
          onChange={(e) => {
            setTokensOut(Number(e.target.value) || 0);
            setActivePreset(-1);
          }}
        />
      </label>
      <div className="calc-out">
        <span className="calc-label">Estimated cost</span>
        <strong id="calc-total">{usd(total)}</strong>
        <span className="calc-split" id="calc-split">
          {usd(costIn)} in · {usd(costOut)} out
        </span>
      </div>
      <p className="note">
        Uses published token rates. Cached input, request charges and provider tiers can change the final
        figure — the response header is the truth.
      </p>
    </div>
  );
}
