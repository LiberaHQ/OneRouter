import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "./paths";
import { subst, NAV, navOrder } from "./nav";
import { parseFrontMatter } from "../markdown/frontMatter";

export interface DocMeta {
  title: string;
  nav?: string;
  kicker?: string;
  description?: string;
  time?: string;
  [key: string]: string | undefined;
}

export interface DocPage {
  slug: string;
  meta: DocMeta;
  body: string;
  raw: string;
}

let cached: Map<string, DocPage> | null = null;

export function loadDocPages(): Map<string, DocPage> {
  if (cached) return cached;
  const map = new Map<string, DocPage>();
  for (const filename of fs.readdirSync(DOCS_DIR)) {
    if (!filename.endsWith(".md")) continue;
    const slug = filename.slice(0, -3);
    const fullText = fs.readFileSync(path.join(DOCS_DIR, filename), "utf-8");
    const { meta, body } = parseFrontMatter(fullText);
    map.set(slug, { slug, meta: meta as DocMeta, body: subst(body), raw: subst(fullText) });
  }
  // Mirrors Python's page_nav()/rail() calling PAGES[slug] and letting a KeyError
  // surface loudly — a doc listed in _nav.json but missing on disk must fail the
  // build, not silently drop its rail entry / prev-next link.
  for (const s of navOrder(NAV)) {
    if (!map.has(s)) {
      throw new Error(`docs/_nav.json references "${s}" but docs/${s}.md does not exist`);
    }
  }
  cached = map;
  return map;
}

export function getDoc(slug: string): DocPage | undefined {
  return loadDocPages().get(slug);
}

export function allDocSlugs(): string[] {
  return Array.from(loadDocPages().keys());
}
