import fs from "node:fs";
import path from "node:path";
import { PAGES_DIR } from "./paths";
import { subst } from "./nav";
import { parseFrontMatter } from "../markdown/frontMatter";

export interface SimplePageMeta {
  title: string;
  kicker?: string;
  description?: string;
  updated?: string;
  [key: string]: string | undefined;
}

export interface SimplePage {
  slug: string;
  meta: SimplePageMeta;
  body: string;
}

let cached: Map<string, SimplePage> | null = null;

export function loadSimplePages(): Map<string, SimplePage> {
  if (cached) return cached;
  const map = new Map<string, SimplePage>();
  for (const filename of fs.readdirSync(PAGES_DIR)) {
    if (!filename.endsWith(".md")) continue;
    const slug = filename.slice(0, -3);
    const raw = fs.readFileSync(path.join(PAGES_DIR, filename), "utf-8");
    const { meta, body } = parseFrontMatter(raw);
    map.set(slug, { slug, meta: meta as SimplePageMeta, body: subst(body) });
  }
  cached = map;
  return map;
}

export function getSimplePage(slug: string): SimplePage | undefined {
  return loadSimplePages().get(slug);
}

export function allLegalSlugs(): string[] {
  return Array.from(loadSimplePages().keys()).filter((s) => s !== "support");
}
