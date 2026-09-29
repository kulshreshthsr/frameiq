import { WallUploader } from '../../WallUploader/WallUploader'
import { sectionEyebrow, sectionTight } from './sectionStyles'

/** The real entry point — unchanged functionally from before this redesign,
 * just given a section of its own to land in rather than sharing the hero
 * with the headline. */
export function StartSection() {
  return (
    <section id="start" className={`${sectionTight} scroll-mt-6`} aria-labelledby="start-heading">
      <div className="mx-auto max-w-[540px] text-center">
        <p className={sectionEyebrow()}>Step one</p>
        <h2 id="start-heading" className="font-serif text-[clamp(24px,2.8vw,32px)] font-medium text-ink">
          Start with a photo of your own wall
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-ink-2">
          Any wall, any room, any phone camera. You’ll mark the wall and set its width next, so everything after this is sized correctly.
        </p>
        <div className="mt-7 text-left">
          <WallUploader />
        </div>
      </div>
    </section>
  )
}
