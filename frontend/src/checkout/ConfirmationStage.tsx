import { useState } from 'react'
import { formatMoney } from '../../../shared/money'
import { useUIStore } from '../state/uiStore'
import { useCheckoutStore } from './checkoutStore'
import { startAnotherDesign } from './flow'
import * as cs from './checkoutStyles'

/** The moment it becomes real. Shows what was paid for, where it's going, and
 * what happens next — and a way to come back to this page later. */
export function ConfirmationStage() {
  const order = useCheckoutStore((s) => s.order)
  const accessToken = useCheckoutStore((s) => s.accessToken)
  const serverConfig = useCheckoutStore((s) => s.serverConfig)
  const previewUrl = useCheckoutStore((s) => s.previewUrl)
  const [copied, setCopied] = useState(false)
  if (!order) return null

  const link = accessToken ? `${window.location.origin}/order/${order.publicOrderId}?t=${accessToken}` : null
  const whatsapp = serverConfig?.whatsappNumber
  const message = `Hi! I just placed order ${order.publicOrderId}.`

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      useUIStore.getState().pushNotice('info', 'Couldn’t copy automatically — please note down your order ID.')
    }
  }

  return (
    <div className={cs.confirmation} data-testid="confirmation">
      <p className={cs.confirmBadge}>Payment received</p>
      <h1 className={cs.confirmTitle}>Your frame is officially on its way to becoming real.</h1>
      <p className={cs.stageLead}>Thank you, {order.customerName.split(' ')[0]}. Here’s everything about your order.</p>

      <div className={cs.orderIdCard}>
        <span className={cs.orderIdLabel}>Order ID</span>
        <span className={cs.orderId} data-testid="order-id">
          {order.publicOrderId}
        </span>
        <button type="button" className="btnText" onClick={() => void copy(order.publicOrderId)}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      {previewUrl && <img className={cs.previewImage} src={previewUrl} alt="Your framed wall" />}

      <dl className={cs.confirmFacts}>
        <div>
          <dt className={cs.confirmFactsDt}>Total paid</dt>
          <dd className={cs.confirmFactsDd} data-testid="confirm-total">
            {formatMoney(order.totalMinor, order.currency)}
          </dd>
        </div>
        <div>
          <dt className={cs.confirmFactsDt}>Delivering to</dt>
          <dd className={cs.confirmFactsDd}>
            {order.deliveryCity}, {order.deliveryState} {order.deliveryPin}
          </dd>
        </div>
      </dl>

      <ul className={cs.summaryLines} aria-label="Items in your order">
        {order.items.map((item) => (
          <li key={`${item.productId}${item.sizeId}${item.glassName}${item.matName}`} className={cs.summaryLine}>
            <span>
              <span className={cs.summaryQty}>{item.quantity} ×</span> {item.productName}
              <span className={cs.summaryDetail}>{item.sizeLabel}</span>
            </span>
            <span className={cs.summaryAmount}>{formatMoney(item.lineTotalMinor, order.currency)}</span>
          </li>
        ))}
      </ul>

      <section className={cs.nextSteps} aria-labelledby="next-heading">
        <h2 id="next-heading" className={cs.sectionHeading}>
          What happens next
        </h2>
        <p>We’ll check your photos and start making your frames. Keep your order ID handy — it’s how we’ll find your order if you contact us.</p>
        <div className={cs.confirmActions}>
          {whatsapp && (
            <a className="btn btnPrimary" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" data-testid="whatsapp">
              Message us on WhatsApp
            </a>
          )}
          {link && (
            <button type="button" className="btn btnSecondary" onClick={() => void copy(link)}>
              {copied ? 'Link copied ✓' : 'Copy link to this page'}
            </button>
          )}
          <button type="button" className="btnText" onClick={() => void startAnotherDesign()} data-testid="another-design">
            Design another wall
          </button>
        </div>
        {link && <p className={cs.softNote}>Keep the link — it’s the private way back to this page on any device.</p>}
      </section>
    </div>
  )
}
