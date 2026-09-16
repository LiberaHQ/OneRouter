/**
 * The brand mark: one input fanning out to three routes. `currentColor` throughout so
 * the badge's own tokens drive it and light mode needs no second copy.
 */
export default function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
        <path d="M5.95 12H17.75" />
        <path d="M12.8 12c3.69 0 3.69-6 4.95-6" />
        <path d="M12.8 12c3.69 0 3.69 6 4.95 6" />
        <circle cx="4.2" cy="12" r="1.75" fill="currentColor" stroke="none" />
        <circle cx="19.5" cy="6" r="1.75" fill="currentColor" stroke="none" />
        <circle cx="19.5" cy="12" r="1.75" fill="currentColor" stroke="none" />
        <circle cx="19.5" cy="18" r="1.75" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
