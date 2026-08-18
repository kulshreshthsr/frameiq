import { useRef, useState } from 'react'
import { useCompositionStore } from '../../../state/compositionStore'
import { useUIStore } from '../../../state/uiStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { validateAndLoadImage } from '../../../lib/validateAndLoadImage'
import { ACCEPTED_IMAGE_TYPES } from '../../../lib/constants'
import { StepFooterNav } from '../StepFooterNav'
import { PhotoCropControls } from '../../Toolbar/PhotoCropControls'
import toolbarStyles from '../../Toolbar/Toolbar.module.css'
import styles from '../Journey.module.css'

export function Step3Photos() {
  const frames = useCompositionStore((s) => s.frames)
  const setFramePhoto = useCompositionStore((s) => s.setFramePhoto)
  const addFrame = useCompositionStore((s) => s.addFrame)
  const removeFrame = useCompositionStore((s) => s.removeFrame)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const selectFrame = useUIStore((s) => s.selectFrame)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const advanceTo = useJourneyStore((s) => s.advanceTo)

  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedFrame = frames.find((f) => f.id === selectedFrameId)
  const photosAdded = frames.filter((f) => f.photo).length
  const frameIndex = selectedFrame ? frames.findIndex((f) => f.id === selectedFrame.id) : -1

  const handlePhotoFile = async (file: File) => {
    if (!selectedFrameId) return
    setError(null)
    setIsLoading(true)
    try {
      const asset = await validateAndLoadImage(file)
      setFramePhoto(selectedFrameId, asset)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That photo could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className={styles.content}>
        <h2 className={styles.title}>Add your photos</h2>
        <div className={styles.progressNote}>
          <span className={`${styles.progressDot} ${photosAdded === frames.length ? '' : styles.progressDotDone}`} />
          {photosAdded} of {frames.length} photos added
        </div>

        {selectedFrame ? (
          <div className={styles.selectedFrameCard}>
            <p className={styles.selectedFrameCardTitle}>Frame {frameIndex + 1} selected</p>
            <input
              ref={photoInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) handlePhotoFile(file)
              }}
            />
            <button
              type="button"
              className={toolbarStyles.primaryButton}
              onClick={() => photoInputRef.current?.click()}
              disabled={isLoading}
            >
              {isLoading ? 'Loading…' : selectedFrame.photo ? 'Replace Photo' : 'Add Photo'}
            </button>
            {error && <p className={toolbarStyles.errorText}>{error}</p>}
            {selectedFrame.photo && <PhotoCropControls frame={selectedFrame} />}
            <button
              type="button"
              className={toolbarStyles.secondaryButton}
              onClick={() => removeFrame(selectedFrame.id)}
            >
              Remove this frame
            </button>
          </div>
        ) : (
          <p className={styles.hint}>Click any frame on your wall to add or change its photo.</p>
        )}

        <button type="button" className={toolbarStyles.secondaryButton} onClick={addFrame}>
          + Add another frame
        </button>
      </div>
      <StepFooterNav
        onBack={() => {
          selectFrame(null)
          goToStep(2)
        }}
        onContinue={() => {
          selectFrame(null)
          advanceTo(4)
        }}
      />
    </>
  )
}
