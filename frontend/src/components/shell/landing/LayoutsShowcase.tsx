import { LAYOUTS } from '../../../lib/layouts'
import { useCompositionStore } from '../../../state/compositionStore'
import { LayoutDiagram } from './LayoutDiagram'
import { dark, inner, section, sectionEyebrow, sectionHeadCenter, sectionLead, sectionTitle } from './sectionStyles'

/** All ten arrangements the configurator actually offers, drawn from their
 * real geometry (see LayoutDiagram) — not a curated highlight reel, the
 * whole set, because that's exactly what a visitor gets to choose from.
 *
 * "Design this wall" pre-selects the layout in the composition store before
 * any wall exists — `applyLayout` already handles that case (it just records
 * the choice), and `setWall` reads it back the moment a photo is uploaded,
 * so the chosen arrangement is what greets the visitor at the layout step
 * without any new plumbing. */
export function LayoutsShowcase() {
  const applyLayout = useCompositionStore((s) => s.applyLayout)

  return (
    <section id="templates" className={`${section} ${dark}`} aria-labelledby="layouts-heading">
      <div className={inner}>
        <div className={sectionHeadCenter}>
          <p className={sectionEyebrow(true)}>Gallery wall templates</p>
          <h2 id="layouts-heading" className={sectionTitle(true)}>
            Ten arrangements to start from — every one adjustable
          </h2>
          <p className={sectionLead(true)}>Pick the closest shape, then move, resize or add frames until it's exactly right. Nothing here is fixed.</p>
        </div>
        <ul className="m-0 grid list-none grid-cols-5 gap-5 p-0 max-[900px]:grid-cols-3 max-[900px]:gap-4 max-[520px]:grid-cols-2">
          {LAYOUTS.map((layout, i) => (
            <li
              key={layout.id}
              className="group rounded-card bg-surface-dark-2 flex flex-col items-center gap-2 px-3.5 pt-5 pb-[22px] text-center transition-[transform,background-color] duration-150 ease-in-out hover:-translate-y-[3px] hover:bg-[#24405f] focus-within:-translate-y-[3px] focus-within:bg-[#24405f] [&_svg]:mt-0.5 [&_svg]:mb-1 [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-[108px]"
            >
              <span className="text-gold-bright self-start font-sans text-xs font-bold tracking-[0.06em]">{String(i + 1).padStart(2, '0')}</span>
              <LayoutDiagram layout={layout} size={112} />
              <span className="text-on-dark text-sm font-bold">{layout.name}</span>
              <p className="text-on-dark-2 min-h-[34px] text-[12.5px] leading-[1.45]">{layout.description}</p>
              <a
                href="#start"
                onClick={() => applyLayout(layout.id)}
                className="text-gold-bright mt-1 text-[12.5px] font-bold no-underline underline-offset-[3px] group-hover:underline group-focus-within:underline focus-visible:underline"
              >
                Design this wall →
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
