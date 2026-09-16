"use client";

import { useEffect } from "react";

// The chat route owns the whole viewport (shell(chrome=False, extra_class="app-body")
// in the original). Next's root layout owns the single <body> tag, so this toggles the
// class on mount/unmount rather than setting it statically.
export function AppBodyClass() {
  useEffect(() => {
    document.body.classList.add("app-body");
    return () => document.body.classList.remove("app-body");
  }, []);
  return null;
}
