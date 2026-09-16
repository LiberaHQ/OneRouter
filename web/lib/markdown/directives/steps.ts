import { inline } from "../inline";

export function renderSteps(body: string[]): string {
  const items: string[] = [];
  let cur: string[] = [];
  for (const line of body) {
    if (/^\d+\.\s/.test(line)) {
      if (cur.length) items.push(cur.join(" "));
      cur = [line.replace(/^\d+\.\s+/, "")];
    } else if (line.trim() && cur.length) {
      cur.push(line.trim());
    } else if (!line.trim() && cur.length) {
      items.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) items.push(cur.join(" "));
  const lis = items.map((i) => `<li>${inline(i)}</li>`).join("");
  return `<ol class="steps">${lis}</ol>`;
}
