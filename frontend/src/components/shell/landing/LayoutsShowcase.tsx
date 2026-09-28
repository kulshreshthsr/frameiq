import { LAYOUTS } from '../../../lib/layouts'
import { LayoutDiagram } from './LayoutDiagram'
import landing from './landing.module.css'
import styles from './LayoutsShowcase.module.css'

/** All ten arrangements the configurator actually offers, drawn from their
 * real geometry (see LayoutDiagram) — not a curated highlight reel, the
 * whole set, because that's exactly what a visitor gets to choose from. */
export function LayoutsShowcase() {
  return (
    <section className={`${landing.section} ${landing.band}`} aria-labelledby="layouts-heading">
      <div className={landing.inner}>
        <div className={landing.sectionHead}>
          <p className={landing.sectionEyebrow}>Gallery layouts</p>
          <h2 id="layouts-heading" className={landing.sectionTitle}>
            Ten arrangements to start from — every one adjustable
          </h2>
          <p className={landing.sectionLead}>Pick the closest shape, then move, resize or add frames until it's exactly right. Nothing here is fixed.</p>
        </div>
        <ul className={styles.grid}>
          {LAYOUTS.map((layout) => (
            <li key={layout.id} className={styles.item}>
              <LayoutDiagram layout={layout} />
              <span className={styles.name}>{layout.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
