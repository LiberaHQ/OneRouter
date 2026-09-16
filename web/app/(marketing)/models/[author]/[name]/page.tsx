import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadModels } from "@/lib/content/data";
import { money, tokens } from "@/lib/content/format";
import { modelTabs } from "@/lib/content/snippets";
import { codeBlock } from "@/lib/markdown/codeBlock";
import { CopyButton } from "@/components/chrome/CopyButton";
import { BRAND } from "@/lib/content/nav";
import { modelIdFromSegments, modelNameSegment, modelUrlPath } from "@/lib/content/modelUrl";

export function generateStaticParams() {
  return loadModels().map((m) => {
    const [author] = m.id.split("/");
    return { author, name: modelNameSegment(m.id) };
  });
}

function findModel(author: string, name: string) {
  const id = modelIdFromSegments(author, name);
  return loadModels().find((m) => m.id === id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ author: string; name: string }>;
}): Promise<Metadata> {
  const { author, name } = await params;
  const m = findModel(author, name);
  if (!m) return {};
  return {
    title: `${m.name} · ${BRAND}`,
    description: `${m.name} on ${BRAND} — ${money(m.per_m.in)} in / ${money(m.per_m.out)} out per 1M tokens, ${tokens(m.context_length)} context, with copy-ready client setup.`,
    alternates: { canonical: modelUrlPath(m.id) },
  };
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ author: string; name: string }>;
}) {
  const { author, name } = await params;
  const m = findModel(author, name);
  if (!m) notFound();

  const per = m.per_m;
  const free = m.tags.includes("free");
  const mods = m.input_modalities.join(", ");
  const setupHtml = codeBlock("setup", "", modelTabs(m));
  const pinHtml = codeBlock(
    "json",
    `{
  "model": "${m.id}",
  "messages": [{ "role": "user", "content": "ping" }],
  "provider": { "only": ["${m.hosts[0]}"] }
}`
  );

  return (
    <main className="page narrow">
      <section className="page-head">
        <div className="crumbs">
          <a href="/models">Models</a> <span>/</span> <span>{m.author}</span> <span>/</span>{" "}
          <span>{m.name}</span>
        </div>
        <span className="kicker">{m.author}</span>
        <h1>{m.name}</h1>
        {m.tags.length > 0 && (
          <div className="chips">
            {m.tags.map((t) => (
              <span className={`tag t-${t}`} key={t}>
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="sub">
          Send this model by its id from any OpenAI-compatible client. One key, one base URL,{" "}
          {tokens(m.context_length)} of context.
        </p>
        <div className="urlchip">
          <code>{m.id}</code>
          <CopyButton text={m.id} />
        </div>
      </section>

      <div className="strip four-up">
        <div>
          <b>{money(per.in)}</b>
          <span>Input / 1M tokens</span>
        </div>
        <div>
          <b>{money(per.out)}</b>
          <span>Output / 1M tokens</span>
        </div>
        <div>
          <b>{tokens(m.context_length)}</b>
          <span>Context window</span>
        </div>
        <div>
          <b>{tokens(m.max_output)}</b>
          <span>Maximum output</span>
        </div>
      </div>
      <p className="note">
        {free ? (
          <>
            This model is the current Open Tier resolution and is charged at $0.{" "}
            <a href="/docs/open-tier">Quotas apply</a>.
          </>
        ) : (
          <>
            USD per million tokens, {BRAND}&rsquo;s fee included. A response is charged on the attempt that
            produced it — see <a href="/docs/billing">billing</a>.
          </>
        )}
      </p>

      <h2 className="sec">Use this model</h2>
      <p>
        Every snippet carries this model&rsquo;s id. The base URL and the key are the same ones you already
        use for every other model in the catalog.
      </p>
      <div dangerouslySetInnerHTML={{ __html: setupHtml }} />
      <p className="note">
        More clients — Cursor, Zed, Continue, Aider, LiteLLM — are on{" "}
        <a href="/docs/integrations">client setup</a>.
      </p>

      <h2 className="sec">Specification</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            <tr>
              <td>Model ID</td>
              <td>
                <code>{m.id}</code>
              </td>
            </tr>
            <tr>
              <td>Author</td>
              <td>{m.author}</td>
            </tr>
            <tr>
              <td>Context window</td>
              <td>{m.context_length.toLocaleString("en-US")} tokens</td>
            </tr>
            <tr>
              <td>Maximum output</td>
              <td>{m.max_output.toLocaleString("en-US")} tokens</td>
            </tr>
            <tr>
              <td>Input</td>
              <td>{mods}</td>
            </tr>
            <tr>
              <td>Output</td>
              <td>text</td>
            </tr>
            <tr>
              <td>Input price</td>
              <td>{money(per.in)} / 1M tokens</td>
            </tr>
            <tr>
              <td>Output price</td>
              <td>{money(per.out)} / 1M tokens</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="sec">Endpoints</h2>
      <p>Send the id unchanged on either supported shape:</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Shape</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>POST /v1/chat/completions</code>
              </td>
              <td>OpenAI Chat Completions</td>
              <td>Live</td>
            </tr>
            <tr>
              <td>
                <code>POST /v1/messages</code>
              </td>
              <td>Anthropic Messages</td>
              <td>Live</td>
            </tr>
            <tr>
              <td>
                <code>POST /v1/responses</code>
              </td>
              <td>OpenAI Responses</td>
              <td>Not implemented</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        Both live shapes accept JSON and SSE. Set <code>&quot;stream&quot;: true</code> for incremental
        output — see <a href="/docs/streaming">streaming</a>. <code>/v1/responses</code> answers{" "}
        <a href="/docs/errors#unsupported_endpoint">400 unsupported_endpoint</a>.
      </p>

      <h2 className="sec">Hosts</h2>
      <p>
        {m.hosts.length > 1 ? "The route order for this model. " : ""}Priority is the catalog order, not a
        live latency score.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Host</th>
              <th className="num">Priority</th>
              <th>When it serves</th>
            </tr>
          </thead>
          <tbody>
            {m.hosts.map((h, i) => (
              <tr key={h}>
                <td>
                  <code>{h}</code>
                </td>
                <td className="num">{i + 1}</td>
                <td>{i === 0 ? "Tried first" : "Tried when every route above it fails to answer"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {m.hosts.length > 1 ? (
        <p className="note">
          {BRAND} moves between these hosts of the same model, never between models, and only before the
          first content byte. See <a href="/docs/failover">failover</a>.
        </p>
      ) : (
        <p className="note">
          A single route serves this model. There is nowhere to fail over to: if the host does not answer,
          the request returns <a href="/docs/errors#model_unavailable">503 model_unavailable</a> and
          nothing is charged.
        </p>
      )}
      <p>Pin one host and refuse failover entirely:</p>
      <div dangerouslySetInnerHTML={{ __html: pinHtml }} />

      <p className="note">
        <a href="/models">← Back to the catalog</a> · <a href="/docs/models">Model guide</a> ·{" "}
        <a href="/keys">Get a key</a>
      </p>
    </main>
  );
}
