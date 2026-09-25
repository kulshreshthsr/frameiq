import { INDIAN_STATES, validateCustomerForm, validateDeliveryForm } from '../../shared/customerRules'
import { Actions } from './Actions'
import { useCheckoutStore } from './checkoutStore'
import { Field } from './Field'
import { nextStage, previousStage } from './flow'
import styles from './checkout.module.css'

/** Marks the given fields as touched so their errors show, and reports whether any exist. */
function reveal(fields: string[], hasErrors: boolean): boolean {
  const { touch } = useCheckoutStore.getState()
  fields.forEach(touch)
  return hasErrors
}

export function DetailsStage() {
  const customer = useCheckoutStore((s) => s.customer)
  const touched = useCheckoutStore((s) => s.touched)
  const setField = useCheckoutStore((s) => s.setCustomerField)
  const touch = useCheckoutStore((s) => s.touch)
  const errors = validateCustomerForm(customer)
  const shown = (field: keyof typeof errors) => (touched[field] ? (errors[field] ?? null) : null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reveal(['name', 'mobile'], Object.keys(errors).length > 0)) nextStage()
  }

  return (
    <form className={styles.stage} onSubmit={submit} noValidate>
      <h1 className={styles.stageTitle}>Your details</h1>
      <p className={styles.stageLead}>Just what we need to make and deliver your frames.</p>

      <div className={styles.form}>
        <Field id="name" label="Full name" error={shown('name')}>
          {(a11y) => (
            <input {...a11y} className={styles.input} type="text" autoComplete="name" enterKeyHint="next" value={customer.name} onChange={(e) => setField('name', e.target.value)} onBlur={() => touch('name')} data-testid="field-name" />
          )}
        </Field>
        <Field id="mobile" label="Mobile number" hint="We’ll use this to reach you about your order." error={shown('mobile')}>
          {(a11y) => (
            <input {...a11y} className={styles.input} type="tel" inputMode="tel" autoComplete="tel-national" enterKeyHint="done" placeholder="98765 43210" value={customer.mobile} onChange={(e) => setField('mobile', e.target.value)} onBlur={() => touch('mobile')} data-testid="field-mobile" />
          )}
        </Field>
      </div>

      <Actions>
        <button type="button" className="btn btnSecondary" onClick={previousStage}>
          Back
        </button>
        <button type="submit" className="btn btnPrimary" data-testid="details-continue">
          Continue
        </button>
      </Actions>
    </form>
  )
}

export function DeliveryStage() {
  const delivery = useCheckoutStore((s) => s.delivery)
  const touched = useCheckoutStore((s) => s.touched)
  const setField = useCheckoutStore((s) => s.setDeliveryField)
  const touch = useCheckoutStore((s) => s.touch)
  const errors = validateDeliveryForm(delivery)
  const shown = (field: keyof typeof errors) => (touched[`delivery.${field}`] ? (errors[field] ?? null) : null)
  const blur = (field: string) => () => touch(`delivery.${field}`)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reveal(['line1', 'line2', 'city', 'state', 'pin'].map((f) => `delivery.${f}`), Object.keys(errors).length > 0)) nextStage()
  }

  return (
    <form className={styles.stage} onSubmit={submit} noValidate>
      <h1 className={styles.stageTitle}>Delivery</h1>
      <p className={styles.stageLead}>Where should we send your frames?</p>

      <div className={styles.form}>
        <Field id="line1" label="House / flat number and street" error={shown('line1')}>
          {(a11y) => (
            <input {...a11y} className={styles.input} type="text" autoComplete="address-line1" enterKeyHint="next" value={delivery.line1} onChange={(e) => setField('line1', e.target.value)} onBlur={blur('line1')} data-testid="field-line1" />
          )}
        </Field>
        <Field id="line2" label="Area, landmark" optional error={shown('line2')}>
          {(a11y) => (
            <input {...a11y} className={styles.input} type="text" autoComplete="address-line2" enterKeyHint="next" value={delivery.line2} onChange={(e) => setField('line2', e.target.value)} onBlur={blur('line2')} data-testid="field-line2" />
          )}
        </Field>
        <div className={styles.formRow}>
          <Field id="pin" label="PIN code" error={shown('pin')}>
            {(a11y) => (
              <input {...a11y} className={styles.input} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={7} autoComplete="postal-code" enterKeyHint="next" value={delivery.pin} onChange={(e) => setField('pin', e.target.value)} onBlur={blur('pin')} data-testid="field-pin" />
            )}
          </Field>
          <Field id="city" label="City / town" error={shown('city')}>
            {(a11y) => (
              <input {...a11y} className={styles.input} type="text" autoComplete="address-level2" enterKeyHint="next" value={delivery.city} onChange={(e) => setField('city', e.target.value)} onBlur={blur('city')} data-testid="field-city" />
            )}
          </Field>
        </div>
        <Field id="state" label="State" error={shown('state')}>
          {(a11y) => (
            <select {...a11y} className={`${styles.input} ${styles.select}`} autoComplete="address-level1" value={delivery.state} onChange={(e) => setField('state', e.target.value)} onBlur={blur('state')} data-testid="field-state">
              <option value="">Choose your state</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Actions>
        <button type="button" className="btn btnSecondary" onClick={previousStage}>
          Back
        </button>
        <button type="submit" className="btn btnPrimary" data-testid="delivery-continue">
          Continue to payment
        </button>
      </Actions>
    </form>
  )
}
