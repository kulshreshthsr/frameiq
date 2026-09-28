import { useEffect } from 'react'
import { useAdminAuth } from './adminStore'
import { AdminShell } from './AdminShell'
import { BulkPricingPage } from './BulkPricingPage'
import { CatalogPage } from './CatalogPage'
import { DashboardPage } from './DashboardPage'
import { LoginPage } from './LoginPage'
import { OrderDetailPage } from './OrderDetailPage'
import { OrdersPage } from './OrdersPage'
import { ProductPage } from './ProductPage'
import { navigate, useAdminRoute } from './router'
import styles from './admin.module.css'

/**
 * The owner admin area — a completely separate small app from the customer
 * configurator (see `src/main.tsx`, which decides which one to mount from
 * the URL). It shares only colour tokens and the `.btn` primitives from
 * `index.css`; nothing from `src/checkout` or `src/components` is imported
 * here, and nothing here is imported by the customer bundle.
 */
export default function AdminApp() {
  const status = useAdminAuth((s) => s.status)
  const checkSession = useAdminAuth((s) => s.checkSession)
  const route = useAdminRoute()

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  if (status === 'checking') {
    return (
      <div className={styles.loadingScreen} role="status">
        Loading admin…
      </div>
    )
  }

  if (status === 'anon') return <LoginPage />

  if (route.name === 'login') {
    navigate('/admin')
    return null
  }

  return (
    <AdminShell route={route}>
      {route.name === 'dashboard' && <DashboardPage />}
      {route.name === 'catalog' && <CatalogPage />}
      {route.name === 'bulk' && <BulkPricingPage />}
      {route.name === 'newProduct' && <ProductPage id={null} />}
      {route.name === 'product' && <ProductPage id={route.id} />}
      {route.name === 'orders' && <OrdersPage />}
      {route.name === 'order' && <OrderDetailPage id={route.id} />}
      {route.name === 'notFound' && <p className={styles.emptyState}>Nothing here. {route.path}</p>}
    </AdminShell>
  )
}
