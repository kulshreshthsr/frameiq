import { CheckoutHeader } from './CheckoutHeader'
import { ConfirmationStage } from './ConfirmationStage'
import { DeliveryStage, DetailsStage } from './FormStages'
import { OrderSummary } from './OrderSummary'
import { PaymentStage } from './PaymentStage'
import { ReviewStage } from './ReviewStage'
import { SandboxPayDialog } from './SandboxPayDialog'
import { useCheckoutStore } from './checkoutStore'
import { leaveCheckout } from './flow'
import * as cs from './checkoutStyles'

/**
 * The ordering experience, from reviewing the frozen design to the
 * confirmation. It replaces the editor while it is open — the design cannot
 * change under the customer once they are checking out — and offers a clear
 * way back to edit.
 */
export function CheckoutFlow() {
  const stage = useCheckoutStore((s) => s.stage)
  const hasSnapshot = useCheckoutStore((s) => s.snapshot !== null)
  const hasOrder = useCheckoutStore((s) => s.order !== null)

  const editDesign = () => void leaveCheckout()
  // The summary appears wherever there's something to summarise (not on the
  // confirmation, which has its own).
  const showSummary = stage !== 'confirmation' && (hasSnapshot || hasOrder)

  return (
    <div className={cs.checkout} data-testid="checkout">
      <CheckoutHeader onBackToDesign={editDesign} />
      <main className={stage === 'confirmation' ? cs.pageNarrow : cs.page}>
        {showSummary && <OrderSummary />}
        <section className={cs.main}>
          {stage === 'review' && <ReviewStage onEditDesign={editDesign} />}
          {stage === 'details' && <DetailsStage />}
          {stage === 'delivery' && <DeliveryStage />}
          {stage === 'payment' && <PaymentStage onEditDesign={editDesign} />}
          {stage === 'confirmation' && <ConfirmationStage />}
        </section>
      </main>
      <SandboxPayDialog />
    </div>
  )
}
