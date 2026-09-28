import { useMemo } from 'react'
import useImage from 'use-image'
import type { FrameInstance, WallImage } from '../types/frame'
import { computeDefaultCorners } from '../lib/perspective'
import { buildLumaMap, lumaToLightingFactor, sampleRegionLuma, type LumaMap } from '../lib/lightingSampler'

/**
 * Per-frame ambient lighting factor derived from the wall photo itself:
 * samples average brightness in a padded region around each frame's own
 * footprint (its perspective quad if warped, otherwise its identity
 * rectangle) so moulding/glass/shadow rendering can react to whether that
 * part of the wall reads bright or dim. Deliberately coarse — a single
 * scalar nudge per frame, not per-pixel relighting.
 *
 * Kept out of the zustand stores: this is derived, ephemeral render data,
 * not user-editable composition state, and must never be undo-tracked.
 */
export function useFrameLighting(wall: WallImage | null, frames: FrameInstance[]): Map<string, number> {
  const [image] = useImage(wall?.src ?? '')

  const lumaMap = useMemo<LumaMap | null>(() => {
    if (!image) return null
    return buildLumaMap(image)
  }, [image])

  return useMemo(() => {
    const map = new Map<string, number>()
    if (!lumaMap || !wall || wall.width <= 0 || wall.height <= 0) return map
    for (const frame of frames) {
      const quad = frame.perspective ?? computeDefaultCorners(frame)
      const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x]
      const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y]
      const bbox = {
        x0: Math.min(...xs) / wall.width,
        x1: Math.max(...xs) / wall.width,
        y0: Math.min(...ys) / wall.height,
        y1: Math.max(...ys) / wall.height,
      }
      const luma = sampleRegionLuma(lumaMap, bbox)
      map.set(frame.id, lumaToLightingFactor(luma))
    }
    return map
  }, [lumaMap, wall, frames])
}
