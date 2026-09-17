"use client";

import Link from "next/link";
import { Mark } from "@/components/chrome/Mark";
import { ThemeToggle } from "@/components/chrome/ThemeToggle";
import { formatUsd } from "@/lib/format";
import type { Conversation } from "@/lib/api/chatStorage";

export function Sidebar({
  brand,
  conversations,
  currentId,
  balance,
  hasKey,
  onNewChat,
  onSelect,
  onDelete,
}: {
  brand: string;
  conversations: Conversation[];
  currentId: string | null;
  balance: number | null;
  hasKey: boolean;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="side" id="side">
      <div className="side-head">
        <Link className="brand" href="/">
          <Mark />
          <span>{brand}</span>
        </Link>
      </div>
      <button className="btn newchat" id="new-chat" onClick={onNewChat}>
        <span aria-hidden="true">+</span> New chat
      </button>
      <nav className="side-nav">
        <Link href="/chat" aria-current="page">
          Chat
        </Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/docs/integrations">Use in your app</Link>
        <Link href="/models">Browse models</Link>
      </nav>
      <div className="side-scroll">
        <h4 className="side-label">Conversations</h4>
        {conversations.length === 0 ? (
          <p className="side-empty" id="convo-empty">
            Nothing saved yet. Conversations stay on this device unless you clear them.
          </p>
        ) : (
          <div id="convos" className="convos">
            {conversations.map((c) => (
              <div key={c.id} className="convo" aria-current={c.id === currentId ? true : undefined}>
                <button type="button" style={{ all: "unset", flex: 1, cursor: "pointer" }} onClick={() => onSelect(c.id)}>
                  <span className="convo-name">{c.title || "New chat"}</span>
                </button>
                <button
                  type="button"
                  className="convo-x"
                  aria-label="Delete conversation"
                  onClick={() => onDelete(c.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="side-foot">
        <p className="side-note">
          Your conversations stay on this device. The key is stored here too, and is only ever sent to the gateway.
        </p>
        <div className="credits">
          <div>
            <span className="credits-label">Available credit</span>
            <b id="balance">{balance !== null ? formatUsd(balance) : "—"}</b>
          </div>
          <Link className="btn sm" href="/pay">
            Add credit
          </Link>
        </div>
        <div className="side-base">
          <span id="key-state" className={hasKey ? "key-state on" : "key-state"}>
            {hasKey ? "Key set" : "No key"}
          </span>
          <span className="spacer" />
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
