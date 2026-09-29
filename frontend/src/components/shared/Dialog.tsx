import { useEffect, useRef, type ReactNode } from 'react'

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
      className={`bg-card shadow-lift w-full max-w-[min(440px,calc(100vw-24px))] rounded-[14px] border-none p-0 text-ink backdrop:bg-[rgba(33,28,23,0.5)] ${className ?? ''}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) dismisses.
        if (e.target === ref.current) onClose()
      }}
    >
      {open && <div className="p-6">{children}</div>}
    </dialog>
  )
}
