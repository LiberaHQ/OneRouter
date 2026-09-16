"use client";

import { useEffect } from "react";

// Delegated document-level listeners for HTML injected via dangerouslySetInnerHTML
// (code blocks, tabs) — React can't attach handlers directly to that markup, so this
// mirrors onerouter.js's copy-to-clipboard and code-tabs behavior via event delegation.
export function ContentInteractions() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;

      const copyBtn = target.closest<HTMLElement>("[data-copy]");
      if (copyBtn) {
        const text = copyBtn.getAttribute("data-copy") || "";
        navigator.clipboard
          .writeText(text)
          .then(() => {
            const original = copyBtn.textContent;
            copyBtn.textContent = "Copied";
            copyBtn.classList.add("done");
            setTimeout(() => {
              copyBtn.textContent = original;
              copyBtn.classList.remove("done");
            }, 1300);
          })
          .catch(() => {});
        return;
      }

      const tab = target.closest<HTMLElement>(".tab");
      if (tab) {
        const container = tab.closest<HTMLElement>("[data-tabs]");
        if (!container) return;
        const i = tab.getAttribute("data-i");
        container.querySelectorAll<HTMLElement>(".tab").forEach((t) => {
          t.setAttribute("aria-selected", t.getAttribute("data-i") === i ? "true" : "false");
        });
        container.querySelectorAll<HTMLElement>("pre[data-i]").forEach((pre) => {
          if (pre.getAttribute("data-i") === i) pre.removeAttribute("hidden");
          else pre.setAttribute("hidden", "");
        });
        const activePre = container.querySelector<HTMLElement>(`pre[data-i="${i}"] code`);
        const copyBtn2 = container.querySelector<HTMLElement>(".copy");
        if (activePre && copyBtn2) {
          copyBtn2.setAttribute("data-copy", activePre.textContent || "");
        }
        return;
      }
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
