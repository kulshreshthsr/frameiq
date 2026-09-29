import { DecorylLogo } from '../../brand/DecorylLogo'

/** Deliberately minimal — no links to Terms/Privacy/social pages that don't
 * exist yet, no invented company details. Just the brand and the real
 * sections of the site. */
export function LandingFooter() {
  return (
    <footer className="bg-surface-dark text-on-dark-2 px-6 pt-12 pb-[calc(48px+var(--spacing-safe))]">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-start justify-between gap-6">
        <div className="flex max-w-[360px] flex-col gap-2.5">
          <DecorylLogo variant="dark" size={28} />
          <p className="text-on-dark-2 text-[13px]">Custom wall frames, designed on your own wall first.</p>
        </div>
        <nav className="flex flex-wrap gap-x-7 gap-y-2" aria-label="Footer">
          <a href="#start" className="text-on-dark text-[13px] font-semibold no-underline hover:underline hover:underline-offset-[3px]">
            Design your wall
          </a>
          <a href="#how-it-works" className="text-on-dark text-[13px] font-semibold no-underline hover:underline hover:underline-offset-[3px]">
            How it works
          </a>
          <a href="#templates" className="text-on-dark text-[13px] font-semibold no-underline hover:underline hover:underline-offset-[3px]">
            Gallery walls
          </a>
          <a href="#faq" className="text-on-dark text-[13px] font-semibold no-underline hover:underline hover:underline-offset-[3px]">
            FAQ
          </a>
        </nav>
      </div>
    </footer>
  )
}
