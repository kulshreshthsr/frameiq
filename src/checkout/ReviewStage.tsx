import { useRef, useState } from 'react'
import { formatMoney } from '../../shared/money'
import type { ImageProblem } from '../../shared/production'
import { findSku, getProduct } from '../domain/catalog'
import { formatSkuInches } from '../domain/sizing'
import { Actions } from './Actions'
import { useCheckoutStore } from './checkoutStore'
import { nextStage, replaceOriginal } from './flow'
import { ACCEPTED_IMAGE_TYPES } from '../lib/constants'
import styles from './checkout.module.css'

function ProblemCard({ problem, onEditDesign }: { problem: ImageProblem; onEditDesign: () => void }) {
  const input = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(await replaceOriginal(problem.assetId, file))
    setBusy(false)
  }

  const copy = {
    missing: {
      title: `Frame ${problem.frameNumber} needs its original photo`,
      body: 'We couldn’t find the full-quality file for this photo — it may have been cleared from your device. Choose it again and we’ll carry on.',
      action: 'Choose the photo',
    },
    wrong_shape: {
      title: `That isn’t the same photo as Frame ${problem.frameNumber}`,
      body: 'The photo doesn’t match the shape of the one you designed with, so it wouldn’t fit the frame the same way. Choose the original again.',
      action: 'Choose the original',
    },
    low_resolution: {
      title: `Frame ${problem.frameNumber}’s photo is too small to print sharply`,
      body: `At this size it would print at about ${problem.ppi} pixels per inch, and we need at least ${problem.requiredPpi}. Choose a higher-resolution copy, or go back and pick a smaller frame.`,
      action: 'Choose a higher-resolution photo',
    },
  }[problem.code]

  return (
    <div className={styles.problem} role="alert">
      <p className={styles.problemTitle}>{copy.title}</p>
      <p className={styles.problemBody}>{copy.body}</p>
      <input ref={input} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} hidden aria-label={`Choose a photo for frame ${problem.frameNumber}`} data-testid={`replace-${problem.frameNumber}`} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      <div className={styles.problemActions}>
        <button type="button" className="btn btnSecondary btnCompact" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Checking…' : copy.action}
        </button>
        {problem.code === 'low_resolution' && (
          <button type="button" className="btnText" onClick={onEditDesign}>
            Change the size
          </button>
        )}
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  )
}

interface ReviewStageProps {
  onEditDesign: () => void
}

export function ReviewStage({ onEditDesign }: ReviewStageProps) {
  const snapshot = useCheckoutStore((s) => s.snapshot)
  const previewUrl = useCheckoutStore((s) => s.previewUrl)
  const problems = useCheckoutStore((s) => s.imageProblems)
  if (!snapshot) return null

  const blocked = problems.length > 0
  const empty = snapshot.frames.filter((f) => !f.photo).length

  return (
    <div className={styles.stage}>
      <h1 className={styles.stageTitle}>Review your design</h1>
      <p className={styles.stageLead}>This is exactly what we’ll make. Take a last look — you can still go back and change anything.</p>

      {previewUrl && (
        <figure className={styles.previewFigure}>
          <img className={styles.previewImage} src={previewUrl} alt="Your framed wall" style={{ aspectRatio: `${snapshot.wall.asset.width} / ${snapshot.wall.asset.height}` }} />
        </figure>
      )}

      <section aria-labelledby="frames-heading">
        <h2 id="frames-heading" className={styles.sectionHeading}>
          {snapshot.frames.length} frame{snapshot.frames.length === 1 ? '' : 's'}
        </h2>
        <ul className={styles.frameList}>
          {snapshot.frames.map((frame) => {
            const sku = findSku(frame.productId, frame.sizeId)
            return (
              <li key={frame.id} className={styles.frameRow}>
                <span className={styles.frameNumber}>{frame.number}</span>
                <span className={styles.frameWhat}>
                  <strong>{getProduct(frame.productId).name}</strong>
                  <span className={styles.frameMeta}>
                    {sku ? formatSkuInches(sku, frame.orientation) : frame.sizeId}
                    {' · '}
                    {frame.photo ? 'Your photo' : 'Empty frame'}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
        {empty > 0 && (
          <p className={styles.softNote}>
            {empty} frame{empty === 1 ? ' has' : 's have'} no photo, so {empty === 1 ? 'it' : 'they'}’ll be made empty.
          </p>
        )}
      </section>

      <p className={styles.softNote}>
        Total {formatMoney(snapshot.pricing.totalMinor, snapshot.pricing.currency)} including delivery. Sizes shown on your wall are approximate; the frames are made to the sizes listed.
      </p>

      {problems.map((problem) => (
        <ProblemCard key={`${problem.assetId}-${problem.code}`} problem={problem} onEditDesign={onEditDesign} />
      ))}

      <Actions>
        <button type="button" className="btn btnSecondary" onClick={onEditDesign}>
          Edit design
        </button>
        <button type="button" className="btn btnPrimary" onClick={nextStage} disabled={blocked} data-testid="confirm-design">
          Confirm design
        </button>
      </Actions>
    </div>
  )
}
