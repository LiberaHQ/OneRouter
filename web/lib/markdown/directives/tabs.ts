import { codeBlock } from "../codeBlock";

export function renderTabs(body: string[]): string {
  const tabs: Array<[string, string]> = [];
  let name: string | null = null;
  let buf: string[] = [];
  for (const line of body) {
    if (line.startsWith("--- ")) {
      if (name !== null) tabs.push([name, buf.join("\n")]);
      name = line.slice(4).trim();
      buf = [];
    } else if (name !== null) {
      buf.push(line);
    }
  }
  if (name !== null) tabs.push([name, buf.join("\n")]);
  return tabs.length ? codeBlock("", "", tabs) : "";
}
