"use client";

import { useMemo, useState } from "react";
import type { ChatModel } from "./types";

export function ModelPicker({
  models,
  currentId,
  onPick,
  onClose,
}: {
  models: ChatModel[];
  currentId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => `${m.id} ${m.name} ${m.author}`.toLowerCase().includes(q));
  }, [models, query]);

  return (
    <div className="chatpick" id="chat-picker">
      <input
        type="search"
        id="chat-search"
        placeholder="Search models"
        aria-label="Search models"
        autoComplete="off"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chatpick-list" id="chat-picker-list" role="listbox" aria-label="Choose a model">
        {filtered.slice(0, 60).map((m) => (
          <button
            key={m.id}
            type="button"
            className="ask"
            role="option"
            aria-selected={m.id === currentId}
            onClick={() => {
              onPick(m.id);
              onClose();
            }}
          >
            {m.name} {m.free ? "· free" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
