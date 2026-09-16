import type { Metadata } from "next";
import { loadStatus } from "@/lib/content/data";
import { BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Status · ${BRAND}`,
  description: "Live host health, gateway error rates and first-token latency, checked directly from the edge.",
  alternates: { canonical: "/status" },
};

export default function StatusPage() {
  const st = loadStatus();
  const { providers, families, gateway } = st;
  const down = providers.filter((p) => p.state !== "operational");
  const headline = down.length === 0 ? "All systems operational" : `${down.length} of ${providers.length} hosts degraded`;

  return (
    <main className="page narrow">
      <section className="page-head">
        <span className="kicker">Live service health</span>
        <h1>{headline}</h1>
        <p className="sub">
          Direct generation checks from the {BRAND} edge, every five minutes. A passing check means we
          reached that host and it returned generated output.
        </p>
        <div className="snapshot">
          <div>
            <span>Checked</span>
            <b className="mono">{st.checked_at}</b>
          </div>
          <div>
            <span>Hosts</span>
            <b>
              {providers.length - down.length}/{providers.length}
            </b>
          </div>
          <div>
            <span>Families</span>
            <b>{families.length}</b>
          </div>
          <div>
            <span>Open incidents</span>
            <b>0</b>
          </div>
        </div>
      </section>

      <h2 className="sec">Host access</h2>
      <div className="hosts">
        {providers.map((p) => (
          <div className={`host ${p.state}`} key={p.name}>
            <div className="host-top">
              <span className="dot" />
              <b>{p.name}</b>
              <span className="state">{p.state}</span>
            </div>
            <code>{p.sample}</code>
            <span className="lat">{p.latency_ms ? `${p.latency_ms}ms` : "—"}</span>
          </div>
        ))}
      </div>

      <h2 className="sec">Gateway</h2>
      <div className="strip four-up">
        <div>
          <b>{gateway.error_rate_24h}%</b>
          <span>Error rate, 24h</span>
        </div>
        <div>
          <b>{gateway.error_rate_7d}%</b>
          <span>Error rate, 7d</span>
        </div>
        <div>
          <b>{gateway.ttft_median_ms}ms</b>
          <span>First token, median</span>
        </div>
        <div>
          <b>{gateway.ttft_p95_ms}ms</b>
          <span>First token, p95</span>
        </div>
      </div>
      <p className="note">
        Errors counted here are ours: upstream failures, timeouts and exhausted retries. Cancelled or
        refused requests do not count against us — and neither should they count in our favour, so they
        are excluded rather than scored.
      </p>

      <h2 className="sec">Model families</h2>
      <div className="fams">
        {families.map((f) => (
          <div className="fam" key={f.author}>
            <b>{f.author}</b>
            <span>
              {f.healthy} routes · {f.models} models
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
