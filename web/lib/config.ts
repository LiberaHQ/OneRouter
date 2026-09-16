/**
 * Client-safe configuration. No filesystem access, so this can be imported from a
 * client component without dragging `node:fs` into the browser bundle.
 *
 * `lib/site.ts` stays server-only: it reads data/*.json and docs/_nav.json.
 */
export const BRAND = process.env.NEXT_PUBLIC_BRAND ?? 'OneRouter';
export const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? 'onerouter.dev';
export const SITE = `https://${DOMAIN}`;

/** The gateway the browser talks to. A public URL, not a secret. */
export const API = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://api.onerouter.dev/v1';
