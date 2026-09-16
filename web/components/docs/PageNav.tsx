import Link from "next/link";
import { NAV, navOrder } from "@/lib/content/nav";
import { loadDocPages } from "@/lib/content/docs";

export function PageNav({ slug }: { slug: string }) {
  const order = navOrder(NAV);
  const pages = loadDocPages();
  const idx = order.indexOf(slug);
  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx < order.length - 1 ? order[idx + 1] : null;
  return (
    <nav className="pagenav">
      {prev && (
        <Link href={`/docs/${prev}`}>
          <span className="dir">← Previous</span>
          <span className="name">{pages.get(prev)?.meta.title}</span>
        </Link>
      )}
      {next && (
        <Link className="next" href={`/docs/${next}`}>
          <span className="dir">Next →</span>
          <span className="name">{pages.get(next)?.meta.title}</span>
        </Link>
      )}
    </nav>
  );
}
