import { useJourneyStore } from '../../state/journeyStore'
import { Step2Layout } from './steps/Step2Layout'
import { Step3Photos } from './steps/Step3Photos'
import { Step4Style } from './steps/Step4Style'
import { Step5Preview } from './steps/Step5Preview'
import { Step6Price } from './steps/Step6Price'
import styles from './Journey.module.css'

interface StepPanelProps {
  onExport: () => void
}

/**
 * Contextual side panel showing only the current step's controls — never
 * the full editor at once. Step 1 has no panel of its own; the canvas area
 * shows the wall uploader full-bleed until a photo exists.
 */
export function StepPanel({ onExport }: StepPanelProps) {
  const currentStep = useJourneyStore((s) => s.currentStep)

  return (
    <aside className={styles.panel}>
      {currentStep === 2 && <Step2Layout />}
      {currentStep === 3 && <Step3Photos />}
      {currentStep === 4 && <Step4Style />}
      {currentStep === 5 && <Step5Preview onExport={onExport} />}
      {currentStep === 6 && <Step6Price />}
    </aside>
  )
}
