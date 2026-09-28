import { activeProducts, defaultMatFor, startingPriceMinor } from '../../../domain/catalog'
import { formatMoney } from '../../../../../shared/money'
import { FrameSwatch } from '../../shared/FrameSwatch'
import landing from './landing.module.css'
import styles from './FrameStylesShowcase.module.css'

/**
 * Every active product in the real catalog, rendered with the same
 * `FrameSwatch` component the configurator itself uses (real moulding, mat
 * and glass — not a mockup of one), with the real starting price. Editing
 * the catalog changes this section automatically; nothing here is hand-kept
 * in sync.
 */
export function FrameStylesShowcase() {
  const products = activeProducts()

  return (
    <section className={landing.section} aria-labelledby="styles-heading">
      <div className={landing.inner}>
        <div className={landing.sectionHead}>
          <p className={landing.sectionEyebrow}>Frame styles</p>
          <h2 id="styles-heading" className={landing.sectionTitle}>
            Real finishes, shown as they'll actually look
          </h2>
          <p className={landing.sectionLead}>The same rendering the configurator uses, so what you pick here is exactly what appears on your wall.</p>
        </div>
        <ul className={styles.grid}>
          {products.map((product) => (
            <li key={product.id} className={styles.item}>
              <div className={styles.swatch}>
                <FrameSwatch productId={product.id} matId={defaultMatFor(product)} photo={null} frameWidth={92} frameHeight={116} />
              </div>
              <span className={styles.name}>{product.name}</span>
              <span className={styles.tagline}>{product.tagline}</span>
              <span className={styles.price}>From {formatMoney(startingPriceMinor(product))}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
