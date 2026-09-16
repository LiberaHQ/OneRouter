// Spiritual port of site/check.py's check_links(): walks the sitemap, confirms every
// URL 200s, and confirms every in-page #fragment href resolves to a real id on that
// page. Run against a live server: `BASE=http://localhost:4321 npx tsx scripts/linkcheck.ts`
const BASE = process.env.BASE || "http://localhost:4321";

interface Failure {
  url: string;
  reason: string;
}

async function main() {
  const failures: Failure[] = [];

  const sitemapRes = await fetch(`${BASE}/sitemap.xml`);
  if (!sitemapRes.ok) {
    console.error(`Could not fetch sitemap.xml: ${sitemapRes.status}`);
    process.exit(1);
  }
  const sitemapXml = await sitemapRes.text();
  const urls = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  console.log(`Found ${urls.length} URLs in sitemap.xml`);

  const idCache = new Map<string, Set<string>>();
  const hrefCache = new Map<string, string[]>();

  for (const url of urls) {
    const path = new URL(url).pathname;
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) {
      failures.push({ url: path, reason: `status ${res.status}` });
      continue;
    }
    const html = await res.text();
    const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]));
    idCache.set(path, ids);
    const hrefs = Array.from(html.matchAll(/\shref="([^"]+)"/g))
      .map((m) => m[1])
      .filter((h) => !h.startsWith("http") && !h.startsWith("mailto:") && !h.startsWith("data:"));
    hrefCache.set(path, hrefs);
  }

  for (const [path, hrefs] of hrefCache) {
    for (const href of hrefs) {
      if (href.startsWith("#")) {
        const frag = href.slice(1);
        if (frag && !idCache.get(path)?.has(frag)) {
          failures.push({ url: path, reason: `fragment #${frag} not found on page` });
        }
        continue;
      }
      const target = href.split("#")[0];
      if (!target) continue;
      const known = urls.some((u) => new URL(u).pathname === target) || target.endsWith(".md") || target.endsWith(".svg");
      if (!known) {
        const res = await fetch(`${BASE}${target}`);
        if (!res.ok) failures.push({ url: path, reason: `broken link to ${target} (${res.status})` });
      }
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error(`  ${f.url}: ${f.reason}`);
    process.exit(1);
  }
  console.log("All links check out.");
}

main();
