// Rebuild data/models.json from the configured upstream. Ported from
// tools/sync_catalog.py.
//
//   ONEROUTER_UPSTREAM_KEY=... npx tsx scripts/sync-catalog.ts
//
// The catalog shipped with this repo was invented, which was fine while the engine
// was local and nothing was routed anywhere. Once a real upstream is configured those
// ids are worse than useless: every request fails, because no such model exists.
//
// Prices are the upstream's plus ONEROUTER_MARKUP (default 5%), which is what the site
// means by "prices include our fee". The upstream figure is kept alongside so the
// margin is inspectable rather than implied.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "..");
const OUT = path.join(ROOT, "data", "models.json");
const UPSTREAM = (process.env.ONEROUTER_UPSTREAM_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const KEY = process.env.ONEROUTER_UPSTREAM_KEY || "";
const MARKUP = Number(process.env.ONEROUTER_MARKUP ?? "0.05");

// The upstream calls a PDF/document input "file"; the site says "pdf".
const MODALITY: Record<string, string> = { text: "text", image: "image", file: "pdf", audio: "audio", video: "video" };

interface UpstreamModel {
  id: string;
  name?: string;
  pricing?: { prompt?: string; completion?: string };
  context_length?: number;
  top_provider?: { max_completion_tokens?: number };
  architecture?: { input_modalities?: string[] };
}

interface CatalogModel {
  id: string;
  name: string;
  author: string;
  context_length: number;
  max_output: number;
  pricing: { prompt: string; completion: string };
  per_m: { in: number; out: number };
  upstream_per_m: { in: number; out: number };
  input_modalities: string[];
  tags: string[];
  hosts: string[];
}

async function fetchUpstream(pathSuffix: string): Promise<any> {
  const res = await fetch(`${UPSTREAM}${pathSuffix}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "onerouter-sync/1.0",
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

/** "Vendor: Model Name" -> "Model Name". The vendor is already the author. */
function cleanName(raw: string): string {
  const idx = raw.indexOf(": ");
  return idx !== -1 ? raw.slice(idx + 2).trim() : raw.trim();
}

function perMillion(priceStr: string | undefined): number {
  const price = Number(priceStr);
  if (!priceStr || Number.isNaN(price)) return 0;
  return Math.round(price * 1_000_000 * (1 + MARKUP) * 1e6) / 1e6;
}

function trimTrailingZeros(s: string): string {
  return s.replace(/0+$/, "");
}

function tagsFor(entry: UpstreamModel, perIn: number, context: number): string[] {
  const tags: string[] = [];
  if (perIn === 0) tags.push("free");
  else if (perIn <= 0.2) tags.push("cheap");
  if (perIn >= 5) tags.push("frontier");
  const blob = `${entry.id} ${entry.name ?? ""}`.toLowerCase();
  if (["code", "coder", "codex"].some((w) => blob.includes(w))) tags.push("code");
  if (["reason", "thinking", "-r1", "think"].some((w) => blob.includes(w))) tags.push("reasoning");
  if (context >= 1_000_000) tags.push("long-context");
  return tags.slice(0, 3);
}

async function build(): Promise<CatalogModel[]> {
  const raw = ((await fetchUpstream("/models")).data as UpstreamModel[]) ?? [];
  const models: CatalogModel[] = [];

  for (const entry of raw) {
    const mid = entry.id || "";
    // Alias rows like "~vendor/model-latest" move under you; pin real ids only.
    if (!mid || mid.startsWith("~") || !mid.includes("/")) continue;
    const pricing = entry.pricing || {};
    const prompt = pricing.prompt ?? "0";
    const completion = pricing.completion ?? "0";
    // A model with no published price cannot be billed honestly.
    if ([undefined, "", "-1", null].includes(prompt as any) || [undefined, "", "-1", null].includes(completion as any)) continue;
    const context = Number(entry.context_length || 0);
    if (!context) continue;
    const maxOut = Number(entry.top_provider?.max_completion_tokens || 0) || Math.min(context, 8192);
    const mods = (entry.architecture?.input_modalities || ["text"]).map((m) => MODALITY[m]).filter(Boolean);
    const perIn = perMillion(prompt);
    const perOut = perMillion(completion);

    models.push({
      id: mid,
      name: cleanName(entry.name || mid),
      author: mid.split("/", 1)[0],
      context_length: context,
      max_output: maxOut,
      pricing: {
        prompt: trimTrailingZeros((Number(prompt) * (1 + MARKUP)).toFixed(12)),
        completion: trimTrailingZeros((Number(completion) * (1 + MARKUP)).toFixed(12)),
      },
      per_m: { in: perIn, out: perOut },
      upstream_per_m: { in: Math.round(Number(prompt) * 1e6 * 1e6) / 1e6, out: Math.round(Number(completion) * 1e6 * 1e6) / 1e6 },
      input_modalities: mods.length ? mods : ["text"],
      tags: tagsFor(entry, perIn, context),
      // The gateway routes through one upstream, which does its own provider
      // selection. Claiming a list of hosts here would be invention.
      hosts: ["openrouter"],
    });
  }

  // Cheapest first is the order the site treats as "catalog order".
  models.sort((a, b) => a.per_m.in - b.per_m.in || a.id.localeCompare(b.id));
  return models;
}

async function main() {
  const models = await build();
  if (!models.length) {
    console.error("no usable models came back");
    process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify(models, null, 2) + "\n");
  const free = models.filter((m) => m.tags.includes("free"));
  const authors = new Set(models.map((m) => m.author));
  const paid = models.filter((m) => m.per_m.in > 0);
  const cheapest = paid.length ? paid.reduce((min, m) => (m.per_m.in < min.per_m.in ? m : min), paid[0]) : null;

  console.log(`wrote ${models.length} models to ${path.relative(ROOT, OUT)}`);
  console.log(`  markup: ${(MARKUP * 100).toFixed(0)}%`);
  console.log(`  free:   ${free.length}`);
  console.log(`  authors:${authors.size}`);
  if (cheapest) console.log(`  cheapest paid: ${cheapest.id} at $${cheapest.per_m.in}/1M in`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
