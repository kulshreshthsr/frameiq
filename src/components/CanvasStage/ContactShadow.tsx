import { Line, Rect } from 'react-konva'
import type { FrameStyleConfig } from '../../types/frame'
import { computeContactShadowLayers } from '../../lib/frameGeometry'

interface ContactShadowBaseProps {
  refDim: number
  style: FrameStyleConfig
  lightingFactor?: number
}

interface ContactShadowRectProps extends ContactShadowBaseProps {
  width: number
  height: number
  quadPoints?: undefined
}

interface ContactShadowQuadProps extends ContactShadowBaseProps {
  width?: undefined
  height?: undefined
  quadPoints: number[]
}

type ContactShadowProps = ContactShadowRectProps | ContactShadowQuadProps

/**
 * Casts a soft, physically-attached-looking shadow onto the wall behind a
 * frame. Konva only renders shadow properties on actual Shape subclasses
 * (Rect, Line, ...) — never on Group/Container, which silently ignore them —
 * so this draws two real filled shapes rather than relying on shadow props
 * set on a wrapping Group (which is how frame shadows were previously wired
 * and had zero visual effect).
 *
 * Rendered as the first child inside a frame's own transformed Group,
 * before its content: the frame's opaque moulding, drawn on top at the
 * exact same footprint, covers each shape's own solid fill and the inward
 * half of its shadow blur, leaving only the outward-bleeding halo visible
 * on the wall — a soft pass for the ambient falloff plus a tighter pass for
 * a crisper line right at the contact edge.
 */
export function ContactShadow(props: ContactShadowProps) {
  const { refDim, style, lightingFactor = 1 } = props
  const layers = computeContactShadowLayers(refDim, style, lightingFactor)

  if (props.quadPoints) {
    return (
      <>
        <Line
          points={props.quadPoints}
          closed
          fill="black"
          listening={false}
          shadowColor="black"
          shadowBlur={layers.soft.blur}
          shadowOffsetX={layers.soft.offsetX}
          shadowOffsetY={layers.soft.offsetY}
          shadowOpacity={layers.soft.opacity}
        />
        <Line
          points={props.quadPoints}
          closed
          fill="black"
          listening={false}
          shadowColor="black"
          shadowBlur={layers.tight.blur}
          shadowOffsetX={layers.tight.offsetX}
          shadowOffsetY={layers.tight.offsetY}
          shadowOpacity={layers.tight.opacity}
        />
      </>
    )
  }

  return (
    <>
      <Rect
        width={props.width}
        height={props.height}
        fill="black"
        listening={false}
        shadowColor="black"
        shadowBlur={layers.soft.blur}
        shadowOffsetX={layers.soft.offsetX}
        shadowOffsetY={layers.soft.offsetY}
        shadowOpacity={layers.soft.opacity}
      />
      <Rect
        width={props.width}
        height={props.height}
        fill="black"
        listening={false}
        shadowColor="black"
        shadowBlur={layers.tight.blur}
        shadowOffsetX={layers.tight.offsetX}
        shadowOffsetY={layers.tight.offsetY}
        shadowOpacity={layers.tight.opacity}
      />
    </>
  )
}
