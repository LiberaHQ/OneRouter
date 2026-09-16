import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The repo root, one level above this Next app. */
const ROOT = join(process.cwd(), '..');

export type Model = {
  id: string;
  name: string;
  author: string;
  context_length: number;
  max_output: number;
  pricing: { prompt: string; completion: string };
  per_m: { in: number; out: number };
  upstream_per_m?: { in: number; out: number };
  input_modalities: string[];
  tags: string[];
  hosts: string[];
};

export type Nav = {
  brand: string;
  domain: string;
  api: string;
  tagline: string;
  groups: { label: string; pages: string[] }[];
};

function data<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, 'data', `${name}.json`), 'utf8')) as T;
}

export const nav: Nav = JSON.parse(
  readFileSync(join(ROOT, 'docs', '_nav.json'), 'utf8'),
);

export const BRAND = nav.brand;
export const DOMAIN = nav.domain;
export const SITE = `https://${nav.domain}`;

/**
 * The gateway the browser talks to. NEXT_PUBLIC_ because client components need it;
 * it is a public URL, not a secret.
 */
export const API = process.env.NEXT_PUBLIC_GATEWAY_URL ?? nav.api;

export const models = (): Model[] => data<Model[]>('models');
export const status = () => data<Record<string, unknown>>('status');
export const changelog = () => data<unknown[]>('changelog');

/** Matches the Python build's `money()` so prices read identically. */
export function money(v: number): string {
  if (v === 0) return 'Free';
  if (v < 1) {
    return `$${v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  }
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Matches the Python build's `tokens()`: 1M / 256K, never a bare count. */
export function tokens(n: number): string {
  return n >= 1_000_000 ? `${Math.floor(n / 1_000_000)}M` : `${Math.floor(n / 1000)}K`;
}

/** `meta-llama/llama-3.3-70b-instruct` -> ['meta-llama', 'llama-3.3-70b-instruct'] */
export function splitId(id: string): [string, string] {
  const at = id.indexOf('/');
  return [id.slice(0, at), id.slice(at + 1)];
}
