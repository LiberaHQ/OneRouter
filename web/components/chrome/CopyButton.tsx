"use client";

import { useState } from "react";

export function CopyButton({
  text,
  className = "copy",
  children = "Copy",
}: {
  text: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1300);
    } catch {
      // clipboard unavailable — nothing to fall back to
    }
  }

  return (
    <button type="button" className={done ? `${className} done` : className} onClick={copy}>
      {done ? "Copied" : children}
    </button>
  );
}
