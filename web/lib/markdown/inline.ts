import { escapeHtml } from "./html";

// Escape first, then re-introduce only the markup we support: `code`, **bold**,
// *em*, [text](url). Ported from site/build.py's inline() — order matters, code
// spans are stashed before bold/em/link regexes run so markup inside them is inert.
export function inline(text: string): string {
  let out = escapeHtml(text, false);
  const codes: string[] = [];

  out = out.replace(/`([^`]+)`/g, (_m, p1: string) => {
    codes.push(p1);
    return `\x00${codes.length - 1}\x00`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "<em>$1</em>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, url: string) => `<a href="${escapeHtml(url, true)}">${label}</a>`
  );

  return out.replace(/\x00(\d+)\x00/g, (_m, idx: string) => `<code>${codes[Number(idx)]}</code>`);
}
