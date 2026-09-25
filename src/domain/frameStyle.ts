import type { FrameStyleConfig } from '../types/frame'
import { getFrameStyle } from '../lib/frameStyles'
import { getProduct, matHasMat, productShipsWithMat, type MatId } from './catalog'

/** A mat added to a product that doesn't ship with one. */
const ADDED_MAT = { matColor: '#f4f0e6', innerThicknessRatio: 0.07 } as const

const resolvedStyles = new Map<string, FrameStyleConfig>()

/**
 * The visual style for a product + mat choice. The renderer only knows about
 * `FrameStyleConfig`; this is where product options become pixels.
 *  - Ships with a mat, mat wanted: the style as designed.
 *  - Ships with a mat, "No mat": the same style with the mat removed.
 *  - Ships without a mat, mat wanted: an added neutral mat.
 *
 * Identical inputs return the identical object, so React.memo and effect
 * dependencies downstream can rely on reference equality.
 */
export function resolveFrameStyle(productId: string, matId: MatId): FrameStyleConfig {
  const wantsMat = matHasMat(matId)
  const cacheKey = `${productId}|${wantsMat}`
  const cached = resolvedStyles.get(cacheKey)
  if (cached) return cached

  const product = getProduct(productId)
  const base = getFrameStyle(product.styleId)
  const shipsWithMat = productShipsWithMat(product)
  let style = base
  if (!wantsMat && shipsWithMat) style = { ...base, matColor: null, innerThicknessRatio: 0 }
  else if (wantsMat && !shipsWithMat) style = { ...base, ...ADDED_MAT }

  resolvedStyles.set(cacheKey, style)
  return style
}
