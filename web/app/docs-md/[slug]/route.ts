import { NextResponse } from "next/server";
import { getDoc, allDocSlugs } from "@/lib/content/docs";

export function generateStaticParams() {
  return allDocSlugs().map((slug) => ({ slug }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return new NextResponse("not found", { status: 404 });
  return new NextResponse(doc.raw, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
