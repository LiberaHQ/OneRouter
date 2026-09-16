import fs from "node:fs";
import path from "node:path";
import { inline } from "../inline";
import { escapeHtml } from "../html";
import { codeBlock } from "../codeBlock";
import { DOCS_DIR } from "../../content/paths";
import { subst } from "../../content/nav";
import type { RenderContext } from "../types";

export interface ErrorEntry {
  code: string;
  http: number;
  type: string;
  title: string;
  retryable: boolean;
  message: string;
  fix: string;
}

let cachedErrors: ErrorEntry[] | null = null;

export function loadErrors(): ErrorEntry[] {
  if (cachedErrors) return cachedErrors;
  const raw = fs.readFileSync(path.join(DOCS_DIR, "_errors.json"), "utf-8");
  cachedErrors = JSON.parse(subst(raw)) as ErrorEntry[];
  return cachedErrors;
}

export function renderErrors(ctx: RenderContext): string {
  const errors = loadErrors();
  for (const e of errors) ctx.extraToc.push({ level: 2, id: e.code, text: e.code });

  const rows = errors
    .map(
      (e) =>
        `<a class="err-row" href="#${e.code}">` +
        `<span class="c">${e.code}</span>` +
        `<span class="h">${e.http}</span>` +
        `<span class="r ${e.retryable ? "yes" : ""}">` +
        `${e.retryable ? "retryable" : "terminal"}</span></a>`
    )
    .join("");

  const blocks = errors.map((e) => {
    const retry = e.retryable
      ? '<span class="tag retry">retryable</span>'
      : '<span class="tag">not retryable</span>';
    return (
      `<section class="err" id="${e.code}">` +
      `<div class="err-head"><h3>${escapeHtml(e.title)}` +
      `<a class="anchor" href="#${e.code}" aria-label="Link to this section">#</a></h3>` +
      `<span class="tag">HTTP ${e.http}</span>` +
      `<span class="tag">${e.type}</span>${retry}</div>` +
      codeBlock(e.code, e.message) +
      `<p class="err-fix"><b>Fix.</b> ${inline(e.fix)}</p></section>`
    );
  });

  return `<div class="err-index">${rows}</div>` + blocks.join("");
}
