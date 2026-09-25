import { buildQuote as buildQuoteFor, computeOrderTotals as computeTotalsFor, priceFrame as priceFrameFor } from '../../shared/pricing'
import type { ConfiguredFrame, OrderTotals, Quote } from '../../shared/pricing'
import type { Minor } from '../../shared/money'
import { currentCatalog } from './catalog'

/**
 * The browser's pricing entry points: the shared engine, bound to whichever
 * catalog is current. There is deliberately no second implementation of the
 * pricing rules — the server runs the same functions.
 */

export type { ConfiguredFrame, OrderTotals, Quote }

export function priceFrame(frame: Pick<ConfiguredFrame, 'productId' | 'sizeId' | 'glassId' | 'matId'>): Minor | null {
  return priceFrameFor(currentCatalog(), frame)
}

export function buildQuote(frames: readonly ConfiguredFrame[]): Quote {
  return buildQuoteFor(currentCatalog(), frames)
}

export function computeOrderTotals(frames: readonly ConfiguredFrame[]): OrderTotals {
  return computeTotalsFor(currentCatalog(), frames)
}
