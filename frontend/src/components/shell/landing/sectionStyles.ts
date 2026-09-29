/**
 * Tailwind class strings shared by the landing page's sections (replaces
 * `landing.module.css`). Kept as plain exports rather than wrapper
 * components — each section already picks its own heading tags and JSX
 * structure, and a wrapper wouldn't remove any duplication that isn't
 * already just a class string.
 *
 * `sectionEyebrow`/`sectionTitle`/`sectionLead` take a `dark` flag because
 * the old `.dark .sectionTitle` etc. descendant-selector cascade (one
 * ancestor class silently recoloring three kinds of children) has no
 * Tailwind equivalent — the caller states it explicitly instead. Only
 * `LayoutsShowcase` currently passes `true`.
 */
export const section = 'px-6 py-22 max-md:px-5 max-md:py-14'
export const sectionTight = 'px-6 py-16 max-md:px-5 max-md:py-11'
export const band = 'bg-card border-t border-b border-line'
export const dark = 'bg-surface-dark text-on-dark-2'
export const inner = 'w-full max-w-[1080px] mx-auto'
export const sectionHead = 'max-w-[640px] mb-11 max-md:mb-8'
export const sectionHeadCenter = 'max-w-[560px] mx-auto mb-11 text-center max-md:mb-8'

export function sectionEyebrow(isDark = false) {
  return `mb-2.5 text-xs font-bold tracking-[0.08em] uppercase ${isDark ? 'text-gold-bright' : 'text-accent'}`
}

export function sectionTitle(isDark = false) {
  return `font-serif text-[clamp(26px,3vw,36px)] leading-[1.15] font-medium tracking-[-0.015em] ${isDark ? 'text-on-dark' : 'text-ink'}`
}

export function sectionLead(isDark = false) {
  return `mt-3 text-base leading-[1.6] ${isDark ? 'text-on-dark-2' : 'text-ink-2'}`
}
