import { NextResponse } from "next/server";
import { NAV, navOrder, SITE, BRAND } from "@/lib/content/nav";
import { loadDocPages } from "@/lib/content/docs";

export function GET() {
  const order = navOrder(NAV);
  const pages = loadDocPages();
  const full = [
    `# ${BRAND} documentation`,
    "",
    `> Complete machine-readable documentation. Shorter index: ${SITE}/llms.txt`,
    "",
    "---",
    "",
  ];
  for (const s of order) {
    const page = pages.get(s)!;
    const sep = "---\n";
    const secondIdx = page.raw.indexOf(sep, sep.length);
    const body = secondIdx === -1 ? page.raw : page.raw.slice(secondIdx + sep.length);
    full.push(
      `Document: ${SITE}/docs/${s}`,
      `Markdown: ${SITE}/docs/${s}.md`,
      "",
      body.trim(),
      "",
      "---",
      ""
    );
  }
  return new NextResponse(full.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
