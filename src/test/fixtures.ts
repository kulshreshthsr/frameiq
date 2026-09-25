import type { DesignSnapshot } from '../../shared/orderSchema'
import { currentCatalog } from '../domain/catalog'
import { buildDesignSnapshot } from '../order/snapshot'
import type { PhotoAsset, WallImage } from '../types/frame'
import { useCompositionStore } from '../state/compositionStore'
import { useJourneyStore } from '../state/journeyStore'
import { useUIStore } from '../state/uiStore'
import { resetAssetLifecycleForTests } from '../state/assetLifecycle'

let counter = 0

export function makeWall(width = 1200, height = 900): WallImage {
  counter += 1
  return { assetId: `wall_${counter}`, src: `blob:test/wall-${counter}`, width, height, sourceWidth: width, sourceHeight: height }
}

export function makePhoto(width = 1600, height = 1200, sourceScale = 1): PhotoAsset {
  counter += 1
  return {
    assetId: `photo_${counter}`,
    src: `blob:test/photo-${counter}`,
    width,
    height,
    sourceWidth: Math.round(width * sourceScale),
    sourceHeight: Math.round(height * sourceScale),
  }
}

/** Puts every store back to a blank slate between tests. */
export function resetAllStores() {
  resetAssetLifecycleForTests()
  useCompositionStore.getState().resetComposition()
  useUIStore.getState().resetUI()
  useUIStore.setState({ notices: [], perspectiveEditMode: false, isExportingPreview: false })
  useJourneyStore.getState().resetJourney()
}

/**
 * A two-frame walnut design (8 × 10 in, photos that print sharply), built in
 * the composition store, and the snapshot "Continue to order" would freeze.
 */
export function designTwoWalnutFrames(): void {
  const store = useCompositionStore.getState()
  store.setWall(makeWall())
  store.applyLayout('two-horizontal')
  store.configureFrames('all', { productId: 'walnut', sizeId: '8x10' })
  for (const frame of useCompositionStore.getState().frames) store.setFramePhoto(frame.id, makePhoto(1600, 1200, 2))
}

export function makeSnapshot(): DesignSnapshot {
  designTwoWalnutFrames()
  const c = useCompositionStore.getState()
  return buildDesignSnapshot({
    wall: c.wall!,
    wallWidthCm: c.wallWidthCm,
    placementMode: c.placementMode,
    wallRegion: c.wallRegion,
    layoutId: c.activeLayoutId,
    frames: c.frames,
    catalog: currentCatalog(),
    now: new Date('2026-09-26T10:00:00Z'),
    appVersion: 'test',
  })
}
