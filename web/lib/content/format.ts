export function money(v: number): string {
  if (v === 0) return "Free";
  if (v < 1) {
    // 4 dp, trailing zeros trimmed — mirrors Python's f"${v:,.4f}".rstrip("0").rstrip(".")
    let s = v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    s = s.replace(/0+$/, "").replace(/\.$/, "");
    return `$${s}`;
  }
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function tokens(n: number): string {
  return n >= 1_000_000 ? `${Math.floor(n / 1_000_000)}M` : `${Math.floor(n / 1000)}K`;
}
