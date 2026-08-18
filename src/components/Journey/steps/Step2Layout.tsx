import { useRef } from 'react'
import { useCompositionStore } from '../../../state/compositionStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { useWallUpload } from '../../../hooks/useWallUpload'
import { getLayout } from '../../../lib/layouts'
import { ACCEPTED_IMAGE_TYPES } from '../../../lib/constants'
import { LayoutPicker } from '../../Toolbar/LayoutPicker'
import { StepFooterNav } from '../StepFooterNav'
import styles from '../Journey.module.css'

export function Step2Layout() {
  const activeLayoutId = useCompositionStore((s) => s.activeLayoutId)
  const activeLayout = getLayout(activeLayoutId)
  const advanceTo = useJourneyStore((s) => s.advanceTo)
  const { upload: uploadWall, isLoading, error } = useWallUpload()
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <div className={styles.content}>
        <h2 className={styles.title}>Choose a layout</h2>
        <p className={styles.hint}>{activeLayout.description}</p>
        <LayoutPicker />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          hidden
          onChange={(e) => {
            uploadWall(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className={styles.linkButton}
          style={{ marginTop: 16 }}
          onClick={() => inputRef.current?.click()}
          disabled={isLoading}
        >
          {isLoading ? 'Loading…' : 'Use a different wall photo'}
        </button>
        {error && <p style={{ color: 'var(--danger-text)', fontSize: 12, marginTop: 8 }}>{error}</p>}
      </div>
      <StepFooterNav onContinue={() => advanceTo(3)} />
    </>
  )
}
