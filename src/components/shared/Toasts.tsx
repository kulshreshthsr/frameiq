import { useEffect } from 'react'
import { useUIStore, type Notice } from '../../state/uiStore'
import styles from './shared.module.css'

const LIFETIME_MS: Record<Notice['kind'], number> = { info: 6000, success: 4500, error: 9000 }

function Toast({ notice }: { notice: Notice }) {
  const dismiss = useUIStore((s) => s.dismissNotice)

  useEffect(() => {
    const timer = setTimeout(() => dismiss(notice.id), LIFETIME_MS[notice.kind])
    return () => clearTimeout(timer)
  }, [notice.id, notice.kind, dismiss])

  return (
    <div
      className={`${styles.toast} ${notice.kind === 'error' ? styles.toastError : ''}`}
      // Errors interrupt; everything else waits its turn.
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      {/* A prefix in words, so meaning never depends on colour alone. */}
      <span className={styles.toastText}>
        {notice.kind === 'error' && <strong>Something went wrong. </strong>}
        {notice.message}
      </span>
      <button type="button" className={styles.toastClose} onClick={() => dismiss(notice.id)} aria-label="Dismiss message">
        ×
      </button>
    </div>
  )
}

export function Toasts() {
  const notices = useUIStore((s) => s.notices)
  if (notices.length === 0) return null
  return (
    <div className={styles.toasts}>
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} />
      ))}
    </div>
  )
}
