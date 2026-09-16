import type { Metadata } from "next";
import { loadModels } from "@/lib/content/data";
import { Calculator } from "@/components/pricing/Calculator";
import { BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Pricing · ${BRAND}`,
  description:
    "Estimate a workload against live catalog rates. 0% deposit fee, 0% markup on open-weight routes, credit that never expires.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  const models = loadModels();
  return (
    <main className="page narrow">
      <section className="split">
        <div>
          <span className="kicker">Inspectable pricing</span>
          <h1>
            Pay the rate.
            <br />
            Nothing on top.
          </h1>
          <p className="sub">
            Fund with crypto and spend through one OpenAI-compatible API. No deposit fee, and no markup on
            open-weight routes.
          </p>
          <div className="hero-cta">
            <a className="btn primary lg" href="/keys">
              Get a key
            </a>
            <a className="btn lg" href="/models">
              Browse models
            </a>
          </div>
        </div>
        <Calculator models={models} />
      </section>

      <section className="strip three-up">
        <div>
          <b>0%</b>
          <span>Crypto deposit fee. Your deposit becomes the same dollar value in credit.</span>
        </div>
        <div>
          <b>0%</b>
          <span>Markup on open-weight routes. You pay the provider&rsquo;s rate.</span>
        </div>
        <div>
          <b>∞</b>
          <span>No credit expiry. It stays on the key until you spend it.</span>
        </div>
      </section>

      <section className="band tight">
        <div className="band-head">
          <h2>Where a router can take a cut</h2>
          <p>There are exactly two places. Both are zero on an open-weight route.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th className="num">Deposit fee</th>
                <th className="num">Per-token markup</th>
                <th className="num">$10 buys</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{BRAND} — crypto, open-weight</td>
                <td className="num">0%</td>
                <td className="num">0%</td>
                <td className="num">$10.00</td>
              </tr>
              <tr>
                <td>{BRAND} — crypto, cleared commercial route</td>
                <td className="num">0%</td>
                <td className="num">5%</td>
                <td className="num">$9.52</td>
              </tr>
              <tr>
                <td>{BRAND} — card</td>
                <td className="num">3.5%</td>
                <td className="num">0–5%</td>
                <td className="num">$9.65</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note">
          Every API response reports the charge it actually incurred in{" "}
          <code>x-onerouter-cost-usd</code>, so you can check the arithmetic after the call too.
        </p>
      </section>
    </main>
  );
}
