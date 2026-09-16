import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSimplePage } from "@/lib/content/pages";
import { ProseArticle } from "@/components/content/ProseArticle";
import { BRAND } from "@/lib/content/nav";

export async function generateMetadata(): Promise<Metadata> {
  const page = getSimplePage("support");
  if (!page) return {};
  return {
    title: `${page.meta.title} · ${BRAND}`,
    description: page.meta.description || "",
    alternates: { canonical: "/support" },
  };
}

export default function SupportPage() {
  const page = getSimplePage("support");
  if (!page) notFound();
  return <ProseArticle page={page} />;
}
