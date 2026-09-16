import Link from 'next/link';
import type { Metadata } from 'next';
import Catalog, { type Row } from '@/components/Catalog';
import { Header, Footer } from '@/components/Chrome';
import { BRAND, models, money, tokens } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Browse AI models',
  description:
    `Every model available through ${BRAND}, with context windows, output limits, ` +
    'input types and current per-token prices.',
};

export default function ModelsPage() {
  // Shaped on the server so the client component ships numbers and labels, not the
  // formatting rules — prices then read identically to every other surface.
  const rows: Row[] = models().map((m) => ({
    id: m.id,
    name: m.name,
    author: m.author,
    ctx: m.context_length,
    max: m.max_output,
    in: m.per_m.in,
    out: m.per_m.out,
    mods: m.input_modalities,
    tags: m.tags,
    free: m.tags.includes('free'),
    inLabel: money(m.per_m.in),
    outLabel: money(m.per_m.out),
    ctxLabel: tokens(m.context_length),
    maxLabel: tokens(m.max_output),
  }));

  return (
    <>
      <Header active="models" />
      <main className="page">
        <section className="cat-head">
          <div><h1>Browse<br />AI models</h1></div>
          <div className="cat-head-side">
            <p>Compare models, limits and prices.</p>
            <div className="cat-cta">
              <Link className="btn primary" href="/signin">Get an API key</Link>
              <Link className="btn" href="/docs/models">Read the docs</Link>
            </div>
          </div>
        </section>

        <Catalog rows={rows} />

        <p className="note">
          Prices are USD per million tokens and include the {BRAND} fee. Use each model ID
          exactly as shown in your request — see <Link href="/docs/models">the model guide</Link>{' '}
          for the auto router and fallbacks.
        </p>
      </main>
      <Footer />
    </>
  );
}
