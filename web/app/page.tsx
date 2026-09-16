import Link from 'next/link';
import { Header, Footer } from '@/components/Chrome';
import { API, BRAND, models, money, tokens } from '@/lib/site';

export default function Home() {
  const catalog = models();
  const cheapest = catalog.reduce((a, b) => (a.per_m.in <= b.per_m.in ? a : b));
  const paid = catalog.filter((m) => m.per_m.in > 0);
  const cheapestPaid = paid.reduce((a, b) => (a.per_m.in <= b.per_m.in ? a : b));

  return (
    <>
      <Header />
      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <Link className="pill" href="/docs/open-tier">
              <span className="dot" /> Open Tier — $0, no deposit <span className="arrow">→</span>
            </Link>
            <h1>One key.<br />Every model.<br />No account.</h1>
            <p className="sub">
              An OpenAI-compatible gateway with same-model host failover. Change the base
              URL and the key; nothing else in your code moves.
            </p>
            <div className="hero-cta">
              <Link className="btn primary lg" href="/signin">Get a key</Link>
              <Link className="btn lg" href="/docs/quickstart">Read the quickstart →</Link>
            </div>
            <p className="microcopy">No signup. No card. Keys exist before payment.</p>
          </div>

          <div className="hero-panel">
            <div className="code">
              <div className="code-bar">
                <span className="label">POST /v1/chat/completions</span>
                <span className="tag t-free">200</span>
              </div>
              <dl className="kv">
                <div><dt>x-onerouter-model</dt><dd>{cheapestPaid.id}</dd></div>
                <div><dt>x-onerouter-provider</dt><dd>{cheapestPaid.hosts[0]}</dd></div>
                <div><dt>x-onerouter-ttft-ms</dt><dd>118</dd></div>
                <div><dt>x-onerouter-cost-usd</dt><dd>0.000241</dd></div>
                <div><dt>x-onerouter-balance-usd</dt><dd>12.406</dd></div>
                <div><dt>x-onerouter-receipt</dt><dd>rcp_8fa2e1c0</dd></div>
              </dl>
              <p className="note">
                Every response carries its own receipt. You never have to trust the pricing page.
              </p>
            </div>
          </div>
        </section>

        <div className="strip four-up">
          <div><b>0%</b><span>deposit fee on crypto rails</span></div>
          <div><b>{catalog.length}</b><span>models behind one key</span></div>
          <div><b>{money(cheapest.per_m.in)}</b><span>per 1M input, cheapest route</span></div>
          <div><b>None</b><span>KYC, ever — there is no account to verify</span></div>
        </div>

        <h2 className="sec">Point any client at it</h2>
        <p>
          The base URL is <code>{API}</code>. Send a model id from{' '}
          <Link href="/models">the catalog</Link> — the largest context window on offer is{' '}
          {tokens(Math.max(...catalog.map((m) => m.context_length)))}.
        </p>
        <p className="note">
          {BRAND} is OpenAI-compatible, so any client that speaks Chat Completions works
          unchanged. Per-client configuration is on <Link href="/docs/integrations">client setup</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
