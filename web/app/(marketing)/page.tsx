import type { Metadata } from "next";
import { loadModels } from "@/lib/content/data";
import { money } from "@/lib/content/format";
import { heroTabs } from "@/lib/content/snippets";
import { codeBlock } from "@/lib/markdown/codeBlock";
import { BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `${BRAND} — one key for every model, no account`,
  description:
    "An OpenAI-compatible LLM gateway. One prepaid key reaches every model, with same-model host failover, per-key budgets and no KYC.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const models = loadModels();
  const cheapest = models.reduce((min, m) => (m.per_m.in < min.per_m.in ? m : min), models[0]);
  const heroTabsHtml = codeBlock("", "", heroTabs());

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-copy">
          <a className="pill" href="/docs/open-tier">
            <span className="dot" />
            Open Tier — $0, no deposit <span className="arrow">→</span>
          </a>
          <h1>
            One key.
            <br />
            Every model.
            <br />
            No account.
          </h1>
          <p className="sub">
            An OpenAI-compatible gateway with same-model host failover. Change the base URL and the key;
            nothing else in your code moves.
          </p>
          <div className="hero-cta">
            <a className="btn primary lg" href="/keys">
              Get a key
            </a>
            <a className="btn lg" href="/docs/quickstart">
              Read the quickstart →
            </a>
          </div>
          <p className="microcopy">No signup. No card. Keys exist before payment.</p>
        </div>
        <div className="hero-panel">
          <div className="receipt">
            <div className="receipt-bar">
              <span className="lang">POST /v1/chat/completions</span>
              <span className="ok">200</span>
            </div>
            <dl className="kv">
              <div>
                <dt>x-onerouter-model</dt>
                <dd>meta-llama/llama-3.3-70b-instruct</dd>
              </div>
              <div>
                <dt>x-onerouter-provider</dt>
                <dd>groq</dd>
              </div>
              <div>
                <dt>x-onerouter-ttft-ms</dt>
                <dd>118</dd>
              </div>
              <div>
                <dt>x-onerouter-cost-usd</dt>
                <dd>0.000241</dd>
              </div>
              <div>
                <dt>x-onerouter-balance-usd</dt>
                <dd>12.406</dd>
              </div>
              <div>
                <dt>x-onerouter-receipt</dt>
                <dd>rcp_8fa2e1c0</dd>
              </div>
            </dl>
            <p className="receipt-note">
              Every response carries its own receipt. You never have to trust the pricing page.
            </p>
          </div>
        </div>
      </section>

      <section className="strip">
        <div>
          <b>0%</b>
          <span>deposit fee on crypto rails</span>
        </div>
        <div>
          <b>{models.length}</b>
          <span>models behind one key</span>
        </div>
        <div>
          <b>{money(cheapest.per_m.in)}</b>
          <span>per 1M input, cheapest route</span>
        </div>
        <div>
          <b>None</b>
          <span>KYC, ever — there is no account to verify</span>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <h2>Two lines change. Nothing else does.</h2>
          <p>
            Any OpenAI-compatible client works: SDKs, coding agents, chat frontends, proxies. If it takes a
            base URL and a key, it takes {BRAND}.
          </p>
        </div>
        <div dangerouslySetInnerHTML={{ __html: heroTabsHtml }} />
        <p className="band-foot">
          <a href="/docs/integrations">
            Literal setup for Claude Code, Codex, Cursor, Cline, Zed, Aider, LiteLLM and SillyTavern →
          </a>
        </p>
      </section>

      <section className="band">
        <div className="band-head">
          <h2>Set it up once.</h2>
          <p>Three steps. Nothing to install, no account to manage.</p>
        </div>
        <div className="three">
          <div className="step-card">
            <span className="n">01</span>
            <h3>Save your access</h3>
            <p>
              Setup returns an API key and a permanent recovery link. Both are secrets. Save them before a
              payment address is shown.
            </p>
            <code>or-live-… + recovery link</code>
          </div>
          <div className="step-card">
            <span className="n">02</span>
            <h3>Add credit</h3>
            <p>
              Pick a crypto rail. Direct stablecoin deposits start at $0.50; aggregated rails start at $5.
              The deposit becomes the same dollar value in credit.
            </p>
            <code>$0.50+ → prepaid credit</code>
          </div>
          <div className="step-card">
            <span className="n">03</span>
            <h3>Point your client</h3>
            <p>
              Paste the base URL and the key. The client appends the endpoint itself — do not add{" "}
              <code>/chat/completions</code> by hand.
            </p>
            <code>base URL + key → client</code>
          </div>
        </div>
      </section>

      <section className="band tight">
        <div className="band-head">
          <h2>Know the tradeoffs.</h2>
          <p>Stated here, before payment — not discovered later in the terms.</p>
        </div>
        <div className="tradeoffs">
          <div>
            <b>No withdrawals.</b> Credit buys inference and never converts back. A withdrawal path would
            make us a money transmitter, and money transmitters must collect identity. That is the trade
            that keeps this accountless.
          </div>
          <div>
            <b>Save both secrets.</b> Lose the key and the recovery link and there is no personal recovery —
            there is no identity attached to recover to.
          </div>
          <div>
            <b>Restricted frontier models need your own key.</b> Provider terms prohibit reselling, so the
            resale inventory is open-weight and cleared routes only.
          </div>
          <div>
            <b>Credit never expires.</b> Your balance sits until you spend it. Expiring credit is a dark
            pattern; ours does not.
          </div>
          <div>
            <b>No content retention by default.</b> Debug capture is opt-in per key and expires in 60
            minutes. Your prompt still transits the upstream that serves it.
          </div>
          <div>
            <b>Failover is a capability, not an SLA.</b> We move between hosts of the same model before the
            first byte. After it, the route is committed.
          </div>
        </div>
      </section>

      <section className="cta">
        <h2>Turn a $0.50 deposit into every model.</h2>
        <div className="hero-cta">
          <a className="btn primary lg" href="/keys">
            Get a key
          </a>
          <a className="btn lg" href="/models">
            Browse {models.length} models →
          </a>
        </div>
        <p className="microcopy">No account. No KYC. Cancel by simply not spending it.</p>
      </section>
    </main>
  );
}
