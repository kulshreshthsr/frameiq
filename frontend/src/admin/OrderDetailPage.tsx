import { useEffect, useState } from 'react'
import { formatMoney } from '../../../shared/money'
import type { AdminOrderDetail } from '../../../shared/admin'
import { adminApi } from './adminApi'
import { Link } from './Link'
import styles from './admin.module.css'

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

  if (error) return <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>
  if (!order) return <p role="status">Loading…</p>

  return (
    <div className={styles.page} data-testid="order-detail-page">
      <div className={styles.pageHeader}>
        <div>
          <Link to="/admin/orders" className={styles.crumb}>
            ‹ Orders
          </Link>
          <h1 className={styles.pageTitle}>{order.publicOrderId}</h1>
        </div>
        <span className={`${styles.badge} ${order.paymentStatus === 'paid' ? styles.badgeActive : styles.badgeInactive}`}>{order.paymentStatus}</span>
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{formatMoney(order.totalMinor, order.currency)}</div>
          <div className={styles.statLabel}>Total</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{order.orderStatus}</div>
          <div className={styles.statLabel}>Order status</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{new Date(order.createdAt).toLocaleDateString()}</div>
          <div className={styles.statLabel}>Placed</div>
        </div>
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Customer &amp; delivery</h2>
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

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Items (at the price this order was placed at)</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Product</th>
              <th>Size</th>
              <th>Glass</th>
              <th>Mat</th>
              <th className={styles.numeric}>Qty</th>
              <th className={styles.numeric}>Unit price</th>
              <th className={styles.numeric}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i}>
                <td data-label="Product">{item.productName}</td>
                <td data-label="Size">{item.sizeLabel}</td>
                <td data-label="Glass">{item.glassName}</td>
                <td data-label="Mat">{item.matName}</td>
                <td className={styles.numeric} data-label="Qty">
                  {item.quantity}
                </td>
                <td className={styles.numeric} data-label="Unit price">
                  {formatMoney(item.unitPriceMinor, order.currency)}
                </td>
                <td className={styles.numeric} data-label="Line total">
                  {formatMoney(item.lineTotalMinor, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.hint} style={{ marginTop: 10 }}>
          Catalog version at purchase: {order.catalogVersion}. These prices never change, even if the catalog does.
        </p>
      </div>
    </div>
  )
}
