import { inline } from "../inline";
import { splitParagraphs } from "../util";

export function renderCallout(head: string, body: string[]): string {
  let kind = "";
  for (const word of ["warn", "note"]) {
    if (head.startsWith(word + " ") || head === word) {
      kind = " " + word;
      head = head.slice(word.length).trim();
    }
  }
  const title = head ? `<div class="c-title">${inline(head)}</div>` : "";
  const paras = splitParagraphs(body)
    .map((p) => `<p>${inline(p)}</p>`)
    .join("");
  return `<div class="callout${kind}">${title}${paras}</div>`;
}
