import { useEffect, useState } from 'react'
import { formatMoney } from '../../shared/money'
import type { AdminOrderSummary } from '../../shared/admin'
import { adminApi } from './adminApi'
import { Link } from './Link'
import styles from './admin.module.css'

function statusBadge(status: string): string {
  if (status === 'paid') return styles.badgePaid
  if (status === 'failed' || status === 'cancelled') return styles.badgeFailed
  return styles.badgePending
}

export function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrderSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    adminApi
      .orders()
      .then((r) => setOrders(r.orders))
      .catch(() => setError('Couldn’t load orders.'))
  }, [])

  const loadMore = async () => {
    if (!orders || orders.length === 0) return
    setLoadingMore(true)
    try {
      const { orders: more } = await adminApi.orders(orders[orders.length - 1].publicOrderId)
      setOrders((cur) => [...(cur ?? []), ...more])
    } catch {
      setError('Couldn’t load more orders.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className={styles.page} data-testid="orders-page">
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Orders</h1>
      </div>
      {error && <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>}
      {!orders ? (
        <p role="status">Loading…</p>
      ) : orders.length === 0 ? (
        <p className={styles.emptyState}>No orders yet.</p>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Placed</th>
                <th>Payment</th>
                <th className={styles.numeric}>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.publicOrderId} data-testid={`order-row-${order.publicOrderId}`}>
                  <td data-label="Order">
                    <Link to={`/admin/orders/${order.publicOrderId}`}>{order.publicOrderId}</Link>
                  </td>
                  <td data-label="Customer">{order.customerName}</td>
                  <td data-label="Placed">{new Date(order.createdAt).toLocaleString()}</td>
                  <td data-label="Payment">
                    <span className={`${styles.badge} ${statusBadge(order.paymentStatus)}`}>{order.paymentStatus}</span>
                  </td>
                  <td className={styles.numeric} data-label="Total">
                    {formatMoney(order.totalMinor, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.formActions} style={{ marginTop: 12 }}>
            <button type="button" className="btn btnSecondary" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
