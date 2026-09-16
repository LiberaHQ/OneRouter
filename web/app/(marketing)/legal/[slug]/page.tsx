import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSimplePage, allLegalSlugs } from "@/lib/content/pages";
import { ProseArticle } from "@/components/content/ProseArticle";
import { BRAND } from "@/lib/content/nav";

export function generateStaticParams() {
  return allLegalSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "support") return {};
  const page = getSimplePage(slug);
  if (!page) return {};
  return {
    title: `${page.meta.title} · ${BRAND}`,
    description: page.meta.description || "",
    alternates: { canonical: `/legal/${slug}` },
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "support") notFound();
  const page = getSimplePage(slug);
  if (!page) notFound();
  return <ProseArticle page={page} />;
}
