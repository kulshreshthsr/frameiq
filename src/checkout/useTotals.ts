import { useMemo } from 'react'
import { formatMoney } from '../../shared/money'
import { computeOrderTotals } from '../../shared/pricing'
import type { DesignSnapshot } from '../../shared/orderSchema'
import { currentCatalog } from '../domain/catalog'
import { useCheckoutStore } from './checkoutStore'

export interface Line {
  key: string
  quantity: number
  name: string
  detail: string
  totalMinor: number
}

export interface Totals {
  currency: string
  subtotalMinor: number
  deliveryFeeMinor: number
  totalMinor: number
  lines: Line[]
}

/** Lines and totals to show: the SERVER's record once an order exists (what
 * will actually be charged), otherwise the design's own prices. */
export function useTotals(snapshot: DesignSnapshot | null): Totals | null {
  const order = useCheckoutStore((s) => s.order)
  return useMemo(() => {
    if (order) {
      return {
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        deliveryFeeMinor: order.deliveryFeeMinor,
        totalMinor: order.totalMinor,
        lines: order.items.map((item) => ({
          key: `${item.productId}|${item.sizeId}|${item.glassName}|${item.matName}`,
          quantity: item.quantity,
          name: item.productName,
          detail: item.sizeLabel,
          totalMinor: item.lineTotalMinor,
        })),
      }
    }
    if (!snapshot) return null
    const totals = computeOrderTotals(currentCatalog(), snapshot.frames)
    return {
      currency: totals.currency,
      subtotalMinor: totals.subtotalMinor,
      deliveryFeeMinor: totals.deliveryFeeMinor,
      totalMinor: totals.totalMinor,
      lines: totals.lines.map((line) => ({
        key: line.key,
        quantity: line.quantity,
        name: line.productName,
        detail: [line.sizeLabel, line.optionsLabel].filter(Boolean).join(' · '),
        totalMinor: line.lineTotalMinor,
      })),
    }
  }, [order, snapshot])
}

/** The running total, alone — used on the sticky bar. */
export function useCheckoutTotal(): { text: string; frames: number } | null {
  const snapshot = useCheckoutStore((s) => s.snapshot)
  const totals = useTotals(snapshot)
  if (!totals) return null
  return { text: formatMoney(totals.totalMinor, totals.currency), frames: snapshot?.frames.length ?? 0 }
}
