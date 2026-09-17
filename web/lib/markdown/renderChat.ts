// A client-safe subset of render.ts's block parser, for assistant chat bubbles
// (ChatApp.tsx is "use client" — it runs in the browser). render.ts's `::directive`
// support pulls in directives/errors.ts, which reads docs/_errors.json off disk via
// node:fs; bundling that for the browser fails outright ("the chunking context does
// not support external modules"). Nothing about chat needs directives, headings-as-
// permalinks, or a table of contents, so this drops all three rather than trying to
// make the filesystem-touching path browser-safe. Fenced code, tables, lists, and
// inline formatting are unchanged — same behavior, same escaping, ported line for
// line from the pieces of render.ts that have no such dependency.
import { inline } from "./inline";
import { codeBlock } from "./codeBlock";

const LIST_ITEM_RE = /^(\s*)([-*]|\d+\.)\s+/;
const ORDERED_RE = /^\s*\d+\.\s/;
const HEADING_RE = /^(#{2,3})\s+(.*)/;
const TABLE_SEP_RE = /^\|[\s:|-]+\|$/;

function stripPipes(s: string): string {
  return s.replace(/^\|+/, "").replace(/\|+$/, "");
}

export function renderChatMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "text";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      out.push(codeBlock(lang, body.join("\n")));
      i += 1;
      continue;
    }

    // heading — no id/anchor: no permalink or TOC context in a chat bubble
    const hm = line.match(HEADING_RE);
    if (hm) {
      const level = hm[1].length;
      const text = hm[2].trim();
      out.push(`<h${level}>${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    // table
    if (line.startsWith("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const headCells = stripPipes(line).split("|").map((c) => c.trim());
      const headHtml = headCells.map((c) => `<th>${inline(c)}</th>`).join("");
      i += 2;
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cols = stripPipes(lines[i]).split("|").map((c) => c.trim());
        rows.push("<tr>" + cols.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
        i += 1;
      }
      out.push(
        `<div class="table-wrap"><table><thead><tr>${headHtml}</tr></thead>` +
          `<tbody>${rows.join("")}</tbody></table></div>`
      );
      continue;
    }

    // list
    if (LIST_ITEM_RE.test(line)) {
      const ordered = ORDERED_RE.test(line);
      const items: string[] = [];
      let cur: string[] = [];
      while (i < lines.length && (LIST_ITEM_RE.test(lines[i]) || (lines[i].startsWith("  ") && cur.length))) {
        if (LIST_ITEM_RE.test(lines[i])) {
          if (cur.length) items.push(cur.join(" "));
          cur = [lines[i].replace(LIST_ITEM_RE, "")];
        } else {
          cur.push(lines[i].trim());
        }
        i += 1;
      }
      if (cur.length) items.push(cur.join(" "));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join("") + `</${tag}>`);
      continue;
    }

    if (line.trim() === "---") {
      out.push("<hr>");
      i += 1;
      continue;
    }

    // paragraph
    if (line.trim()) {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !(lines[i].startsWith("#") || lines[i].startsWith("|") || lines[i].startsWith("```"))
      ) {
        para.push(lines[i].trim());
        i += 1;
      }
      if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
      continue;
    }

    i += 1;
  }

  return out.join("\n");
}
