import Link from "next/link";
import { NAV } from "@/lib/content/nav";
import { loadDocPages } from "@/lib/content/docs";

export function Rail({ activeSlug }: { activeSlug: string }) {
  const pages = loadDocPages();
  return (
    <aside className="rail">
      <div className="rail-title">Documentation</div>
      {NAV.groups.map((group) => (
        <div className="rail-group" key={group.label}>
          <h4>{group.label}</h4>
          {group.pages.map((s) => {
            const page = pages.get(s);
            const label = page?.meta.nav || page?.meta.title || s;
            return (
              <Link key={s} href={`/docs/${s}`} aria-current={s === activeSlug ? "page" : undefined}>
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
