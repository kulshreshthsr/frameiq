import { activeProducts, defaultMatFor, startingPriceMinor } from '../../../domain/catalog'
import { formatMoney } from '../../../../../shared/money'
import { FrameSwatch } from '../../shared/FrameSwatch'
import { inner, section, sectionEyebrow, sectionHead, sectionLead, sectionTitle } from './sectionStyles'

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
    <section className={section} aria-labelledby="styles-heading">
      <div className={inner}>
        <div className={sectionHead}>
          <p className={sectionEyebrow()}>Frame styles</p>
          <h2 id="styles-heading" className={sectionTitle()}>
            Real finishes, shown as they'll actually look
          </h2>
          <p className={sectionLead()}>The same rendering the configurator uses, so what you pick here is exactly what appears on your wall.</p>
        </div>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-7 p-0">
          {products.map((product) => (
            <li key={product.id} className="rounded-card flex flex-col items-center gap-1 px-3 py-5 text-center transition-colors duration-150 ease-in-out hover:bg-card">
              <div className="mb-2.5">
                <FrameSwatch productId={product.id} matId={defaultMatFor(product)} photo={null} frameWidth={92} frameHeight={116} />
              </div>
              <span className="font-serif text-base font-medium text-ink">{product.name}</span>
              <span className="text-[13px] text-ink-3">{product.tagline}</span>
              <span className="mt-1.5 text-[13px] font-bold text-accent">From {formatMoney(startingPriceMinor(product))}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
