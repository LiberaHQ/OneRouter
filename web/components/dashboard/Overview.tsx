"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { getKey, principal, setKey as rememberKey } from "@/lib/api/tokens";
import { CopyButton } from "@/components/chrome/CopyButton";
import { formatUsd } from "@/lib/format";
import type { SessionInfo } from "@/lib/api/types";

export function Overview({ apiUrl, brand }: { apiUrl: string; brand: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<SessionInfo | null>(null);

  /* Browser credentials hydrate after the server render. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setKey(getKey());
    // A session reloads the stable account key from the database into memory.
    const token = principal();
    setSignedIn(!!token);
    if (token) {
      api.session(token)
        .then((session) => {
          rememberKey(session.key);
          setKey(session.key);
          setMe(session);
        })
        .catch(() => {});
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasKey = !!key;
  const masked = key ? `${key.slice(0, 11)}${"•".repeat(20)}` : "";
  const hasCredit = (me?.balance_usd ?? 0) > 0;
  const sentRequest = (me?.requests ?? 0) > 0;
  const done = [hasKey, hasCredit, sentRequest].filter(Boolean).length;

  const setupPrompt = `Use ${brand} for completions.\nBase URL: ${apiUrl}\nAuth header: Authorization: Bearer $ONEROUTER_KEY\nModel ids are author/name, e.g. onerouter/auto for the cheapest paid route.`;

  return (
    <>
      <h1>Overview</h1>
      <p className="dash-sub">Copy the endpoint, check your key, and send a first request.</p>

      <div className="dash-cards">
        <div className="panel">
          <div className="panel-head">Quick start</div>
          <div className="dash-field">
            <span>API key</span>
            {key ? (
              <div className="dash-baseurl">
                <code>{revealed ? key : masked}</code>
                <button className="btn sm" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? "Hide" : "Reveal"}
                </button>
                <CopyButton text={key} className="btn sm" />
              </div>
            ) : (
              <p className="panel-note" style={{ padding: 0 }}>
                {signedIn ? "Loading your account key…" : "No key yet."} <Link href="/keys">Get a key →</Link>
              </p>
            )}
          </div>
          <div className="dash-field">
            <span>Base URL</span>
            <div className="dash-baseurl">
              <code>{apiUrl}</code>
              <CopyButton text={apiUrl} className="btn sm" />
            </div>
          </div>
          <p className="panel-note">Use it in any OpenAI-compatible client.</p>
        </div>

        <div className="panel">
          <div className="panel-head">Set up with your coding agent</div>
          <div className="dash-field">
            <p className="panel-note" style={{ padding: 0, marginBottom: 12 }}>
              Copy one prompt with the endpoint, key variable and model.
            </p>
            <CopyButton text={setupPrompt} className="btn primary sm">
              Copy setup prompt
            </CopyButton>
          </div>
        </div>
      </div>

      <h2 className="sec">Finish setup</h2>
      <div className="dash-progress-label">
        <span>Setup progress</span>
        <span>{done} of 3 complete</span>
      </div>
      <div className="dash-progress">
        <div style={{ width: `${(done / 3) * 100}%` }} />
      </div>
      <ol className="dash-checklist">
        <ChecklistRow n={1} done={hasKey} title="Create an API key" note="One key reaches the current model catalog." href="/keys" cta="Get a key" />
        <ChecklistRow n={2} done={hasCredit} title="Add credit" note="Prepaid. Credit never expires." href="/pay" cta="Add credit" />
        <ChecklistRow
          n={3}
          done={sentRequest}
          title="Send a request"
          note="Change the base URL and key in your client."
          href="/docs/quickstart"
          cta="Quick start"
        />
      </ol>

      <h2 className="sec">Usage</h2>
      <div className="panel">
        <div className="dash-field" style={{ paddingTop: 16 }}>
          {signedIn ? (
            <>
              <div className="dash-stat">
                <span>Balance</span>
                <b>{formatUsd(me?.balance_usd ?? 0)}</b>
              </div>
              <div className="dash-stat">
                <span>Spent</span>
                <b>{formatUsd(me?.spent_usd ?? 0)}</b>
              </div>
              <div className="dash-stat">
                <span>Requests</span>
                <b>{me?.requests ?? 0}</b>
              </div>
            </>
          ) : (
            <p className="panel-note" style={{ padding: 0 }}>
              <Link href="/signin">Sign in</Link> to see your balance and usage.
            </p>
          )}
        </div>
      </div>

    </>
  );
}

function ChecklistRow({
  n,
  done,
  title,
  note,
  href,
  cta,
}: {
  n: number;
  done: boolean;
  title: string;
  note: string;
  href: string;
  cta: string;
}) {
  return (
    <li>
      <span className={done ? "dash-check done" : "dash-check"}>{done ? "✓" : n}</span>
      <div className="dash-check-body">
        <b>{title}</b>
        <span>{note}</span>
      </div>
      <Link className="btn sm" href={href}>
        {cta} ›
      </Link>
    </li>
  );
}
