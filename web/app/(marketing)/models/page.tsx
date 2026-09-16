import type { Metadata } from "next";
import { loadModels } from "@/lib/content/data";
import { ModelCatalog } from "@/components/catalog/ModelCatalog";
import { BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Browse AI models · ${BRAND}`,
  description: `Every model available through ${BRAND}, with context windows, output limits, input types and current per-token prices.`,
  alternates: { canonical: "/models" },
};

export default function ModelsPage() {
  const models = loadModels();
  return (
    <main className="page" id="catalog">
      <section className="cat-head">
        <div>
          <h1>
            Browse
            <br />
            AI models
          </h1>
        </div>
        <div className="cat-head-side">
          <p>Compare models, limits and prices.</p>
          <div className="cat-cta">
            <a className="btn primary" href="/signin">
              Get an API key
            </a>
            <a className="btn" href="/docs/models">
              Read the docs
            </a>
          </div>
        </div>
      </section>

      <ModelCatalog models={models} />

      <p className="note">
        Prices are USD per million tokens and include the {BRAND} fee. Use each model ID exactly as shown
        in your request — see <a href="/docs/models">the model guide</a> for the auto router and
        fallbacks.
      </p>
    </main>
  );
}
