import type { ReactNode } from 'react'
import * as cs from './checkoutStyles'

interface FieldProps {
  id: string
  label: string
  /** Shown beneath the input until there is an error. */
  hint?: string
  error?: string | null
  optional?: boolean
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}

/**
 * A labelled form field. The label is always visible (never a placeholder that
 * vanishes while typing), the error is announced and tied to the input, and
 * the input itself is rendered by the caller so each field can set the right
 * mobile keyboard and autofill hints.
 */
export function Field({ id, label, hint, error, optional, children }: FieldProps) {
  const messageId = error || hint ? `${id}-message` : undefined
  return (
    <div className={cs.field}>
      <label htmlFor={id} className={cs.label}>
        {label}
        {optional && <span className={cs.optional}> (optional)</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': messageId })}
      {error ? (
        <p id={messageId} className={cs.errorText} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className={cs.hintText}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
