import { useEffect, useState } from 'react'
import { formatMoney } from '../../../shared/money'
import type { AdminOrderSummary } from '../../../shared/admin'
import { adminApi } from './adminApi'
import { Link } from './Link'
import * as adminStyles from './adminStyles'

function statusBadge(status: string): 'paid' | 'failed' | 'pending' {
  if (status === 'paid') return 'paid'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  return 'pending'
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
    <div className={adminStyles.page} data-testid="orders-page">
      <div className={adminStyles.pageHeader}>
        <h1 className={adminStyles.pageTitle}>Orders</h1>
      </div>
      {error && <p className={adminStyles.banner('error')}>{error}</p>}
      {!orders ? (
        <p role="status">Loading…</p>
      ) : orders.length === 0 ? (
        <p className={adminStyles.emptyState}>No orders yet.</p>
      ) : (
        <>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th className={adminStyles.tableTh}>Order</th>
                <th className={adminStyles.tableTh}>Customer</th>
                <th className={adminStyles.tableTh}>Placed</th>
                <th className={adminStyles.tableTh}>Payment</th>
                <th className={`${adminStyles.tableTh} ${adminStyles.numeric}`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.publicOrderId} data-testid={`order-row-${order.publicOrderId}`}>
                  <td className={adminStyles.tableTd} data-label="Order">
                    <Link to={`/admin/orders/${order.publicOrderId}`}>{order.publicOrderId}</Link>
                  </td>
                  <td className={adminStyles.tableTd} data-label="Customer">
                    {order.customerName}
                  </td>
                  <td className={adminStyles.tableTd} data-label="Placed">
                    {new Date(order.createdAt).toLocaleString()}
                  </td>
                  <td className={adminStyles.tableTd} data-label="Payment">
                    <span className={adminStyles.badge(statusBadge(order.paymentStatus))}>{order.paymentStatus}</span>
                  </td>
                  <td className={`${adminStyles.tableTd} ${adminStyles.numeric}`} data-label="Total">
                    {formatMoney(order.totalMinor, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={`${adminStyles.formActions} mt-3`}>
            <button type="button" className="btn btnSecondary" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
