/**
 * The Koul mark, "Orbit": a ring (always watching) with a lime watcher on it, cut out of the ring by a thin gap of
 * the ground colour so it reads at 16 px. Drawn on a 64 grid; the ring takes the text colour.
 */
export function KoulMark({ className, ground = "var(--background)", title }: { className?: string; /** The colour behind the mark, for the gap around the dot. */ ground?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" strokeWidth="10" />
      <circle cx="46.8" cy="17.2" r="10" fill="var(--lime)" stroke={ground} strokeWidth="5" paintOrder="stroke" />
    </svg>
  );
}

