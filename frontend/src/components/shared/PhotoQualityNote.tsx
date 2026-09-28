import type { FrameInstance } from '../../types/frame'
import { findSku, getProduct } from '../../domain/catalog'
import { largestSharpSku } from '../../domain/printQuality'
import { formatSkuInches, isSquareSku } from '../../domain/sizing'
import { assessFramePhoto } from '../../lib/frameSelection'
import styles from './shared.module.css'

interface PhotoQualityNoteProps {
  frame: FrameInstance
  /** Offered when a smaller size would print sharply. */
  onUseSize?: (sizeId: string) => void
}

/** A plain-language heads-up when a photo is too low-resolution to print
 * sharply at its frame's size — with a way to fix it, not just a warning. */
export function PhotoQualityNote({ frame, onUseSize }: PhotoQualityNoteProps) {
  const assessment = assessFramePhoto(frame)
  const sku = findSku(frame.productId, frame.sizeId)
  if (!assessment || !sku || assessment.quality === 'good') return null

  const orientation = isSquareSku(sku) ? 'portrait' : frame.orientation
  const sharper = largestSharpSku(getProduct(frame.productId), orientation, sku, assessment.ppi)
  const canSuggest = sharper && sharper.id !== sku.id && onUseSize
  const isLow = assessment.quality === 'low'

  return (
    <div className={`${styles.qualityNote} ${isLow ? styles.qualityLow : ''}`} role="note">
      <p>
        <strong>{isLow ? 'This photo may print soft' : 'This photo is a little low-resolution'}</strong> at{' '}
        {formatSkuInches(sku, orientation)}.{' '}
        {canSuggest
          ? `At ${formatSkuInches(sharper, orientation)} it would look sharp.`
          : 'A higher-resolution copy of the photo would look better.'}
      </p>
      {canSuggest && (
        <button type="button" className="btnText" onClick={() => onUseSize(sharper.id)}>
          Use {formatSkuInches(sharper, orientation)}
        </button>
      )}
    </div>
  )
}
