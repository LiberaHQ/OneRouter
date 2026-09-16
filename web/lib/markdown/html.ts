// Mirrors Python's html.escape(): quote=False escapes only & < >; quote=True also
// escapes " and ' (as &#x27;, matching Python's exact entity choice).
export function escapeHtml(text: string, quote = false): string {
  let out = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (quote) {
    out = out.replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  }
  return out;
}
