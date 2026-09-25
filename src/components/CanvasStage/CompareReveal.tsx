import { useEffect, useRef, type ReactNode } from 'react'
import type Konva from 'konva'
import { Circle, Group, Line, Rect } from 'react-konva'
import { useJourneyStore } from '../../state/journeyStore'
import { clamp } from '../../lib/geometry'

interface CompareRevealProps {
  wall: { width: number; height: number }
  viewportScale: number
  /** Show the draggable divider (compare mode). */
  showDivider: boolean
  /** The framed design; everything left of the divider is hidden to reveal
   * the original room photo underneath. */
  children: ReactNode
}

/**
 * The before/after reveal. The finished design is clipped to the right of a
 * vertical divider, so the room photo shows through on the left; sliding the
 * divider all the way right shows the original room, all the way left the
 * finished design.
 *
 * The divider position changes ~60 times a second while it animates or is
 * dragged. Routing that through React state would re-render the whole canvas
 * each tick, so it is read imperatively instead: the clip function reads a
 * ref, and a store subscription nudges the divider node and asks the layer to
 * redraw. React only re-renders when the *mode* changes.
 */
export function CompareReveal({ wall, viewportScale, showDivider, children }: CompareRevealProps) {
  const fractionRef = useRef(useJourneyStore.getState().compareFraction)
  const clipGroupRef = useRef<Konva.Group | null>(null)
  const dividerRef = useRef<Konva.Group | null>(null)
  const setCompareFraction = useJourneyStore((s) => s.setCompareFraction)

  useEffect(() => {
    const sync = (fraction: number) => {
      fractionRef.current = fraction
      dividerRef.current?.x(fraction * wall.width)
      clipGroupRef.current?.getLayer()?.batchDraw()
    }
    sync(useJourneyStore.getState().compareFraction)
    return useJourneyStore.subscribe((state, previous) => {
      if (state.compareFraction !== previous.compareFraction) sync(state.compareFraction)
    })
  }, [wall.width])

  const knob = 20 / viewportScale
  const line = 3 / viewportScale

  return (
    <>
      <Group
        ref={clipGroupRef}
        clipFunc={(ctx) => {
          const x = fractionRef.current * wall.width
          ctx.rect(x, 0, Math.max(0, wall.width - x), wall.height)
        }}
      >
        {children}
      </Group>

      {showDivider && (
        <Group
          ref={dividerRef}
          x={fractionRef.current * wall.width}
          y={0}
          draggable
          onDragMove={(e) => {
            const x = clamp(e.target.x(), 0, wall.width)
            e.target.position({ x, y: 0 })
            setCompareFraction(x / wall.width)
          }}
          onMouseEnter={(e) => {
            const container = e.target.getStage()?.container()
            if (container) container.style.cursor = 'ew-resize'
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container()
            if (container) container.style.cursor = ''
          }}
        >
          {/* Wide invisible strip so the divider is easy to grab with a finger. */}
          <Rect x={-28 / viewportScale} width={56 / viewportScale} height={wall.height} fill="rgba(0,0,0,0.001)" />
          <Line points={[0, 0, 0, wall.height]} stroke="#ffffff" strokeWidth={line} shadowColor="black" shadowBlur={6 / viewportScale} shadowOpacity={0.4} listening={false} />
          <Circle
            x={0}
            y={wall.height / 2}
            radius={knob}
            fill="#ffffff"
            shadowColor="black"
            shadowBlur={10 / viewportScale}
            shadowOpacity={0.35}
            listening={false}
          />
          {/* Two small chevrons pointing outward from the centre. */}
          <Line points={[-8 / viewportScale, wall.height / 2 - 6 / viewportScale, -13 / viewportScale, wall.height / 2, -8 / viewportScale, wall.height / 2 + 6 / viewportScale]} stroke="#211c17" strokeWidth={2 / viewportScale} lineCap="round" lineJoin="round" listening={false} />
          <Line points={[8 / viewportScale, wall.height / 2 - 6 / viewportScale, 13 / viewportScale, wall.height / 2, 8 / viewportScale, wall.height / 2 + 6 / viewportScale]} stroke="#211c17" strokeWidth={2 / viewportScale} lineCap="round" lineJoin="round" listening={false} />
        </Group>
      )}
    </>
  )
}
