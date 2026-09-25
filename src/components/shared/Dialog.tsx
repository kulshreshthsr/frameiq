import { useEffect, useRef, type ReactNode } from 'react'
import styles from './shared.module.css'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Extra class on the panel, for dialogs that need their own sizing. */
  className?: string
}

/**
 * A modal dialog built on the native <dialog> element, which gives — for
 * free and correctly — a focus trap, Escape to close, inert background, and
 * focus returning to whatever opened it.
 */
export function Dialog({ open, title, onClose, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${className ?? ''}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) dismisses.
        if (e.target === ref.current) onClose()
      }}
    >
      {open && <div className={styles.dialogBody}>{children}</div>}
    </dialog>
  )
}
