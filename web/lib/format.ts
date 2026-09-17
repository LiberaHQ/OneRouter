// Real usage costs fractions of a cent (a single completion can cost $0.000005), so a
// flat two-decimal format collapses everything below a cent to "$0.00" and makes
// actual spend invisible. Under $1, show up to 6 decimals with trailing zeros
// trimmed; at $1 and above, ordinary two-decimal currency formatting is precise
// enough and reads better with thousands separators.
export function formatUsd(v: number): string {
  if (v === 0) return "$0.00";
  if (v < 1) {
    const s = v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `$${s}`;
  }
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
