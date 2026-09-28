import { Suspense, lazy, useEffect } from 'react'
import { Faq } from './landing/Faq'
import { FinalCta } from './landing/FinalCta'
import { Hero } from './landing/Hero'
import { HowItWorks } from './landing/HowItWorks'
import { LandingFooter } from './landing/LandingFooter'
import { LayoutsShowcase } from './landing/LayoutsShowcase'
import { StartSection } from './landing/StartSection'
import { WhySection } from './landing/WhySection'
import styles from './Landing.module.css'

// FrameStylesShowcase draws real frames with the same Konva-based renderer
// the configurator uses (`FrameSwatch`) — genuine, but Konva is the heaviest
// dependency in the app, and Workspace already loads it lazily so a first
// visit stays fast. Loading it here eagerly would undo that for every
// visitor, even ones who never get past the hero. Split the same way, and
// (also like Workspace) start fetching it in the background once the page
// is up, so it's usually ready by the time someone scrolls to it.
const loadFrameStyles = () => import('./landing/FrameStylesShowcase')
const FrameStylesShowcase = lazy(() => loadFrameStyles().then((m) => ({ default: m.FrameStylesShowcase })))

/**
 * The marketing page a first-time visitor sees — everything before there's a
 * wall to work on (`App.tsx` swaps this for the real `Workspace` the moment
 * `wall` is set). The product itself is the hero (`Hero`'s before/after
 * demonstration), with the real upload entry point (`StartSection`,
 * unchanged from before this redesign) as the very next thing, not buried
 * under marketing copy.
 *
 * Every claim and visual below the hero is backed by something real in the
 * app — real layouts (`LayoutsShowcase`), the real catalog rendered with the
 * real frame-drawing code (`FrameStylesShowcase`), real product behaviour
 * (`WhySection`, `Faq`) — rather than stock photography or invented social
 * proof, neither of which this product has.
 */
export function Landing() {
  useEffect(() => {
    void loadFrameStyles()
  }, [])

  return (
    <div className={styles.landing}>
      <Hero />
      <StartSection />
      <HowItWorks />
      <LayoutsShowcase />
      <Suspense fallback={null}>
        <FrameStylesShowcase />
      </Suspense>
      <WhySection />
      <Faq />
      <FinalCta />
      <LandingFooter />
    </div>
  )
}
