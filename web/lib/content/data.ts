import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";

export interface Model {
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

export interface StatusProvider {
  name: string;
  state: "operational" | "degraded" | "down";
  latency_ms: number | null;
  sample: string;
}

export interface StatusFamily {
  author: string;
  healthy: number;
  models: number;
}

export interface StatusData {
  checked_at: string;
  providers: StatusProvider[];
  families: StatusFamily[];
  gateway: {
    error_rate_24h: number;
    error_rate_7d: number;
    ttft_median_ms: number;
    ttft_p95_ms: number;
    requests_24h: number;
  };
}

export interface ChangelogItem {
  date: string;
  tag: string;
  title: string;
  body: string;
  link?: [string, string] | null;
}

export interface ChangelogMonth {
  month: string;
  items: ChangelogItem[];
}

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf-8")) as T;
}

let modelsCache: Model[] | null = null;
export function loadModels(): Model[] {
  if (!modelsCache) modelsCache = loadJson<Model[]>("models");
  return modelsCache;
}

export function getModel(author: string, name: string): Model | undefined {
  const id = `${author}/${name}`;
  return loadModels().find((m) => m.id === id);
}

let statusCache: StatusData | null = null;
export function loadStatus(): StatusData {
  if (!statusCache) statusCache = loadJson<StatusData>("status");
  return statusCache;
}

let changelogCache: ChangelogMonth[] | null = null;
export function loadChangelog(): ChangelogMonth[] {
  if (!changelogCache) changelogCache = loadJson<ChangelogMonth[]>("changelog");
  return changelogCache;
}
