import type Konva from 'konva'
import { Circle, Line } from 'react-konva'
import type { PerspectiveCorners } from '../../types/frame'
import { quadToPoints } from '../../lib/perspective'
import { clamp } from '../../lib/geometry'

interface QuadConnectorLinesProps {
  from: PerspectiveCorners
  to: PerspectiveCorners
  color?: string
}

const CORNER_KEYS_FOR_CONNECTOR: (keyof PerspectiveCorners)[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']

/** Four thin dashed lines, one per corner, from one quad's corner to the
 * matching corner of another quad — makes it visually obvious how far (and
 * in which direction) a frame's own perspective corners are from a
 * developer's wall-plane reference guide, updating live as either is
 * dragged. (Developer tooling.) */
export function QuadConnectorLines({ from, to, color = '#22b573' }: QuadConnectorLinesProps) {
  return (
    <>
      {CORNER_KEYS_FOR_CONNECTOR.map((key) => (
        <Line
          key={key}
          points={[from[key].x, from[key].y, to[key].x, to[key].y]}
          stroke={color}
          strokeWidth={1}
          dash={[3, 3]}
          opacity={0.7}
          listening={false}
        />
      ))}
    </>
  )
}

interface QuadHandlesProps {
  quad: PerspectiveCorners
  /** Current workspace zoom, so handles stay a constant on-screen size. */
  viewportScale: number
  onCornerDragMove: (corner: keyof PerspectiveCorners, point: { x: number; y: number }) => void
  color?: string
  /** If given, handles can't be dragged outside 0..width × 0..height. */
  bounds?: { width: number; height: number }
}

const CORNER_KEYS: (keyof PerspectiveCorners)[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']

/** Shared draggable-corner-handle UI for any quad — reused by the customer's
 * wall selector and by the developer per-frame perspective editor. Handles are
 * drawn at a constant on-screen size, but their touch target is much larger
 * than what's drawn (a fingertip is ~40px; the dot is ~22px). */
export function QuadHandles({ quad, viewportScale, onCornerDragMove, color = '#2f8fff', bounds }: QuadHandlesProps) {
  const radius = 11 / viewportScale
  const strokeWidth = 2.5 / viewportScale
  const outlineWidth = 2 / viewportScale

  return (
    <>
      {/* A pale under-stroke keeps the outline readable on any wall colour. */}
      <Line
        points={quadToPoints(quad)}
        closed
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={outlineWidth + 2 / viewportScale}
        listening={false}
      />
      <Line
        points={quadToPoints(quad)}
        closed
        stroke={color}
        strokeWidth={outlineWidth}
        dash={[8 / viewportScale, 5 / viewportScale]}
        listening={false}
      />
      {CORNER_KEYS.map((key) => {
        const point = quad[key]
        return (
          <Circle
            key={key}
            name={`corner-${key}`}
            x={point.x}
            y={point.y}
            radius={radius}
            fill="#ffffff"
            stroke={color}
            strokeWidth={strokeWidth}
            hitStrokeWidth={44 / viewportScale}
            shadowColor="black"
            shadowBlur={6 / viewportScale}
            shadowOpacity={0.3}
            draggable
            onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
              let x = e.target.x()
              let y = e.target.y()
              if (bounds) {
                x = clamp(x, 0, bounds.width)
                y = clamp(y, 0, bounds.height)
                e.target.position({ x, y })
              }
              onCornerDragMove(key, { x, y })
            }}
          />
        )
      })}
    </>
  )
}
