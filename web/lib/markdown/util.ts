export function splitParagraphs(lines: string[]): string[] {
  const paras: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (line.trim()) {
      cur.push(line.trim());
    } else if (cur.length) {
      paras.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) paras.push(cur.join(" "));
  return paras;
}
