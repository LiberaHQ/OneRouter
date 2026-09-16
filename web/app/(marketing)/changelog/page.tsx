import type { Metadata } from "next";
import { loadChangelog } from "@/lib/content/data";
import { inline } from "@/lib/markdown/inline";
import { BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Changelog · ${BRAND}`,
  description: "Recent changes to the gateway, the catalog, pricing and the docs.",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  const months = loadChangelog();
  return (
    <main className="page narrow">
      <section className="page-head">
        <span className="kicker">Changelog</span>
        <h1>What changed</h1>
        <p className="sub">Material changes are announced here before they take effect.</p>
      </section>
      {months.map((month) => (
        <div key={month.month}>
          <h2 className="sec">{month.month}</h2>
          <ul className="cl">
            {month.items.map((item) => (
              <li key={item.date + item.title}>
                <div className="cl-meta">
                  <time>{item.date}</time>
                  <span className="cl-tag">{item.tag}</span>
                </div>
                <div className="cl-body">
                  <b>{item.title}</b>
                  <p dangerouslySetInnerHTML={{ __html: inline(item.body) }} />
                  {item.link && (
                    <a href={item.link[1]}>{item.link[0]} →</a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}
