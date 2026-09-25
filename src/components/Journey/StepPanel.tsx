import { useJourneyStore } from '../../state/journeyStore'
import { Step1Wall } from './steps/Step1Wall'
import { Step2Layout } from './steps/Step2Layout'
import { Step3Photos } from './steps/Step3Photos'
import { Step4Frames } from './steps/Step4Frames'
import { Step5SizePrice } from './steps/Step5SizePrice'
import { Step6Preview } from './steps/Step6Preview'

interface StepPanelProps {
  onExport: () => void
  isExporting: boolean
  onOrder: () => void
  isPreparingOrder: boolean
}

/** The side panel (a bottom sheet on phones): only the current step's
 * controls are ever shown — never the whole editor at once. */
export function StepPanel({ onExport, isExporting, onOrder, isPreparingOrder }: StepPanelProps) {
  const currentStep = useJourneyStore((s) => s.currentStep)

  switch (currentStep) {
    case 1:
      return <Step1Wall />
    case 2:
      return <Step2Layout />
    case 3:
      return <Step3Photos />
    case 4:
      return <Step4Frames />
    case 5:
      return <Step5SizePrice />
    case 6:
      return <Step6Preview onExport={onExport} isExporting={isExporting} onOrder={onOrder} isPreparingOrder={isPreparingOrder} />
  }
}
