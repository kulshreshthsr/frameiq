import { useEffect, useState } from 'react'
import { formatMoney } from '../../../shared/money'
import { adminApi } from './adminApi'
import { Link } from './Link'
import * as adminStyles from './adminStyles'
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

  if (error) return <p className={adminStyles.banner('error')}>{error}</p>
  if (!data) return <p role="status">Loading…</p>

  return (
    <div className={adminStyles.page} data-testid="dashboard">
      <div className={adminStyles.pageHeader}>
        <h1 className={adminStyles.pageTitle}>Dashboard</h1>
      </div>

      <div className={adminStyles.cardGrid}>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statValue}>{data.activeProductCount}</div>
          <div className={adminStyles.statLabel}>Active products</div>
        </div>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statValue}>{data.activeSkuCount}</div>
          <div className={adminStyles.statLabel}>Active sizes (SKUs)</div>
        </div>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statValue}>{data.inactiveProductCount}</div>
          <div className={adminStyles.statLabel}>Inactive products</div>
        </div>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statValue}>{data.inactiveSkuCount}</div>
          <div className={adminStyles.statLabel}>Inactive sizes</div>
        </div>
      </div>

      <div className={adminStyles.panel}>
        <h2 className={adminStyles.panelTitle}>Recent price changes</h2>
        {data.recentPriceChanges.length === 0 ? (
          <p className={adminStyles.hint}>No changes yet.</p>
        ) : (
          <div className={adminStyles.historyList}>
            {data.recentPriceChanges.map((entry) => (
              <div key={entry.id} className={adminStyles.historyRow}>
                <span>{describeChange(entry)}</span>
                <span className={adminStyles.historyMeta}>{entry.actorName}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={adminStyles.panel}>
        <h2 className={adminStyles.panelTitle}>Recent orders</h2>
        {data.recentOrders.length === 0 ? (
          <p className={adminStyles.hint}>No orders yet.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th className={adminStyles.tableTh}>Order</th>
                <th className={adminStyles.tableTh}>Customer</th>
                <th className={adminStyles.tableTh}>Status</th>
                <th className={`${adminStyles.tableTh} ${adminStyles.numeric}`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((order) => (
                <tr key={order.publicOrderId}>
                  <td className={adminStyles.tableTd} data-label="Order">
                    <Link to={`/admin/orders/${order.publicOrderId}`}>{order.publicOrderId}</Link>
                  </td>
                  <td className={adminStyles.tableTd} data-label="Customer">
                    {order.customerName}
                  </td>
                  <td className={adminStyles.tableTd} data-label="Status">
                    {order.paymentStatus}
                  </td>
                  <td className={`${adminStyles.tableTd} ${adminStyles.numeric}`} data-label="Total">
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
