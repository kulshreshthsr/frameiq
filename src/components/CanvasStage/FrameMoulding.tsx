import { Fragment, useMemo } from 'react'
import { Line, Rect } from 'react-konva'
import type { FrameStyleConfig } from '../../types/frame'
import { computeMouldingEdges, generateGrainLines, type MouldingEdgeName } from '../../lib/frameGeometry'
import { darken, lighten } from '../../lib/color'
import { seededRandom } from '../../lib/random'

interface FrameMouldingProps {
  width: number
  height: number
  style: FrameStyleConfig
  outerThickness: number
  innerThickness: number
  /** Ambient lighting nudge sampled from the wall around this frame —
   * defaults to neutral (1). Only bounded to a gentle contrast nudge on the
   * bevel shading, per "no full relighting yet". */
  lightingFactor?: number
}

const EDGE_ORDER: MouldingEdgeName[] = ['top', 'right', 'bottom', 'left']

// Light source from the top-left (the contact shadow follows the same light —
// see LIGHT_SHADOW_SKEW in lib/frameGeometry): each edge gets its own outer→inner shade
// pair so the moulding reads as a raised, bevelled profile rather than a
// flat rectangle. `contrast` bundles bevelStrength with the wall's sampled
// ambient brightness — a brighter wall pushes the highlight/shadow split a
// little wider, a dimmer wall compresses it, without fully relighting.
function edgeShades(baseColor: string, contrast: number) {
  return {
    top: [lighten(baseColor, 0.34 * contrast), lighten(baseColor, 0.14 * contrast)],
    left: [lighten(baseColor, 0.18 * contrast), lighten(baseColor, 0.05 * contrast)],
    right: [darken(baseColor, 0.13 * contrast), darken(baseColor, 0.03 * contrast)],
    bottom: [darken(baseColor, 0.36 * contrast), darken(baseColor, 0.16 * contrast)],
  } satisfies Record<MouldingEdgeName, [string, string]>
}

/** Renders the physical frame body — mitred moulding with bevel shading and
 * optional wood grain, plus the mat/liner and its inner reveal line. Driven
 * entirely by a FrameStyleConfig; there is no per-style component. */
export function FrameMoulding({ width, height, style, outerThickness, innerThickness, lightingFactor = 1 }: FrameMouldingProps) {
  // A brighter wall widens the bevel's highlight/shadow split a little,
  // a dimmer one compresses it — a nudge, not a relight (clamped tight).
  const contrast = style.bevelStrength * Math.min(1.15, Math.max(0.85, lightingFactor))
  const shades = useMemo(() => edgeShades(style.woodColor, contrast), [style.woodColor, contrast])
  const edges = useMemo(() => computeMouldingEdges(width, height, outerThickness), [width, height, outerThickness])

  const showGrain = style.material === 'wood' && style.grainOpacity > 0 && outerThickness > 6
  const rng = useMemo(() => (showGrain ? seededRandom(style.id) : null), [showGrain, style.id])

  const openingInset = outerThickness + innerThickness
  const revealColor = style.matColor ? darken(style.matColor, 0.25) : darken(style.woodColor, 0.4)

  return (
    <>
      <Rect width={width} height={height} fill={style.woodColor} />

      {EDGE_ORDER.map((edge) => {
        const edgeGeo = edges[edge]
        const grainLines = rng ? generateGrainLines(edge, width, height, outerThickness, 4, rng) : []
        return (
          <Fragment key={edge}>
            <Line
              points={edgeGeo.points}
              closed
              fillLinearGradientStartPoint={edgeGeo.gradientStart}
              fillLinearGradientEndPoint={edgeGeo.gradientEnd}
              fillLinearGradientColorStops={[0, shades[edge][0], 1, shades[edge][1]]}
              listening={false}
            />
            {grainLines.map((points, i) => (
              <Line
                key={i}
                points={points}
                stroke={i % 2 === 0 ? darken(style.woodColor, 0.18) : lighten(style.woodColor, 0.12)}
                strokeWidth={Math.max(0.5, outerThickness * 0.02)}
                opacity={style.grainOpacity * (0.7 + (rng ? rng() : 0.5) * 0.6)}
                listening={false}
              />
            ))}
          </Fragment>
        )
      })}

      {/* Mitre seams at each corner, tracing the trapezoid joins. */}
      {[
        [0, 0, outerThickness, outerThickness],
        [width, 0, width - outerThickness, outerThickness],
        [width, height, width - outerThickness, height - outerThickness],
        [0, height, outerThickness, height - outerThickness],
      ].map((points, i) => (
        <Line key={i} points={points} stroke={darken(style.woodColor, 0.35)} strokeWidth={0.75} opacity={0.35} listening={false} />
      ))}

      {style.matColor && innerThickness > 0 && (
        <>
          <Rect
            x={outerThickness}
            y={outerThickness}
            width={width - 2 * outerThickness}
            height={height - 2 * outerThickness}
            fill={style.matColor}
            listening={false}
          />
          {/* Recess groove where the moulding's inner lip steps down to the
              mat — a dark/light stroke pair right at the boundary reads as a
              physical step rather than two flat colors touching. */}
          <Rect
            x={outerThickness}
            y={outerThickness}
            width={Math.max(0, width - 2 * outerThickness)}
            height={Math.max(0, height - 2 * outerThickness)}
            stroke={darken(style.woodColor, 0.45)}
            strokeWidth={Math.max(0.75, outerThickness * 0.06)}
            opacity={0.4}
            listening={false}
          />
          <Rect
            x={outerThickness + Math.max(1, outerThickness * 0.08)}
            y={outerThickness + Math.max(1, outerThickness * 0.08)}
            width={Math.max(0, width - 2 * (outerThickness + Math.max(1, outerThickness * 0.08)))}
            height={Math.max(0, height - 2 * (outerThickness + Math.max(1, outerThickness * 0.08)))}
            stroke={lighten(style.matColor, 0.55)}
            strokeWidth={Math.max(0.5, outerThickness * 0.03)}
            opacity={0.3}
            listening={false}
          />
        </>
      )}

      {/* Reveal line where the opening meets the mat (or moulding, if there's no mat). */}
      <Rect
        x={openingInset}
        y={openingInset}
        width={Math.max(0, width - 2 * openingInset)}
        height={Math.max(0, height - 2 * openingInset)}
        stroke={revealColor}
        strokeWidth={Math.max(1, innerThickness * 0.08 || outerThickness * 0.04)}
        opacity={0.5}
        listening={false}
      />
    </>
  )
}
