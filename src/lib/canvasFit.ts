import { fitContain } from './geometry'

/** Breathing room between the wall photo and the edge of the canvas area, so
 * its shadow and the wall-corner handles are never flush against the edge. */
export const CANVAS_PADDING = 16

export interface CanvasFit {
  scale: number
  x: number
  y: number
  width: number
  height: number
}

/** Scale and offset that centre the whole wall photo inside the canvas area. */
export function computeCanvasFit(
  container: { width: number; height: number },
  wall: { width: number; height: number },
  padding: number = CANVAS_PADDING,
): CanvasFit {
  const availableWidth = Math.max(1, container.width - padding * 2)
  const availableHeight = Math.max(1, container.height - padding * 2)
  const fit = fitContain(availableWidth, availableHeight, wall.width, wall.height)
  return {
    scale: fit.scale,
    width: fit.width,
    height: fit.height,
    x: (container.width - fit.width) / 2,
    y: (container.height - fit.height) / 2,
  }
}
