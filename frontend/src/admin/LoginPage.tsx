import { useId, useState } from 'react'
import { useAdminAuth } from './adminStore'
import styles from './admin.module.css'

export function LoginPage() {
  const login = useAdminAuth((s) => s.login)
  const error = useAdminAuth((s) => s.error)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const emailId = useId()
  const passwordId = useId()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    await login(email.trim(), password)
    setBusy(false)
  }

  return (
    <div className={styles.loginScreen}>
      <form className={styles.loginCard} onSubmit={(e) => void submit(e)} data-testid="login-form">
        <h1 className={styles.loginTitle}>Owner sign in</h1>
        <p className={styles.loginSub}>Catalog and pricing control. Not for customers.</p>

        {error && (
          <p className={`${styles.banner} ${styles.bannerError}`} role="alert" data-testid="login-error">
            {error}
          </p>
        )}

        <div className={styles.form}>
          <div className={styles.field}>
            <label htmlFor={emailId}>Email</label>
            <input
              id={emailId}
              className={styles.input}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={passwordId}>Password</label>
            <input
              id={passwordId}
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password"
            />
          </div>
          <div className={styles.formActions}>
            <button type="submit" className="btn btnPrimary" disabled={busy} data-testid="login-submit">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
