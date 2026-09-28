import type { LayoutDefinition } from '../../../types/frame'

/**
 * A layout drawn from its real geometry — the exact `xPct/yPct/wPct/hPct`
 * (and `rotation`, for the asymmetrical ones) every layout in the app is
 * defined by (`lib/layouts.ts`). Not an illustration standing in for the
 * product: it's the same numbers the configurator places frames with, so
 * showing "10 arrangements" here never drifts from what customers actually
 * get.
 */
export function LayoutDiagram({ layout, size = 96 }: { layout: LayoutDefinition; size?: number }) {
  const pad = size * 0.08
  const w = size - pad * 2
  const h = size - pad * 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={layout.name}>
      <rect x={0} y={0} width={size} height={size} rx={8} fill="var(--card)" stroke="var(--line)" />
      {layout.slots.map((slot) => {
        const sw = slot.wPct * w
        const sh = slot.hPct * h
        const cx = pad + slot.xPct * w
        const cy = pad + slot.yPct * h
        return (
          <rect
            key={slot.id}
            x={-sw / 2}
            y={-sh / 2}
            width={sw}
            height={sh}
            rx={1.5}
            fill="var(--paper)"
            stroke="var(--ink-3)"
            strokeWidth={1.5}
            transform={`translate(${cx} ${cy}) rotate(${slot.rotation ?? 0})`}
          />
        )
      })}
    </svg>
  )
}
