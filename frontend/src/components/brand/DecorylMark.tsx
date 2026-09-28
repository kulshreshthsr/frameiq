/**
 * The DECORYL mark — a picture frame drawn in perspective (outer edge, inner
 * window, and the corner struts between them that read as frame depth),
 * capped with a peaked "roofline" that doubles as a hang point. Redrawn as a
 * vector from the approved logo reference rather than traced from it.
 *
 * Line color follows `currentColor` so it can sit in navy on paper or in
 * ivory on a dark section; the bottom bevel is always the brand gold — it's
 * a fixed accent, not something that inverts with the surface.
 */
export function DecorylMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 240 240" fill="none" aria-hidden focusable="false">
      <defs>
        <linearGradient id="decoryl-mark-gold" x1="90" y1="168" x2="188" y2="212" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8a6d2a" />
          <stop offset="1" stopColor="#e0b45c" />
        </linearGradient>
      </defs>
      <path d="M94 192 L188 212 L158 180 L90 170 Z" fill="url(#decoryl-mark-gold)" />
      <path d="M120 18 L175 88 L188 212 L94 192 L65 80 Z" stroke="currentColor" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M84 102 L150 110 L158 180 L90 170 Z" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" />
      <path d="M65 80 L84 102 M175 88 L150 110 M188 212 L158 180 M94 192 L90 170" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    </svg>
  )
}
