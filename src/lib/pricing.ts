import type { FrameInstance } from '../types/frame'
import { getFrameStyle } from './frameStyles'

/** Flat per-frame price by style — a simple, transparent estimate for this
 * prototype, not a real transactional price (no size tiers, taxes, shipping). */
const STYLE_BASE_PRICE: Record<string, number> = {
  'natural-oak': 89,
  walnut: 99,
  'matte-black': 79,
  white: 79,
  'dark-brown': 99,
  gold: 129,
}

export interface PriceLineItem {
  frameId: string
  styleName: string
  price: number
}

export interface PriceEstimate {
  lineItems: PriceLineItem[]
  total: number
}

export function estimatePrice(frames: FrameInstance[]): PriceEstimate {
  const lineItems = frames.map((frame) => {
    const style = getFrameStyle(frame.styleId)
    return {
      frameId: frame.id,
      styleName: style.name,
      price: STYLE_BASE_PRICE[frame.styleId] ?? 89,
    }
  })
  return {
    lineItems,
    total: lineItems.reduce((sum, item) => sum + item.price, 0),
  }
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}
