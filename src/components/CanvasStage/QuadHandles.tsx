import type Konva from 'konva'
import { Circle, Line } from 'react-konva'
import type { PerspectiveCorners } from '../../types/frame'
import { quadToPoints } from '../../lib/perspective'

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
 * dragged. */
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
}

const CORNER_KEYS: (keyof PerspectiveCorners)[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']

/** Shared draggable-corner-handle UI for any quad — reused by both the
 * per-frame perspective editor and the wall-surface region selector. */
export function QuadHandles({ quad, viewportScale, onCornerDragMove, color = '#2f8fff' }: QuadHandlesProps) {
  const radius = 9 / viewportScale
  const strokeWidth = 2 / viewportScale
  const outlineWidth = 1.5 / viewportScale

  return (
    <>
      <Line
        points={quadToPoints(quad)}
        closed
        stroke={color}
        strokeWidth={outlineWidth}
        dash={[6 / viewportScale, 4 / viewportScale]}
        listening={false}
      />
      {CORNER_KEYS.map((key) => {
        const point = quad[key]
        return (
          <Circle
            key={key}
            x={point.x}
            y={point.y}
            radius={radius}
            fill="#ffffff"
            stroke={color}
            strokeWidth={strokeWidth}
            draggable
            onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
              onCornerDragMove(key, { x: e.target.x(), y: e.target.y() })
            }}
          />
        )
      })}
    </>
  )
}
