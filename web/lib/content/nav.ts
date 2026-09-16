import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "./paths";

export interface NavGroup {
  label: string;
  pages: string[];
}

export interface Nav {
  brand: string;
  domain: string;
  api: string;
  tagline: string;
  groups: NavGroup[];
}

let cached: Nav | null = null;

export function loadNav(): Nav {
  if (cached) return cached;
  const raw = fs.readFileSync(path.join(DOCS_DIR, "_nav.json"), "utf-8");
  cached = JSON.parse(raw) as Nav;
  return cached;
}

export function navOrder(nav: Nav): string[] {
  return nav.groups.flatMap((g) => g.pages);
}

export const NAV = loadNav();
export const BRAND = NAV.brand;
export const DOMAIN = NAV.domain;
export const SITE = process.env.NEXT_PUBLIC_SITE_URL || `https://${DOMAIN}`;
// Build/render-time API base URL baked into docs snippets, the footer urlchip, and
// used by client components for actual requests too, since the gateway is merged
// into this same app. Override for local dev via NEXT_PUBLIC_API_URL.
export const API = process.env.NEXT_PUBLIC_API_URL || NAV.api;

export const VARS: Record<string, string> = {
  "{{BRAND}}": BRAND,
  "{{API}}": API,
  "{{SITE}}": SITE,
  "{{DOMAIN}}": DOMAIN,
};

export function subst(text: string): string {
  let out = text;
  for (const [k, v] of Object.entries(VARS)) {
    out = out.split(k).join(v);
  }
  return out;
}
