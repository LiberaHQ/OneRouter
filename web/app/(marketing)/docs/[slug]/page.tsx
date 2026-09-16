import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDoc, allDocSlugs } from "@/lib/content/docs";
import { renderMarkdown } from "@/lib/markdown/render";
import { inline } from "@/lib/markdown/inline";
import { escapeHtml } from "@/lib/markdown/html";
import { Rail } from "@/components/docs/Rail";
import { Toc } from "@/components/docs/Toc";
import { PageNav } from "@/components/docs/PageNav";
import { TocScrollspy } from "@/components/docs/TocScrollspy";
import { BRAND } from "@/lib/content/nav";

export function generateStaticParams() {
  return allDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return {};
  return {
    title: `${doc.meta.title} · ${BRAND} docs`,
    description: doc.meta.description || "",
    alternates: { canonical: `/docs/${slug}` },
    openGraph: {
      title: doc.meta.title,
      description: doc.meta.description || "",
      type: "website",
    },
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  const { html: bodyHtml, toc } = renderMarkdown(doc.body);
  const crumbLabel = doc.meta.nav || doc.meta.title;

  return (
    <div className="docs">
      <Rail activeSlug={slug} />
      <main className="article">
        <div className="crumbs">
          <a href="/docs/quickstart">Docs</a> <span>/</span>
          <span>{crumbLabel}</span>
        </div>
        <div className="head-line">
          <span className="kicker">{doc.meta.kicker || "Documentation"}</span>
          {doc.meta.time && <span className="meta-chip">{escapeHtml(doc.meta.time)}</span>}
        </div>
        <h1>{doc.meta.title}</h1>
        <p className="lede" dangerouslySetInnerHTML={{ __html: inline(doc.meta.description || "") }} />
        <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        <PageNav slug={slug} />
      </main>
      <Toc entries={toc} />
      <TocScrollspy />
    </div>
  );
}
