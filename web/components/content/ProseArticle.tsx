import { renderMarkdown } from "@/lib/markdown/render";
import { inline } from "@/lib/markdown/inline";
import { escapeHtml } from "@/lib/markdown/html";
import type { SimplePage } from "@/lib/content/pages";

export function ProseArticle({ page }: { page: SimplePage }) {
  const { html: bodyHtml } = renderMarkdown(page.body);
  return (
    <main className="article prose-page">
      <div className="head-line">
        <span className="kicker">{page.meta.kicker || "Legal"}</span>
      </div>
      <h1>{page.meta.title}</h1>
      <p className="lede" dangerouslySetInnerHTML={{ __html: inline(page.meta.description || "") }} />
      {page.meta.updated && (
        <p className="updated">Last updated {escapeHtml(page.meta.updated)}</p>
      )}
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </main>
  );
}
