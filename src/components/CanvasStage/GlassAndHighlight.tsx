import { Group, Line, Rect } from 'react-konva'
import type { FrameStyleConfig } from '../../types/frame'

interface GlassAndHighlightProps {
  x: number
  y: number
  width: number
  height: number
  style: FrameStyleConfig
  /** Ambient lighting nudge sampled from the wall around this frame —
   * defaults to neutral (1). */
  lightingFactor?: number
}

/** The glass pane covering the photo opening: a faint tint, a very subtle
 * ambient reflection sheen, a bright inner-edge line where the frame's lip
 * catches light, and a soft inner-edge vignette where the mat's lip (which
 * physically sits a little proud of the glass) shades the photo just inside
 * its border. Drawn after the photo so all of it reads as glass sitting on
 * top, never merged into the photo itself. Deliberately restrained — this
 * should read as "glass is there", not an obvious reflective flash. */
export function GlassAndHighlight({ x, y, width, height, style, lightingFactor = 1 }: GlassAndHighlightProps) {
  if (width <= 0 || height <= 0) return null

  // Bounded, damped response to the wall's ambient brightness — a nudge to
  // the sheen/highlight intensity, not a relight.
  const lightResponse = Math.min(1.2, Math.max(0.8, lightingFactor))
  const streakWidth = width * 0.5
  const streakDrop = height * 0.42
  const vignetteBlur = Math.min(width, height) * 0.06

  return (
    <Group x={x} y={y} listening={false}>
      <Rect width={width} height={height} fill={style.glassTintColor} opacity={style.glassOpacity} />

      {/*
        Points are kept within [0,width]x[0,height] on purpose: Konva's
        Transformer sizes its selection box from raw shape geometry and
        ignores clipFunc, so any point drawn outside the opening (even if
        visually clipped) would silently inflate the frame's selection
        handles. A clipping Group is kept as a defensive backstop only.
      */}
      <Group
        clipFunc={(ctx) => {
          ctx.rect(0, 0, width, height)
        }}
      >
        {/* Mat's inner edge sits slightly proud of the glass, casting a
            soft shadow onto the photo just inside its own border. A thin
            stroke right at the boundary with a blurred shadow, clipped by
            the parent Group so only the inward half of the blur survives —
            a graduated vignette rather than a hard-edged band. */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          stroke="black"
          strokeWidth={1}
          shadowColor="black"
          shadowBlur={vignetteBlur}
          shadowOpacity={0.35}
          listening={false}
        />

        <Line
          points={[
            0,
            height * 0.04,
            streakWidth,
            height * 0.04,
            streakWidth * 0.4,
            streakDrop,
            0,
            streakDrop,
          ]}
          closed
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: width * 0.35, y: height * 0.35 }}
          fillLinearGradientColorStops={[
            0,
            `rgba(255,255,255,${0.28 * style.highlightStrength * lightResponse})`,
            1,
            'rgba(255,255,255,0)',
          ]}
        />
      </Group>

      <Rect
        width={width}
        height={height}
        stroke={`rgba(255,255,255,${(0.22 + 0.16 * style.highlightStrength) * lightResponse})`}
        strokeWidth={Math.max(1, Math.min(width, height) * 0.006)}
      />
    </Group>
  )
}
