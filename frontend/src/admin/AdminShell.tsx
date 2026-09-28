import type { ReactNode } from 'react'
import { useAdminAuth } from './adminStore'
import { Link } from './Link'
import type { AdminRoute } from './router'
import styles from './admin.module.css'

const NAV: { route: AdminRoute['name'][]; to: string; label: string }[] = [
  { route: ['dashboard'], to: '/admin', label: 'Dashboard' },
  { route: ['catalog', 'product', 'newProduct'], to: '/admin/catalog', label: 'Catalog' },
  { route: ['bulk'], to: '/admin/catalog/bulk', label: 'Bulk pricing' },
  { route: ['orders', 'order'], to: '/admin/orders', label: 'Orders' },
]

export function AdminShell({ route, children }: { route: AdminRoute; children: ReactNode }) {
  const user = useAdminAuth((s) => s.user)
  const logout = useAdminAuth((s) => s.logout)

  return (
    <div className={styles.shell} data-testid="admin-shell">
      <nav className={styles.nav} aria-label="Admin">
        <span className={styles.navBrand}>Decoryl — Admin</span>
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} className={`${styles.navLink} ${item.route.includes(route.name) ? styles.navLinkActive : ''}`} aria-current={item.route.includes(route.name) ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
        <span className={styles.navSpacer} />
        {user && <span className={styles.navUser}>{user.name}</span>}
        <button type="button" className={styles.navLink} onClick={() => void logout()} data-testid="logout">
          Sign out
        </button>
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
  )
}
