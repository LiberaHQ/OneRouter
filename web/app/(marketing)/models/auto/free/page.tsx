import type { Metadata } from "next";
import { loadModels } from "@/lib/content/data";
import { tokens } from "@/lib/content/format";
import { codeBlock } from "@/lib/markdown/codeBlock";
import { API, BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Open Tier availability · ${BRAND}`,
  description:
    "Live availability for onerouter/auto:free — what it resolves to, and the account quotas that apply.",
  alternates: { canonical: "/models/auto/free" },
};

export default function AutoFreePage() {
  const models = loadModels();
  const free =
    models.find((m) => m.id === "openrouter/free") ??
    models.find((m) => m.tags.includes("free")) ??
    models[0];

  const snippet = codeBlock(
    "shell",
    `curl ${API}/me/open-tier \\
  -H "Authorization: Bearer $ONEROUTER_KEY"

{"eligible": true, "requests_remaining": 43, "tokens_remaining": 91204,
 "resets_at": "2026-09-10T00:00:00Z", "max_output_per_request": 2048}`
  );

  return (
    <main className="page narrow">
      <section className="page-head">
        <div className="crumbs">
          <a href="/models">Models</a> <span>/</span> <span>Open Tier</span>
        </div>
        <span className="kicker">Availability</span>
        <h1>Open Tier is available</h1>
        <p className="sub">
          This page is the discovery surface for <code>onerouter/auto:free</code>. When the alias is not
          listed here, requests to it answer{" "}
          <a href="/docs/errors#no_free_route">503 no_free_route</a> rather than falling back to a paid
          model.
        </p>
      </section>

      <div className="strip three-up">
        <div>
          <b>Listed</b>
          <span>The free alias is resolving right now</span>
        </div>
        <div>
          <b>{free.name}</b>
          <span>Current resolution, {tokens(free.context_length)} context</span>
        </div>
        <div>
          <b>$0.00</b>
          <span>Customer charge, permanently</span>
        </div>
      </div>

      <h2 className="sec">Current resolution</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alias</th>
              <th>Resolves to</th>
              <th className="num">Context</th>
              <th className="num">Max output</th>
              <th className="num">Charge</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>onerouter/auto:free</code>
              </td>
              <td>
                <code>{free.id}</code>
              </td>
              <td className="num">{tokens(free.context_length)}</td>
              <td className="num">{tokens(free.max_output)}</td>
              <td className="num">Free</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        Naming that model directly uses the same free path and shares the same quotas. A different model
        priced at $0 in the catalog does <em>not</em> — it is still a paid route that takes a hold.
      </p>

      <h2 className="sec">Your allowance</h2>
      <p>Quotas are per account and reset at 00:00 UTC. Query them at any time:</p>
      <div dangerouslySetInnerHTML={{ __html: snippet }} />
      <p className="note">
        Setup, limits and refusals are documented on the <a href="/docs/open-tier">Open Tier page</a>.
      </p>
    </main>
  );
}
