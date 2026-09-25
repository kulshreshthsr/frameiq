import { useCallback, useState } from 'react'
import { useCompositionStore } from '../state/compositionStore'
import { useUIStore } from '../state/uiStore'
import { validateAndLoadImage } from '../lib/validateAndLoadImage'
import { friendlyMessage } from '../lib/errors'
import type { FrameInstance } from '../types/frame'

/** Which frames a batch of photos should go into, in order. One photo goes to
 * the chosen frame (replacing whatever is there); several fill the chosen
 * frame if it's empty and then the remaining empty frames. */
export function chooseTargetFrames(frames: FrameInstance[], startFrameId: string | null, fileCount: number): FrameInstance[] {
  const start = frames.find((f) => f.id === startFrameId)
  if (fileCount === 1 && start) return [start]
  const empties = frames.filter((f) => !f.photo && f.id !== start?.id)
  return start && !start.photo ? [start, ...empties] : empties
}

/**
 * Adds customer photos to frames — one at a time, or many at once (a phone's
 * multi-select picker), filling empty frames in order. Failures never leak
 * raw errors: each is reduced to a calm sentence, and one bad file doesn't
 * stop the rest.
 */
export function usePhotoUpload() {
  const [isLoading, setIsLoading] = useState(false)

  const addPhotos = useCallback(async (files: File[], startFrameId: string | null) => {
    if (files.length === 0) return
    const { frames } = useCompositionStore.getState()
    const targets = chooseTargetFrames(frames, startFrameId, files.length)
    const ui = useUIStore.getState()

    if (targets.length === 0) {
      ui.pushNotice('info', 'All your frames already have photos. Select one to replace its photo, or add another frame.')
      return
    }

    setIsLoading(true)
    let added = 0
    let firstFailure: string | null = null
    let failures = 0
    try {
      const usable = files.slice(0, targets.length)
      for (let i = 0; i < usable.length; i++) {
        try {
          const asset = await validateAndLoadImage(usable[i], 'photo')
          useCompositionStore.getState().setFramePhoto(targets[i].id, asset)
          added += 1
        } catch (error) {
          failures += 1
          firstFailure ??= friendlyMessage(error, `We couldn't add that photo. Please try a different one.`)
        }
      }

      if (failures > 0) {
        ui.pushNotice('error', failures === 1 ? firstFailure! : `${failures} photos couldn't be added. ${firstFailure}`)
      }
      if (files.length > targets.length) {
        ui.pushNotice('info', `Added ${added} photo${added === 1 ? '' : 's'}. The rest didn't fit — add another frame to use them.`)
      }

      // Move on to the next empty frame so a run of uploads flows naturally.
      if (added > 0) {
        const after = useCompositionStore.getState().frames
        const next = after.find((f) => !f.photo)
        if (next) useUIStore.getState().selectFrame(next.id)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { addPhotos, isLoading }
}
