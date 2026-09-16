import { inline } from "./inline";
import { slug } from "./slug";
import { codeBlock } from "./codeBlock";
import { renderCallout } from "./directives/callout";
import { renderSteps } from "./directives/steps";
import { renderCards } from "./directives/cards";
import { renderTabs } from "./directives/tabs";
import { renderErrors } from "./directives/errors";
import type { RenderContext, TocEntry } from "./types";

type DirectiveFn = (head: string, body: string[], ctx: RenderContext) => string;

const DIRECTIVES: Record<string, DirectiveFn> = {
  callout: (head, body) => renderCallout(head, body),
  steps: (_head, body) => renderSteps(body),
  cards: (_head, body) => renderCards(body),
  tabs: (_head, body) => renderTabs(body),
  errors: (_head, _body, ctx) => renderErrors(ctx),
};

const LIST_ITEM_RE = /^(\s*)([-*]|\d+\.)\s+/;
const ORDERED_RE = /^\s*\d+\.\s/;
const HEADING_RE = /^(#{2,3})\s+(.*)/;
const TABLE_SEP_RE = /^\|[\s:|-]+\|$/;

function stripPipes(s: string): string {
  return s.replace(/^\|+/, "").replace(/\|+$/, "");
}

export function renderMarkdown(md: string): { html: string; toc: TocEntry[] } {
  const lines = md.split("\n");
  const out: string[] = [];
  const toc: TocEntry[] = [];
  const ctx: RenderContext = { extraToc: [] };
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

    // ::directive
    if (line.startsWith("::") && line.length > 2 && line[2] !== ":") {
      const head = line.slice(2).trim();
      const spaceIdx = head.indexOf(" ");
      const name = spaceIdx === -1 ? head : head.slice(0, spaceIdx);
      const rest = head.slice(name.length).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i].trimEnd() !== "::") {
        body.push(lines[i]);
        i += 1;
      }
      const fn = DIRECTIVES[name] ?? (() => "");
      out.push(fn(rest, body, ctx));
      i += 1;
      continue;
    }
    if (line.trim() === "::errors") {
      out.push(renderErrors(ctx));
      i += 1;
      continue;
    }

    // heading
    const hm = line.match(HEADING_RE);
    if (hm) {
      const level = hm[1].length;
      const text = hm[2].trim();
      const hid = slug(text);
      toc.push({ level, id: hid, text: text.replace(/`/g, "") });
      out.push(
        `<h${level} id="${hid}">${inline(text)}` +
          `<a class="anchor" href="#${hid}" aria-label="Link to this section">#</a>` +
          `</h${level}>`
      );
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
        !(lines[i].startsWith("#") || lines[i].startsWith("|") || lines[i].startsWith("```") || lines[i].startsWith("::"))
      ) {
        para.push(lines[i].trim());
        i += 1;
      }
      if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
      continue;
    }

    i += 1;
  }

  return { html: out.join("\n"), toc: [...toc, ...ctx.extraToc] };
}
