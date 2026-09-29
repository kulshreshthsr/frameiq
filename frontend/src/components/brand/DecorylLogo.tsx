import { DecorylMark } from './DecorylMark'

/**
 * The full lockup: mark + wordmark. `variant="dark"` is for placement on a
 * dark navy section (footer, immersive bands) — the wordmark switches to
 * ivory since navy-on-navy would disappear.
 */
export function DecorylLogo({ variant = 'light', size = 34 }: { variant?: 'light' | 'dark'; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-[9px] ${variant === 'dark' ? 'text-on-dark' : 'text-ink'}`}>
      <DecorylMark size={size} className="flex-none" />
      <span className="font-sans text-[19px] font-bold tracking-[0.06em] uppercase whitespace-nowrap text-inherit">Decoryl</span>
    </span>
  )
}
