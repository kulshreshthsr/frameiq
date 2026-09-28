import type { ReactNode } from 'react'
import styles from './checkout.module.css'

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
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': messageId })}
      {error ? (
        <p id={messageId} className={styles.errorText} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className={styles.hintText}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
