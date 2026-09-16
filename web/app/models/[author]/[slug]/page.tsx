import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Setup from '@/components/Setup';
import { Header, Footer } from '@/components/Chrome';
import { API, BRAND, models, money, splitId, tokens } from '@/lib/site';

type Params = { author: string; slug: string };

/** One page per catalog entry, prerendered. 420 of them build in a couple of seconds. */
export function generateStaticParams(): Params[] {
  return models().map((m) => {
    const [author, slug] = splitId(m.id);
    return { author, slug };
  });
}

function find(params: Params) {
  const id = `${decodeURIComponent(params.author)}/${decodeURIComponent(params.slug)}`;
  return models().find((m) => m.id === id);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const model = find(await params);
  if (!model) return { title: 'Unknown model' };
  return {
    title: model.name,
    description:
      `${model.name} on ${BRAND} — ${money(model.per_m.in)} in / ${money(model.per_m.out)} ` +
      `out per 1M tokens, ${tokens(model.context_length)} context, with copy-ready client setup.`,
  };
}

export default async function ModelPage({ params }: { params: Promise<Params> }) {
  const model = find(await params);
  if (!model) notFound();

  const free = model.tags.includes('free');
  const single = model.hosts.length === 1;

  return (
    <>
      <Header active="models" />
      <main className="page narrow">
        <section className="page-head">
          <div className="crumbs">
            <Link href="/models">Models</Link> <span>/</span>
            <span>{model.author}</span> <span>/</span> <span>{model.name}</span>
          </div>
          <span className="kicker">{model.author}</span>
          <h1>{model.name}</h1>
          {model.tags.length > 0 && (
            <div className="chips">
              {model.tags.map((t) => <span key={t} className={`tag t-${t}`}>{t}</span>)}
            </div>
          )}
          <p className="sub">
            Send this model by its id from any OpenAI-compatible client. One key, one base
            URL, {tokens(model.context_length)} of context.
          </p>
          <div className="urlchip"><code>{model.id}</code></div>
        </section>

        <div className="strip four-up">
          <div><b>{money(model.per_m.in)}</b><span>Input / 1M tokens</span></div>
          <div><b>{money(model.per_m.out)}</b><span>Output / 1M tokens</span></div>
          <div><b>{tokens(model.context_length)}</b><span>Context window</span></div>
          <div><b>{tokens(model.max_output)}</b><span>Maximum output</span></div>
        </div>
        <p className="note">
          {free ? (
            <>This model is free to send. <Link href="/docs/open-tier">Quotas apply</Link>.</>
          ) : (
            <>
              USD per million tokens, {BRAND}&apos;s fee included. A response is charged on the
              attempt that produced it — see <Link href="/docs/billing">billing</Link>.
            </>
          )}
        </p>

        <h2 className="sec">Use this model</h2>
        <p>
          Every snippet carries this model&apos;s id. The base URL and the key are the same
          ones you already use for every other model in the catalog.
        </p>
        <Setup modelId={model.id} modelName={model.name} api={API} brand={BRAND} />
        <p className="note">
          More clients — Cursor, Zed, Continue, Aider, LiteLLM — are on{' '}
          <Link href="/docs/integrations">client setup</Link>.
        </p>

        <h2 className="sec">Specification</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><td>Model ID</td><td><code>{model.id}</code></td></tr>
              <tr><td>Author</td><td>{model.author}</td></tr>
              <tr><td>Context window</td><td>{model.context_length.toLocaleString('en-US')} tokens</td></tr>
              <tr><td>Maximum output</td><td>{model.max_output.toLocaleString('en-US')} tokens</td></tr>
              <tr><td>Input</td><td>{model.input_modalities.join(', ')}</td></tr>
              <tr><td>Output</td><td>text</td></tr>
              <tr><td>Input price</td><td>{money(model.per_m.in)} / 1M tokens</td></tr>
              <tr><td>Output price</td><td>{money(model.per_m.out)} / 1M tokens</td></tr>
            </tbody>
          </table>
        </div>

        <h2 className="sec">Endpoints</h2>
        <p>Send the id unchanged on either supported shape:</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Endpoint</th><th>Shape</th><th>State</th></tr></thead>
            <tbody>
              <tr><td><code>POST /v1/chat/completions</code></td><td>OpenAI Chat Completions</td><td>Live</td></tr>
              <tr><td><code>POST /v1/messages</code></td><td>Anthropic Messages</td><td>Live</td></tr>
              <tr><td><code>POST /v1/responses</code></td><td>OpenAI Responses</td><td>Not implemented</td></tr>
            </tbody>
          </table>
        </div>

        <h2 className="sec">Hosts</h2>
        <p>{single ? '' : 'The route order for this model. '}Priority is the catalog order, not a live latency score.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Host</th><th className="num">Priority</th><th>When it serves</th></tr></thead>
            <tbody>
              {model.hosts.map((h, i) => (
                <tr key={h}>
                  <td><code>{h}</code></td>
                  <td className="num">{i + 1}</td>
                  <td>{i === 0 ? 'Tried first' : 'Tried when every route above it fails to answer'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="note">
          <Link href="/models">← Back to the catalog</Link> ·{' '}
          <Link href="/docs/models">Model guide</Link> · <Link href="/signin">Get a key</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
