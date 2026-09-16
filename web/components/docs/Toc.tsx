import type { TocEntry } from "@/lib/markdown/types";

export function Toc({ entries }: { entries: TocEntry[] }) {
  if (entries.length < 2) return <aside className="toc" />;
  return (
    <aside className="toc">
      <h5>On this page</h5>
      <ul>
        {entries.map((e) => (
          <li className={`lvl${e.level}`} key={e.id}>
            <a href={`#${e.id}`}>{e.text}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
