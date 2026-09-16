/** Client-safe formatters. Mirrors lib/site.ts so a number reads the same either side. */
export function usd(v: number): string {
  if (v === 0) return 'Free';
  if (v < 1) return `$${v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${v.toFixed(2)}`;
}

export function store(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function setStore(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}
