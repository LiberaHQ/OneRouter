"use client";

export function RailToggleButton() {
  function toggle() {
    document.body.classList.toggle("rail-open");
  }
  return (
    <button className="btn icon-btn ghost rail-toggle" aria-label="Toggle navigation" onClick={toggle}>
      ≡
    </button>
  );
}
