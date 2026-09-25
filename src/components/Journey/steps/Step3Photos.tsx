import { useEffect, useRef } from 'react'
import { useCompositionStore } from '../../../state/compositionStore'
import { useUIStore } from '../../../state/uiStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { usePhotoUpload } from '../../../hooks/usePhotoUpload'
import { ACCEPTED_IMAGE_TYPES } from '../../../lib/constants'
import { frameName } from '../../../lib/frameLabels'
import { PanelShell, StepFooter } from '../PanelShell'
import { FrameStrip } from '../../shared/FrameStrip'
import { PhotoQualityNote } from '../../shared/PhotoQualityNote'
import styles from '../Journey.module.css'

export function Step3Photos() {
  const frames = useCompositionStore((s) => s.frames)
  const addFrame = useCompositionStore((s) => s.addFrame)
  const removeFrame = useCompositionStore((s) => s.removeFrame)
  const autoFitPhoto = useCompositionStore((s) => s.autoFitPhoto)
  const rotatePhoto90 = useCompositionStore((s) => s.rotatePhoto90)
  const configureFrames = useCompositionStore((s) => s.configureFrames)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const selectFrame = useUIStore((s) => s.selectFrame)
  const openCropEditor = useUIStore((s) => s.openCropEditor)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const advanceTo = useJourneyStore((s) => s.advanceTo)
  const { addPhotos, isLoading } = usePhotoUpload()
  const fileInput = useRef<HTMLInputElement | null>(null)

  const selectedFrame = frames.find((f) => f.id === selectedFrameId)
  const selectedIndex = selectedFrame ? frames.indexOf(selectedFrame) : -1
  const photosAdded = frames.filter((f) => f.photo).length
  const emptyCount = frames.length - photosAdded

  // Arriving here with nothing selected, start on the first empty frame so
  // "Add photo" is immediately the obvious thing to do.
  useEffect(() => {
    const state = useCompositionStore.getState()
    if (useUIStore.getState().selectedFrameId) return
    const first = state.frames.find((f) => !f.photo) ?? state.frames[0]
    if (first) useUIStore.getState().selectFrame(first.id)
  }, [])

  const handleFiles = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    void addPhotos(files, selectedFrameId)
  }

  const leave = (action: () => void) => {
    selectFrame(null)
    action()
  }

  return (
    <PanelShell
      step={3}
      title="Add your photos"
      subtitle={`${photosAdded} of ${frames.length} photo${frames.length === 1 ? '' : 's'} added. Tap a frame to choose its photo.`}
      backLabel="Layout"
      onBack={() => leave(() => goToStep(2))}
      footer={<StepFooter primaryLabel="Choose frames" onPrimary={() => leave(() => advanceTo(4))} />}
    >
      <div className={styles.stack}>
        <FrameStrip frames={frames} selectedId={selectedFrameId} onSelect={selectFrame} />

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          hidden
          aria-label="Choose photos"
          data-testid="photo-input"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {selectedFrame ? (
          <div className={styles.card} data-testid="selected-frame-card">
            <p className={styles.cardTitle}>{frameName(selectedIndex)}</p>
            <button
              type="button"
              className="btn btnPrimary btnBlock"
              onClick={() => fileInput.current?.click()}
              disabled={isLoading}
              data-testid="add-photo"
            >
              {isLoading ? 'Adding…' : selectedFrame.photo ? 'Replace photo' : emptyCount > 1 ? 'Add photos' : 'Add photo'}
            </button>
            {!selectedFrame.photo && emptyCount > 1 && (
              <p className={styles.hint}>Choose several at once and we’ll fill your empty frames in order.</p>
            )}

            {selectedFrame.photo && (
              <>
                <div className={styles.buttonRow}>
                  <button type="button" className="btn btnSecondary btnCompact" onClick={() => openCropEditor(selectedFrame.id)} data-testid="adjust-photo">
                    Adjust
                  </button>
                  <button type="button" className="btn btnSecondary btnCompact" onClick={() => rotatePhoto90(selectedFrame.id, 1)}>
                    Rotate
                  </button>
                  <button type="button" className="btn btnSecondary btnCompact" onClick={() => autoFitPhoto(selectedFrame.id)}>
                    Reset
                  </button>
                </div>
                <PhotoQualityNote frame={selectedFrame} onUseSize={(sizeId) => configureFrames(selectedFrame.id, { sizeId })} />
              </>
            )}
          </div>
        ) : (
          <p className={styles.hint}>Choose a frame above to add its photo.</p>
        )}

        <div className={styles.buttonRow}>
          <button type="button" className="btn btnSecondary btnCompact" onClick={addFrame}>
            + Add a frame
          </button>
          {selectedFrame && frames.length > 1 && (
            <button type="button" className="btn btnSecondary btnCompact" onClick={() => removeFrame(selectedFrame.id)}>
              Remove {frameName(selectedIndex)}
            </button>
          )}
        </div>
      </div>
    </PanelShell>
  )
}
