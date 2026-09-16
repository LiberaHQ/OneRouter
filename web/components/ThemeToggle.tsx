'use client';

/** Flips the theme and remembers it. The initial value is applied before paint by an
 *  inline script in the layout, so there is no flash of the wrong theme. */
export default function ThemeToggle() {
  return (
    <button
      className="btn icon-btn ghost"
      aria-label="Toggle colour theme"
      onClick={() => {
        const root = document.documentElement;
        const next = root.dataset.theme === 'light' ? 'dark' : 'light';
        root.dataset.theme = next;
        try {
          localStorage.setItem('or-theme', next);
        } catch {
          /* private mode */
        }
      }}
    >
      ◐
    </button>
  );
}
