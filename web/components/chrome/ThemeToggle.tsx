"use client";

export function ThemeToggle({ className = "btn icon-btn ghost" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("or-theme", next);
    } catch {
      // storage unavailable — theme just won't persist across reloads
    }
  }
  return (
    <button className={className} aria-label="Toggle colour theme" onClick={toggle}>
      ◐
    </button>
  );
}
