import { useState } from 'react'
import { validateAndLoadImage } from '../lib/validateAndLoadImage'
import { friendlyMessage } from '../lib/errors'
import { useCompositionStore } from '../state/compositionStore'
import { useUIStore } from '../state/uiStore'

/** Loads a room/wall photo into the design. Any failure becomes a calm,
 * customer-facing sentence — never a raw error. */
export function useWallUpload() {
  const setWall = useCompositionStore((s) => s.setWall)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File | undefined | null) => {
    if (!file) return
    setError(null)
    setIsLoading(true)
    try {
      const asset = await validateAndLoadImage(file, 'wall')
      setWall(asset)
      useUIStore.getState().resetUI()
    } catch (err) {
      setError(friendlyMessage(err, `We couldn't open that photo. Please try a different one.`))
    } finally {
      setIsLoading(false)
    }
  }

  return { upload, isLoading, error, clearError: () => setError(null) }
}
