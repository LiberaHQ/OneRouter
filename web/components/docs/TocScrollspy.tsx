"use client";

import { useEffect } from "react";

export function TocScrollspy() {
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".toc a"));
    if (!links.length) return;
    const targets = links
      .map((a) => {
        const id = a.getAttribute("href")?.slice(1);
        return id ? document.getElementById(id) : null;
      })
      .filter((el): el is HTMLElement => !!el);
    if (!targets.length) return;

    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen.add(entry.target.id);
          else seen.delete(entry.target.id);
        }
        let current: string | null = null;
        for (const t of targets) {
          if (seen.has(t.id)) {
            current = t.id;
            break;
          }
        }
        if (!current) current = targets[0]?.id ?? null;
        for (const a of links) {
          if (a.getAttribute("href") === `#${current}`) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        }
      },
      { rootMargin: "-78px 0px -70% 0px" }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return null;
}
