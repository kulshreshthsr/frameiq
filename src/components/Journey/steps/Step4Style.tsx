import { useCompositionStore } from '../../../state/compositionStore'
import { useUIStore } from '../../../state/uiStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { FrameStylePicker } from '../../Toolbar/FrameStylePicker'
import { StepFooterNav } from '../StepFooterNav'
import styles from '../Journey.module.css'

export function Step4Style() {
  const frames = useCompositionStore((s) => s.frames)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const selectFrame = useUIStore((s) => s.selectFrame)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const advanceTo = useJourneyStore((s) => s.advanceTo)

  const selectedFrame = frames.find((f) => f.id === selectedFrameId)
  const frameIndex = selectedFrame ? frames.findIndex((f) => f.id === selectedFrame.id) : -1

  return (
    <>
      <div className={styles.content}>
        <h2 className={styles.title}>Choose your frame</h2>
        <p className={styles.hint}>
          {selectedFrame
            ? `Applies to frame ${frameIndex + 1} only.`
            : 'Applies to every frame. Select one on the canvas to style it individually.'}
        </p>
        <FrameStylePicker />
      </div>
      <StepFooterNav
        onBack={() => {
          selectFrame(null)
          goToStep(3)
        }}
        onContinue={() => {
          selectFrame(null)
          advanceTo(5)
        }}
      />
    </>
  )
}
