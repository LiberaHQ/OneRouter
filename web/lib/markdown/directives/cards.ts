import { inline } from "../inline";

export function renderCards(body: string[]): string {
  const items: string[] = [];
  let cur: string[] = [];
  for (const line of body) {
    if (line.startsWith("- ")) {
      if (cur.length) items.push(cur.join(" "));
      cur = [line.slice(2)];
    } else if (line.trim() && cur.length) {
      cur.push(line.trim());
    }
  }
  if (cur.length) items.push(cur.join(" "));
  const cards = items.map((i) => `<div class="card">${inline(i)}</div>`).join("");
  return `<div class="cards">${cards}</div>`;
}
