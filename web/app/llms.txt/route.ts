import { NextResponse } from "next/server";
import { NAV, navOrder, SITE, BRAND, API } from "@/lib/content/nav";
import { loadDocPages } from "@/lib/content/docs";

export function GET() {
  const order = navOrder(NAV);
  const pages = loadDocPages();
  const index = [
    `# ${BRAND}`,
    "",
    `> ${BRAND} is an OpenAI-compatible LLM gateway at ${API}. One prepaid key reaches ` +
      `every model in the catalog, with same-model host failover and no account requirement.`,
    "",
    `Keys are created at ${SITE}/keys before payment. Model IDs use author/name form.`,
    "",
    "## Documentation",
    "",
  ];
  for (const s of order) {
    const m = pages.get(s)!.meta;
    index.push(`- [${m.title}](${SITE}/docs/${s}.md): ${m.description || ""}`);
  }
  index.push(
    "",
    "## Machine-readable",
    "",
    `- [Full documentation](${SITE}/llms-full.txt): every page in one response.`,
    `- [Model catalog](${SITE}/api/v1/catalog): public model metadata and pricing.`,
    `- [Agent onboarding](${SITE}/agents.md): configure a client from scratch.`,
    ""
  );
  return new NextResponse(index.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
