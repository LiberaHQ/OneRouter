"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getKey, setKey as saveKeyToStorage, hasKey as hasKeyStored } from "@/lib/api/tokens";
import { api } from "@/lib/api/client";
import { streamChat } from "@/lib/api/stream";
import {
  loadConversations,
  saveConversations,
  getLastModel,
  setLastModel,
  newConversationId,
  type Conversation,
  type ChatTurn,
} from "@/lib/api/chatStorage";
import { Sidebar } from "./Sidebar";
import { ModelPicker } from "./ModelPicker";
import { Mark } from "@/components/chrome/Mark";
import type { ChatModel } from "./types";

const SUGGESTIONS = ["Help me turn an idea into a plan", "Explain something complicated simply", "Review a piece of code"];

export function ChatApp({
  models,
  defaultModelId,
  apiUrl,
  brand,
}: {
  models: ChatModel[];
  defaultModelId: string;
  apiUrl: string;
  brand: string;
}) {
  const [key, setKeyState] = useState<string | null>(null);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [modelId, setModelId] = useState(defaultModelId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [keygateOpen, setKeygateOpen] = useState(false);
  const [keygatePaste, setKeygatePaste] = useState(false);
  const [pastedKey, setPastedKey] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setKeyState(getKey());
    setConvos(loadConversations());
    setModelId(getLastModel() || defaultModelId);
    setKeygateOpen(!hasKeyStored());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!key) return;
    api.me(key).then((m) => setBalance(m.balance_usd)).catch(() => setBalance(null));
  }, [key]);

  useEffect(() => {
    saveConversations(convos);
  }, [convos]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  });

  const currentModel = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const current = useMemo(() => convos.find((c) => c.id === currentId) ?? null, [convos, currentId]);
  const turns = current?.turns ?? [];

  function newChat() {
    const id = newConversationId();
    setConvos((prev) => [{ id, title: "", turns: [] }, ...prev]);
    setCurrentId(id);
  }

  function selectConvo(id: string) {
    setCurrentId(id);
  }

  function deleteConvo(id: string) {
    setConvos((prev) => prev.filter((c) => c.id !== id));
    if (currentId === id) setCurrentId(null);
  }

  function pickModel(id: string) {
    setModelId(id);
    setLastModel(id);
  }

  function updateTurns(convoId: string, updater: (turns: ChatTurn[]) => ChatTurn[]) {
    setConvos((prev) =>
      prev.map((c) => (c.id === convoId ? { ...c, turns: updater(c.turns), title: c.title || turns0Title(updater(c.turns)) } : c))
    );
  }

  function turns0Title(t: ChatTurn[]): string {
    const first = t.find((x) => x.role === "user");
    return first ? first.content.slice(0, 60) : "";
  }

  async function send(e?: React.SyntheticEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    if (!key) {
      setKeygateOpen(true);
      return;
    }

    let convoId = currentId;
    if (!convoId) {
      convoId = newConversationId();
      setConvos((prev) => [{ id: convoId!, title: "", turns: [] }, ...prev]);
      setCurrentId(convoId);
    }
    setInput("");
    setSending(true);

    const userTurn: ChatTurn = { role: "user", content: text };
    updateTurns(convoId, (t) => [...t, userTurn]);

    const history = [...(convos.find((c) => c.id === convoId)?.turns ?? []), userTurn].map((t) => ({
      role: t.role === "error" ? "assistant" : t.role,
      content: t.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    updateTurns(convoId, (t) => [...t, { role: "assistant", content: "", model: modelId }]);

    let acc = "";
    try {
      for await (const ev of streamChat(key, modelId, history, controller.signal)) {
        if (ev.error) {
          const dest = errorDestination(ev.error.code);
          updateTurns(convoId, (t) => {
            const copy = [...t];
            copy[copy.length - 1] = {
              role: "error",
              content: `${ev.error!.message}${dest ? ` — see ${dest}` : ""}`,
            };
            return copy;
          });
          break;
        }
        if (ev.delta) {
          acc += ev.delta;
          const snapshot = acc;
          updateTurns(convoId, (t) => {
            const copy = [...t];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: snapshot };
            return copy;
          });
        }
        if (ev.meta) {
          const meta = ev.meta;
          updateTurns(convoId, (t) => {
            const copy = [...t];
            copy[copy.length - 1] = { ...copy[copy.length - 1], meta };
            return copy;
          });
          setBalance(meta.balance_usd);
        }
      }
    } catch {
      // aborted or network failure — leave whatever text accumulated
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function saveKey() {
    const k = pastedKey.trim();
    if (!k) return;
    saveKeyToStorage(k);
    setKeyState(k);
    setKeygateOpen(false);
  }

  return (
    <div className="app" id="chat" data-api={apiUrl} data-model={modelId}>
      <Sidebar
        brand={brand}
        conversations={convos}
        currentId={currentId}
        balance={balance}
        hasKey={!!key}
        onNewChat={newChat}
        onSelect={selectConvo}
        onDelete={deleteConvo}
      />

      <main className="chatmain">
        <header className="chattop">
          <button
            type="button"
            className="modelpick"
            id="chat-pick"
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
            onClick={() => setPickerOpen((v) => !v)}
          >
            <span className="modeldot" aria-hidden="true" />
            <span id="chat-pick-name">{currentModel?.name ?? modelId}</span>
            <span className="caret" aria-hidden="true">
              ▾
            </span>
          </button>
          <span className="spacer" />
          <a className="btn sm" href="/signin" id="account">
            Account
          </a>
        </header>

        {pickerOpen && <ModelPicker models={models} currentId={modelId} onPick={pickModel} onClose={() => setPickerOpen(false)} />}

        <div className="chatscroll" id="chat-log" ref={logRef}>
          {turns.length === 0 ? (
            <div className="chathero" id="chat-empty">
              <Mark />
              <h1>What would you like to explore?</h1>
              <div className="asks">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="ask" onClick={() => setInput(s)}>
                    <span>{s}</span>
                    <span className="ask-go">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) => (
              <div className={`turn ${t.role === "user" ? "me" : t.role === "error" ? "err" : "ai"}`} key={i}>
                <div className="who">{t.role === "user" ? "You" : t.role === "error" ? "Error" : "Assistant"}</div>
                <div className="bubble">{t.content || (sending && i === turns.length - 1 ? "…" : "")}</div>
                {t.meta && (
                  <div className="meta">
                    {t.meta.provider} · {t.meta.ttft_ms}ms · ${t.meta.cost_usd?.toFixed(6)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="composer">
          <div className="composer-in">
            <label className="spend">
              <input type="checkbox" id="spend" defaultChecked />
              <span>Use my credit for this request</span>
            </label>
            <span className="dot">·</span>
            <a href="/pricing">View model prices</a>
          </div>
          <form className="composer-box" id="chat-form" onSubmit={send}>
            <textarea
              id="chat-input"
              rows={1}
              placeholder="Ask anything…"
              aria-label="Message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="composer-foot">
              <span className="mode" id="mode">
                {currentModel?.free ? "Free chat" : "Paid chat"}
              </span>
              <span className="spacer" />
              <button
                type={sending ? "button" : "submit"}
                className={sending ? "send stop" : "send"}
                id="chat-send"
                aria-label={sending ? "Stop" : "Send message"}
                onClick={sending ? stop : undefined}
              >
                {sending ? "■" : "↑"}
              </button>
            </div>
          </form>
          <p className="disclaimer">
            Models can be wrong — check anything that matters. Requests go straight to <code>{apiUrl}</code> from this
            browser.
          </p>
        </div>
      </main>

      {keygateOpen && (
        <div className="keygate" id="keygate">
          <div className="keygate-box">
            <h2>You need a key to chat</h2>
            <p>Keys are minted without an account. It takes one click, and the free model costs nothing to try.</p>
            <div className="keygate-actions">
              <a className="btn primary" href="/signin">
                Get a key →
              </a>
              <button className="btn" id="keygate-paste" onClick={() => setKeygatePaste(true)}>
                I already have one
              </button>
            </div>
            {keygatePaste && (
              <div id="keygate-form">
                <input
                  type="password"
                  id="chat-key"
                  placeholder="or-live-…"
                  autoComplete="off"
                  aria-label="Your API key"
                  value={pastedKey}
                  onChange={(e) => setPastedKey(e.target.value)}
                />
                <button className="btn primary" id="chat-key-save" onClick={saveKey}>
                  Use key
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function errorDestination(code: string): string | null {
  const map: Record<string, string> = {
    invalid_api_key: "/docs/authentication",
    insufficient_credit: "/pay",
    rate_limited: "/docs/errors#rate_limited",
    model_unavailable: "/docs/failover",
  };
  return map[code] ?? null;
}
