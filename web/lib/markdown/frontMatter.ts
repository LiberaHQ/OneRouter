export interface FrontMatter {
  meta: Record<string, string>;
  body: string;
}

export function parseFrontMatter(raw: string): FrontMatter {
  const sep = "---\n";
  if (!raw.startsWith(sep)) return { meta: {}, body: raw };
  const secondIdx = raw.indexOf(sep, sep.length);
  if (secondIdx === -1) {
    throw new Error("front matter block missing closing '---'");
  }
  const block = raw.slice(sep.length, secondIdx);
  const body = raw.slice(secondIdx + sep.length);
  const meta: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const ci = line.indexOf(":");
    if (ci !== -1) {
      meta[line.slice(0, ci).trim()] = line.slice(ci + 1).trim();
    }
  }
  return { meta, body };
}
