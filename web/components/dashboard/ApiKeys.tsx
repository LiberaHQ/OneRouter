"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { getKey, principal, setKey as saveKey } from "@/lib/api/tokens";
import { CopyButton } from "@/components/chrome/CopyButton";
import { formatUsd } from "@/lib/format";
import { ApiError } from "@/lib/api/types";
import type { MeInfo } from "@/lib/api/types";

export function ApiKeys() {
  const [key, setKeyState] = useState<string | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);

  /* Browser credentials hydrate after the server render. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const k = getKey();
    setKeyState(k);
    const token = principal();
    if (token) {
      api.session(token)
        .then((session) => {
          saveKey(session.key);
          setKeyState(session.key);
          return api.me(session.key);
        })
        .then(setMe)
        .catch(() => {});
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function rotate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const rotated = await api.rotateKey(recovery.trim());
      saveKey(rotated.key);
      setKeyState(rotated.key);
      setRecovery("");
      setRevealed(true);
      setStatus({ text: "Key rotated. The old key stopped working immediately." });
      const m = await api.me(rotated.key);
      setMe(m);
    } catch (err) {
      setStatus({ text: err instanceof ApiError ? err.message : "Could not rotate the key.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  const masked = key ? `${key.slice(0, 11)}${"•".repeat(20)}` : "";

  return (
    <>
      <h1>API Keys</h1>
      <p className="dash-sub">One key reaches the current model catalog.</p>

      <div className="panel">
        <div className="panel-head">Current key</div>
        <div className="dash-field" style={{ paddingTop: 16 }}>
          {key ? (
            <>
              <div className="dash-baseurl">
                <code>{revealed ? key : masked}</code>
                <button className="btn sm" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? "Hide" : "Reveal"}
                </button>
                <CopyButton text={key} className="btn sm" />
              </div>
              {me && (
                <div style={{ marginTop: 16 }}>
                  <div className="dash-stat">
                    <span>Balance</span>
                    <b>{formatUsd(me.balance_usd)}</b>
                  </div>
                  <div className="dash-stat">
                    <span>Requests</span>
                    <b>{me.requests}</b>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="panel-note" style={{ padding: 0 }}>
              No key is available for this account yet. <Link href="/keys">Get a key →</Link>
            </p>
          )}
        </div>
      </div>

      <h2 className="sec">Rotate key</h2>
      <div className="panel">
        <div className="dash-field" style={{ paddingTop: 16 }}>
          <p className="panel-note" style={{ padding: 0, marginBottom: 14 }}>
            Spend the recovery secret shown when this key was created for a fresh key. The old key stops working
            immediately — there is no grace window.
          </p>
          <form onSubmit={rotate} className="auth-actions" style={{ gap: 8 }}>
            <input
              type="password"
              placeholder="or-rec-…"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
              required
              style={{
                flex: 1,
                minWidth: 220,
                height: 36,
                padding: "0 12px",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--line)",
                background: "var(--bg)",
                color: "var(--text)",
                font: "400 13.5px var(--mono)",
              }}
            />
            <button className="btn primary" disabled={busy} type="submit">
              Rotate
            </button>
          </form>
          {status && <p className={status.bad ? "auth-status bad" : "auth-status ok"}>{status.text}</p>}
        </div>
      </div>
    </>
  );
}
