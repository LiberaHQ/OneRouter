"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { getKey } from "@/lib/api/tokens";
import { CopyButton } from "@/components/chrome/CopyButton";
import type { MeInfo } from "@/lib/api/types";
import type { ChangelogMonth } from "@/lib/content/data";

export function Overview({
  apiUrl,
  brand,
  changelog,
}: {
  apiUrl: string;
  brand: string;
  changelog: ChangelogMonth[];
}) {
  const [key, setKey] = useState<string | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);

  useEffect(() => {
    const k = getKey();
    setKey(k);
    if (k) api.me(k).then(setMe).catch(() => {});
  }, []);

  const hasKey = !!key;
  const hasCredit = (me?.balance_usd ?? 0) > 0;
  const sentRequest = (me?.requests ?? 0) > 0;
  const done = [hasKey, hasCredit, sentRequest].filter(Boolean).length;

  const setupPrompt = `Use ${brand} for completions.\nBase URL: ${apiUrl}\nAuth header: Authorization: Bearer $ONEROUTER_KEY\nModel ids are author/name, e.g. onerouter/auto for the cheapest paid route.`;

  const recentItems = changelog.slice(0, 1).flatMap((m) => m.items.slice(0, 2));

  return (
    <>
      <h1>Overview</h1>
      <p className="dash-sub">Copy the endpoint, check your key, and send a first request.</p>

      <div className="dash-cards">
        <div className="panel">
          <div className="panel-head">Quick start</div>
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
          {key ? (
            <>
              <div className="dash-stat">
                <span>Balance</span>
                <b>${(me?.balance_usd ?? 0).toFixed(2)}</b>
              </div>
              <div className="dash-stat">
                <span>Spent</span>
                <b>${(me?.spent_usd ?? 0).toFixed(2)}</b>
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

      {recentItems.length > 0 && (
        <>
          <div className="head-line" style={{ marginTop: 40, marginBottom: 16, justifyContent: "space-between", display: "flex" }}>
            <h2 className="sec" style={{ margin: 0, border: 0, padding: 0 }}>
              What&rsquo;s new
            </h2>
            <Link href="/changelog">Full changelog →</Link>
          </div>
          <ul className="cl">
            {recentItems.map((item) => (
              <li key={item.title}>
                <div className="cl-meta">
                  <time>{item.date}</time>
                  <span className="cl-tag">{item.tag}</span>
                </div>
                <div className="cl-body">
                  <b>{item.title}</b>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
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
