import { LAYOUTS } from '../../../lib/layouts'
import { useCompositionStore } from '../../../state/compositionStore'
import { LayoutDiagram } from './LayoutDiagram'
import landing from './landing.module.css'
import styles from './LayoutsShowcase.module.css'

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
    <section id="templates" className={`${landing.section} ${landing.dark}`} aria-labelledby="layouts-heading">
      <div className={landing.inner}>
        <div className={landing.sectionHeadCenter}>
          <p className={landing.sectionEyebrow}>Gallery wall templates</p>
          <h2 id="layouts-heading" className={landing.sectionTitle}>
            Ten arrangements to start from — every one adjustable
          </h2>
          <p className={landing.sectionLead}>Pick the closest shape, then move, resize or add frames until it's exactly right. Nothing here is fixed.</p>
        </div>
        <ul className={styles.grid}>
          {LAYOUTS.map((layout, i) => (
            <li key={layout.id} className={styles.item}>
              <span className={styles.index}>{String(i + 1).padStart(2, '0')}</span>
              <LayoutDiagram layout={layout} size={112} />
              <span className={styles.name}>{layout.name}</span>
              <p className={styles.desc}>{layout.description}</p>
              <a href="#start" className={styles.use} onClick={() => applyLayout(layout.id)}>
                Design this wall →
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
