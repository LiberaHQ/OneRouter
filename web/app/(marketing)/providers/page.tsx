import type { Metadata } from "next";
import { loadModels, loadStatus } from "@/lib/content/data";
import { BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Providers · ${BRAND}`,
  description: "Every model host behind the catalog, with its route coverage and current state.",
  alternates: { canonical: "/providers" },
};

export default function ProvidersPage() {
  const models = loadModels();
  const st = loadStatus();
  const counts = new Map<string, string[]>();
  for (const m of models) {
    for (const h of m.hosts) {
      if (!counts.has(h)) counts.set(h, []);
      counts.get(h)!.push(m.id);
    }
  }
  const state = new Map(st.providers.map((p) => [p.name, p.state]));
  const entries = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <main className="page narrow">
      <section className="page-head">
        <span className="kicker">Host directory</span>
        <h1>The routes behind the catalog</h1>
        <p className="sub">
          Which hosts are enabled, how much of the catalog each one covers, and the model IDs reachable
          through it. Failover moves between hosts on this page — never between models.
        </p>
      </section>
      <div className="provs">
        {entries.map(([h, ids]) => {
          const sortedIds = [...ids].sort();
          const shown = sortedIds.slice(0, 4);
          const extra = sortedIds.length - 4;
          return (
            <div className="prov" key={h}>
              <div className="prov-top">
                <span className="dot" />
                <b>{h}</b>
                <span className="state">{state.get(h) ?? "operational"}</span>
              </div>
              <div className="prov-num">
                {ids.length}
                <em>routes</em>
              </div>
              <div className="prov-ids">
                {shown.map((id) => (
                  <code key={id}>{id}</code>
                ))}
                {extra > 0 && <span className="more">+{extra} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="note">
        A model&rsquo;s page names the hosts that can serve it. Pin one with <code>provider.only</code> to
        refuse failover; see <a href="/docs/failover">failover</a>. Host state above is live.
      </p>
    </main>
  );
}
