import { HeroIllustration } from './HeroIllustration'

/**
 * The product is the hero: a real before/after demonstration sits beside the
 * promise, not a paragraph explaining it. The actual entry point (uploading
 * a wall photo) is the very next thing on the page, not buried — "Design
 * your wall" scrolls straight to it rather than opening the file picker
 * itself, so nothing surprises the visitor before they've decided to.
 */
export function Hero() {
  return (
    <div className="relative overflow-hidden bg-[linear-gradient(180deg,var(--color-paper-2)_0%,var(--color-paper)_60%)] px-6 pt-14 pb-16 max-[999px]:px-5 max-[999px]:pt-8 max-[999px]:pb-10">
      {/* A faint architectural grid behind the copy — the same geometric
          language as the logo mark, without resorting to a gradient blob or
          glassmorphism for "depth". Pure CSS, no image request. */}
      <div
        aria-hidden
        className="[mask-image:radial-gradient(ellipse_70%_60%_at_30%_20%,black,transparent_75%)] [-webkit-mask-image:radial-gradient(ellipse_70%_60%_at_30%_20%,black,transparent_75%)] absolute inset-0 bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-[length:64px_64px] opacity-50 pointer-events-none"
      />
      <div className="relative grid max-w-[1160px] grid-cols-[minmax(0,1fr)_minmax(0,460px)] items-center gap-14 mx-auto max-[999px]:grid-cols-[minmax(0,1fr)] max-[999px]:gap-7">
        <div className="flex flex-col gap-5">
          <p className="eyebrow">Custom wall frames</p>
          <h1 className="font-serif text-[clamp(36px,4.4vw,58px)] leading-[1.06] font-medium tracking-[-0.02em] text-ink">Design your wall before you buy it.</h1>
          <p className="max-w-[34em] text-lg leading-[1.6] text-ink-2 max-[999px]:text-base">
            Upload your wall, arrange your photos and frames, and see the finished design at real sizes and real prices — before
            anything is made.
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            <a href="#start" className="btn btnPrimary">
              Design your wall
            </a>
            <a href="#templates" className="btn btnSecondary">
              Browse gallery walls
            </a>
          </div>
          <ul className="m-0 flex flex-wrap gap-x-[18px] gap-y-2 p-0 text-[13.5px] font-semibold text-ink-3 [&>li]:relative [&>li]:pl-4 [&>li::before]:absolute [&>li::before]:top-1/2 [&>li::before]:left-0 [&>li::before]:h-1.5 [&>li::before]:w-1.5 [&>li::before]:-translate-y-1/2 [&>li::before]:rounded-full [&>li::before]:bg-accent [&>li::before]:content-['']">
            <li>Free to design</li>
            <li>No account required</li>
            <li>See your price instantly</li>
          </ul>
        </div>
        <div className="min-w-0 max-[999px]:order-first">
          <HeroIllustration />
        </div>
      </div>
    </div>
  )
}
