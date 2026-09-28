import { useEffect, useState } from 'react'
import { formatMoney } from '../../../shared/money'
import { adminApi } from './adminApi'
import { Link } from './Link'
import styles from './admin.module.css'
import type { AdminDashboard } from '../../../shared/admin'

function describeChange(entry: AdminDashboard['recentPriceChanges'][number]): string {
  if (entry.oldPriceMinor !== null && entry.newPriceMinor !== null) {
    return `${entry.productId}${entry.productSizeId ? ` · ${entry.productSizeId}` : ''}: ${formatMoney(entry.oldPriceMinor)} → ${formatMoney(entry.newPriceMinor)}`
  }
  return `${entry.productId}${entry.productSizeId ? ` · ${entry.productSizeId}` : ''}: ${entry.field} changed`
}

export function DashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .dashboard()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError('We couldn’t load the dashboard. Please refresh.'))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>
  if (!data) return <p role="status">Loading…</p>

  return (
    <div className={styles.page} data-testid="dashboard">
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{data.activeProductCount}</div>
          <div className={styles.statLabel}>Active products</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{data.activeSkuCount}</div>
          <div className={styles.statLabel}>Active sizes (SKUs)</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{data.inactiveProductCount}</div>
          <div className={styles.statLabel}>Inactive products</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{data.inactiveSkuCount}</div>
          <div className={styles.statLabel}>Inactive sizes</div>
        </div>
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent price changes</h2>
        {data.recentPriceChanges.length === 0 ? (
          <p className={styles.hint}>No changes yet.</p>
        ) : (
          <div className={styles.historyList}>
            {data.recentPriceChanges.map((entry) => (
              <div key={entry.id} className={styles.historyRow}>
                <span>{describeChange(entry)}</span>
                <span className={styles.historyMeta}>{entry.actorName}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent orders</h2>
        {data.recentOrders.length === 0 ? (
          <p className={styles.hint}>No orders yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th className={styles.numeric}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((order) => (
                <tr key={order.publicOrderId}>
                  <td data-label="Order">
                    <Link to={`/admin/orders/${order.publicOrderId}`}>{order.publicOrderId}</Link>
                  </td>
                  <td data-label="Customer">{order.customerName}</td>
                  <td data-label="Status">{order.paymentStatus}</td>
                  <td className={styles.numeric} data-label="Total">
                    {formatMoney(order.totalMinor, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
