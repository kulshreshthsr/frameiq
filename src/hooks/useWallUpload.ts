import { useState } from 'react'
import { validateAndLoadImage } from '../lib/validateAndLoadImage'
import { useCompositionStore } from '../state/compositionStore'
import { useUIStore } from '../state/uiStore'
import { useJourneyStore } from '../state/journeyStore'

export function useWallUpload() {
  const setWall = useCompositionStore((s) => s.setWall)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File | undefined | null) => {
    if (!file) return
    setError(null)
    setIsLoading(true)
    try {
      const asset = await validateAndLoadImage(file)
      setWall(asset)
      useUIStore.getState().resetUI()
      useJourneyStore.getState().advanceTo(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }

  return { upload, isLoading, error, clearError: () => setError(null) }
}
