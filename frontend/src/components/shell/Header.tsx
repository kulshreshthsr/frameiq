import { DecorylLogo } from '../brand/DecorylLogo'
import { StepProgress } from '../Journey/StepProgress'

function RestartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The marketing nav's routes are all real in-page anchors on the landing
// page (there's no separate router for account/search/cart — this product
// doesn't have those), so the header's center links point straight at the
// sections that actually exist rather than a navigation menu the app can't
// back up.
const MARKETING_LINKS = [
  { href: '#start', label: 'Design your wall' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#templates', label: 'Gallery walls' },
  { href: '#faq', label: 'FAQ' },
]

interface HeaderProps {
  /** Whether a design is in progress (shows the steps and "Start over"). */
  hasDesign: boolean
  onStartOver: () => void
  /** True once the marketing page has been scrolled past its hero — used
   * only to tighten the header slightly, never to hide anything in it.
   * Never true at the same time as hasDesign (App.tsx only sets it when
   * there's no wall yet). */
  compact?: boolean
}

export function Header({ hasDesign, onStartOver, compact = false }: HeaderProps) {
  // Compact overrides the responsive padding outright (it's a JS state, not
  // a viewport one) — chosen as one or the other rather than emitting both
  // conditionally, since two plain utility classes touching the same
  // padding side would resolve by Tailwind's internal stylesheet order, not
  // by which one appears later in this string. The mobile padding itself
  // differs between the two headers (4px/8px with the step progress, 8px/16px
  // on the marketing nav), matching the original two separate selectors.
  const padding = compact ? 'px-6' : hasDesign ? 'px-7 max-[999px]:pr-1 max-[999px]:pl-2' : 'px-7 max-[999px]:pr-2 max-[999px]:pl-4'
  const minHeight = compact ? 'min-h-14' : 'min-h-[68px] max-[999px]:min-h-14'

  return (
    <header
      className={`flex items-center justify-between gap-4 border-b border-line bg-paper transition-[min-height,padding] duration-200 ease-in-out ${minHeight} ${padding} ${compact ? 'shadow-soft' : ''} ${hasDesign ? 'min-[1000px]:grid min-[1000px]:grid-cols-[1fr_auto_1fr] min-[1000px]:gap-4' : ''}`}
    >
      {hasDesign ? (
        <>
          <span className="max-[999px]:hidden inline-flex whitespace-nowrap text-ink">
            <DecorylLogo size={compact ? 26 : 32} />
          </span>
          <div className="min-w-0 max-[999px]:flex-1">
            <StepProgress />
          </div>
          <div className="flex flex-none justify-end">
            <button type="button" className="btnText max-[999px]:hidden" onClick={onStartOver} data-testid="start-over">
              Start over
            </button>
            <button
              type="button"
              className="text-ink-2 hidden h-11 w-11 items-center justify-center rounded-lg bg-none hover:bg-paper-2 max-[999px]:inline-flex"
              onClick={onStartOver}
              aria-label="Start a new design"
            >
              <RestartIcon />
            </button>
          </div>
        </>
      ) : (
        <>
          <a href="#top" className="inline-flex whitespace-nowrap text-ink no-underline" aria-label="Decoryl — back to top">
            <DecorylLogo size={compact ? 26 : 32} />
          </a>
          <nav className="flex flex-1 items-center justify-center gap-7 max-[899px]:hidden" aria-label="Site">
            {MARKETING_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-ink-2 text-sm font-semibold whitespace-nowrap no-underline hover:text-ink">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-none justify-end">
            <a href="#start" className="btn btnPrimary btnCompact flex-none max-[560px]:px-3.5 max-[560px]:text-[13px]">
              Design your wall
            </a>
          </div>
        </>
      )}
    </header>
  )
}
