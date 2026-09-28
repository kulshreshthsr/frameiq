import { useEffect, useRef, useState } from 'react'
import { useCompositionStore } from '../../../state/compositionStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { useWallUpload } from '../../../hooks/useWallUpload'
import { ACCEPTED_IMAGE_TYPES } from '../../../lib/constants'
import {
  MAX_WALL_WIDTH_CM,
  MIN_WALL_WIDTH_CM,
  formatWallWidth,
  isValidWallWidthCm,
} from '../../../domain/sizing'
import { PanelShell, StepFooter } from '../PanelShell'
import styles from '../Journey.module.css'

const STEP_CM = 10

export function Step1Wall() {
  const placementMode = useCompositionStore((s) => s.placementMode)
  const wallWidthCm = useCompositionStore((s) => s.wallWidthCm)
  const markWall = useCompositionStore((s) => s.markWall)
  const clearWallRegion = useCompositionStore((s) => s.clearWallRegion)
  const setWallWidthCm = useCompositionStore((s) => s.setWallWidthCm)
  const advanceTo = useJourneyStore((s) => s.advanceTo)
  const { upload, isLoading, error } = useWallUpload()
  const fileInput = useRef<HTMLInputElement | null>(null)

  const isMarked = placementMode === 'wall-surface'
  const [draft, setDraft] = useState(String(wallWidthCm))
  const parsed = Number(draft)
  const isValid = draft.trim() !== '' && isValidWallWidthCm(parsed)

  // Keep the field in step with the store when it changes elsewhere (undo).
  useEffect(() => {
    setDraft(String(wallWidthCm))
  }, [wallWidthCm])

  const commit = () => {
    if (isValid) setWallWidthCm(parsed)
  }

  const nudge = (delta: number) => {
    const base = isValid ? parsed : wallWidthCm
    const next = Math.min(MAX_WALL_WIDTH_CM, Math.max(MIN_WALL_WIDTH_CM, Math.round(base / STEP_CM) * STEP_CM + delta))
    setDraft(String(next))
    setWallWidthCm(next)
  }

  const handleContinue = () => {
    if (!isValid) return
    commit()
    advanceTo(2)
  }

  return (
    <PanelShell
      step={1}
      title="Your wall"
      subtitle="Tell us a little about the wall so your frames sit on it the way they would in real life."
      footer={<StepFooter primaryLabel="Continue to layout" onPrimary={handleContinue} primaryDisabled={!isValid} showPrice={false} />}
    >
      <div className={styles.stack}>
        <section className={styles.section} aria-labelledby="mark-heading">
          <h3 id="mark-heading" className={styles.sectionTitle}>
            Mark the wall
          </h3>
          {isMarked ? (
            <>
              <p className={styles.statusOk}>
                <span aria-hidden>✓</span> Wall marked. Drag the four corner handles on your photo so they sit on the wall’s edges.
              </p>
              <button type="button" className="btnText" onClick={clearWallRegion}>
                Use the whole photo instead
              </button>
            </>
          ) : (
            <>
              <p className={styles.hint}>
                Frames go straight onto your photo. If the wall is photographed at an angle, mark it so your frames line up with it.
              </p>
              <button type="button" className="btn btnSecondary btnBlock" onClick={markWall} data-testid="mark-wall">
                Mark the wall
              </button>
            </>
          )}
        </section>

        <section className={styles.section} aria-labelledby="width-heading">
          <h3 id="width-heading" className={styles.sectionTitle}>
            {isMarked ? 'How wide is the marked wall?' : 'How wide is the wall in your photo?'}
          </h3>
          <div className={styles.stepper}>
            <button type="button" className={styles.stepperButton} onClick={() => nudge(-STEP_CM)} aria-label={`Narrower by ${STEP_CM} centimetres`}>
              −
            </button>
            <label className={styles.stepperField}>
              <span className="srOnly">Wall width in centimetres</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                }}
                aria-invalid={!isValid}
                aria-describedby="width-help"
                data-testid="wall-width"
              />
              <span aria-hidden>cm</span>
            </label>
            <button type="button" className={styles.stepperButton} onClick={() => nudge(STEP_CM)} aria-label={`Wider by ${STEP_CM} centimetres`}>
              +
            </button>
          </div>
          {isValid ? (
            <p id="width-help" className={styles.hint}>
              {formatWallWidth(parsed)}. A rough guess is fine — it lets us show frame sizes to scale.
            </p>
          ) : (
            <p id="width-help" className="fieldError" role="alert">
              <span aria-hidden>!</span>
              Enter a width between {MIN_WALL_WIDTH_CM} and {MAX_WALL_WIDTH_CM} cm.
            </p>
          )}
        </section>

        <div>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            hidden
            aria-label="Choose a different wall photo"
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button type="button" className="btnText" onClick={() => fileInput.current?.click()} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Use a different photo'}
          </button>
          {error && (
            <p className="fieldError" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </PanelShell>
  )
}
