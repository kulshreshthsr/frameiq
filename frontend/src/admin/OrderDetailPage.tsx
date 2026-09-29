import { useEffect, useState } from 'react'
import { formatMoney } from '../../../shared/money'
import type { AdminOrderDetail } from '../../../shared/admin'
import { adminApi } from './adminApi'
import { Link } from './Link'
import * as adminStyles from './adminStyles'

export function OrderDetailPage({ id }: { id: string }) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOrder(null)
    setError(null)
    adminApi
      .order(id)
      .then((r) => setOrder(r.order))
      .catch(() => setError('We couldn’t find that order.'))
  }, [id])

  if (error) return <p className={adminStyles.banner('error')}>{error}</p>
  if (!order) return <p role="status">Loading…</p>

  return (
    <div className={adminStyles.page} data-testid="order-detail-page">
      <div className={adminStyles.pageHeader}>
        <div>
          <Link to="/admin/orders" className={adminStyles.crumb}>
            ‹ Orders
          </Link>
          <h1 className={adminStyles.pageTitle}>{order.publicOrderId}</h1>
        </div>
        <span className={adminStyles.badge(order.paymentStatus === 'paid' ? 'active' : 'inactive')}>{order.paymentStatus}</span>
      </div>

      <div className={adminStyles.cardGrid}>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statValue}>{formatMoney(order.totalMinor, order.currency)}</div>
          <div className={adminStyles.statLabel}>Total</div>
        </div>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statValue}>{order.orderStatus}</div>
          <div className={adminStyles.statLabel}>Order status</div>
        </div>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statValue}>{new Date(order.createdAt).toLocaleDateString()}</div>
          <div className={adminStyles.statLabel}>Placed</div>
        </div>
      </div>

      <div className={adminStyles.panel}>
        <h2 className={adminStyles.panelTitle}>Customer &amp; delivery</h2>
        <p>
          {order.customerName} · {order.customerMobile}
        </p>
        <p>
          {order.delivery.line1}
          {order.delivery.line2 ? `, ${order.delivery.line2}` : ''}
          <br />
          {order.delivery.city}, {order.delivery.state} {order.delivery.pin}
        </p>
      </div>

      <div className={adminStyles.panel}>
        <h2 className={adminStyles.panelTitle}>Items (at the price this order was placed at)</h2>
        <table className={adminStyles.table}>
          <thead>
            <tr>
              <th className={adminStyles.tableTh}>Product</th>
              <th className={adminStyles.tableTh}>Size</th>
              <th className={adminStyles.tableTh}>Glass</th>
              <th className={adminStyles.tableTh}>Mat</th>
              <th className={`${adminStyles.tableTh} ${adminStyles.numeric}`}>Qty</th>
              <th className={`${adminStyles.tableTh} ${adminStyles.numeric}`}>Unit price</th>
              <th className={`${adminStyles.tableTh} ${adminStyles.numeric}`}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i}>
                <td className={adminStyles.tableTd} data-label="Product">
                  {item.productName}
                </td>
                <td className={adminStyles.tableTd} data-label="Size">
                  {item.sizeLabel}
                </td>
                <td className={adminStyles.tableTd} data-label="Glass">
                  {item.glassName}
                </td>
                <td className={adminStyles.tableTd} data-label="Mat">
                  {item.matName}
                </td>
                <td className={`${adminStyles.tableTd} ${adminStyles.numeric}`} data-label="Qty">
                  {item.quantity}
                </td>
                <td className={`${adminStyles.tableTd} ${adminStyles.numeric}`} data-label="Unit price">
                  {formatMoney(item.unitPriceMinor, order.currency)}
                </td>
                <td className={`${adminStyles.tableTd} ${adminStyles.numeric}`} data-label="Line total">
                  {formatMoney(item.lineTotalMinor, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`${adminStyles.hint} mt-2.5`}>Catalog version at purchase: {order.catalogVersion}. These prices never change, even if the catalog does.</p>
      </div>
    </div>
  )
}
