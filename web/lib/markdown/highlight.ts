import { escapeHtml } from "./html";

// Minimal, language-agnostic token highlighter — ported from site/build.py's
// highlight(). Not a real lexer; a single ordered-alternation regex scan.
const KEYWORDS = new Set([
  "curl", "export", "import", "from", "const", "await", "async", "for", "def", "print",
  "client", "true", "false", "null", "True", "False", "None", "let", "var", "func",
  "return", "package", "class", "new", "of", "in", "if", "else", "GET", "POST",
  "PATCH", "DELETE", "HTTP", "claude", "aider", "pip", "npm",
]);

const PATTERN =
  /(?<com>(?<!:)\/\/[^\n]*|#[^\n]*)|(?<str>"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(?<url>https?:\/\/[^\s"'<>)]+)|(?<flag>(?<=\s)-{1,2}[A-Za-z][\w-]*)|(?<num>\b\d[\d_,.]*\b)|(?<word>[A-Za-z_$][\w$]*)/g;

export function highlight(code: string): string {
  const out: string[] = [];
  let pos = 0;
  for (const m of code.matchAll(PATTERN)) {
    const start = m.index!;
    out.push(escapeHtml(code.slice(pos, start), false));
    const groups = m.groups!;
    const kind = Object.keys(groups).find((k) => groups[k] !== undefined)!;
    const raw = escapeHtml(m[0], false);
    if (kind === "word") {
      out.push(KEYWORDS.has(m[0]) ? `<span class="t-kw">${raw}</span>` : raw);
    } else {
      // Faithful to the original: kind[:3] on "flag" yields "fla", not "flag" — CSS
      // has no .t-fla rule, so CLI flags render unstyled. Preserved as-is (see plan).
      out.push(`<span class="t-${kind.slice(0, 3)}">${raw}</span>`);
    }
    pos = start + m[0].length;
  }
  out.push(escapeHtml(code.slice(pos), false));
  return out.join("");
}
