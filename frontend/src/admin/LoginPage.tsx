import { useId, useState } from 'react'
import { useAdminAuth } from './adminStore'
import * as adminStyles from './adminStyles'

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
    <div className={adminStyles.loginScreen}>
      <form className={adminStyles.loginCard} onSubmit={(e) => void submit(e)} data-testid="login-form">
        <h1 className={adminStyles.loginTitle}>Owner sign in</h1>
        <p className={adminStyles.loginSub}>Catalog and pricing control. Not for customers.</p>

        {error && (
          <p className={adminStyles.banner('error')} role="alert" data-testid="login-error">
            {error}
          </p>
        )}

        <div className={adminStyles.form}>
          <div className={adminStyles.field}>
            <label htmlFor={emailId} className={adminStyles.fieldLabel}>
              Email
            </label>
            <input
              id={emailId}
              className={adminStyles.inputBase}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email"
            />
          </div>
          <div className={adminStyles.field}>
            <label htmlFor={passwordId} className={adminStyles.fieldLabel}>
              Password
            </label>
            <input
              id={passwordId}
              className={adminStyles.inputBase}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password"
            />
          </div>
          <div className={adminStyles.formActions}>
            <button type="submit" className="btn btnPrimary" disabled={busy} data-testid="login-submit">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
