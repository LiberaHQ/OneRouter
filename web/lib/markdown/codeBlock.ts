import { escapeHtml } from "./html";
import { highlight } from "./highlight";

export function codeBlock(label: string, code: string, tabs?: Array<[string, string]>): string {
  if (tabs && tabs.length) {
    const strip = tabs
      .map(
        ([name], i) =>
          `<button class="tab" role="tab" data-i="${i}" aria-selected="${i === 0 ? "true" : "false"}">${escapeHtml(name)}</button>`
      )
      .join("");
    const panes = tabs
      .map(
        ([, body], i) =>
          `<pre data-i="${i}"${i === 0 ? "" : " hidden"}><code>${highlight(body.trim())}</code></pre>`
      )
      .join("");
    const first = escapeHtml(tabs[0][1].trim(), true);
    return (
      `<div class="code" data-tabs><div class="code-bar">` +
      `<div class="tabs-strip" role="tablist">${strip}</div>` +
      `<button class="copy" data-copy="${first}">Copy</button></div>${panes}</div>`
    );
  }
  return (
    `<div class="code"><div class="code-bar"><span class="lang">${escapeHtml(label)}</span>` +
    `<button class="copy" data-copy="${escapeHtml(code.trim(), true)}">Copy</button>` +
    `</div><pre><code>${highlight(code.trim())}</code></pre></div>`
  );
}
