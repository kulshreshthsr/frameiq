import { useEffect, useState } from 'react'
import { formatMoney } from '../../shared/money'
import type { AdminCatalog, CatalogAuditEntry } from '../../shared/admin'
import { adminApi, isAdminApiError } from './adminApi'
import styles from './admin.module.css'

/** A size's price history, with a way to restore an earlier value. Reverting
 * writes a brand new entry (see server/catalog/adminCatalogRepo.ts) — this
 * panel never edits or removes what's already here. */
export function PriceHistory({
  productId,
  sizeId,
  currentRowVersion,
  onClose,
  onReverted,
}: {
  productId: string
  sizeId: string
  currentRowVersion: number
  onClose: () => void
  onReverted: (catalog: AdminCatalog) => void
}) {
  const [entries, setEntries] = useState<CatalogAuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revertingId, setRevertingId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .audit({ productId, sizeId })
      .then(({ entries }) => !cancelled && setEntries(entries))
      .catch(() => !cancelled && setError('Couldn’t load price history.'))
    return () => {
      cancelled = true
    }
  }, [productId, sizeId])

  const revert = async (entry: CatalogAuditEntry) => {
    setRevertingId(entry.id)
    setError(null)
    try {
      const catalog = await adminApi.revert(entry.id, currentRowVersion)
      onReverted(catalog)
      onClose()
    } catch (err) {
      setError(isAdminApiError(err) && err.code === 'STALE_VERSION' ? 'This price changed elsewhere since you opened this panel. Please close and reopen it.' : 'Couldn’t revert that change.')
    } finally {
      setRevertingId(null)
    }
  }

  return (
    <div className={styles.panel} role="dialog" aria-label={`Price history for ${sizeId}`} data-testid="price-history">
      <div className={styles.pageHeader} style={{ marginBottom: 10 }}>
        <h3 className={styles.panelTitle}>Price history — {sizeId}</h3>
        <button type="button" className="btnText" onClick={onClose} data-testid="close-history">
          Close
        </button>
      </div>
      {error && <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>}
      {!entries ? (
        <p role="status">Loading…</p>
      ) : entries.length === 0 ? (
        <p className={styles.hint}>No price changes recorded yet.</p>
      ) : (
        <div className={styles.historyList}>
          {entries.map((entry) => (
            <div key={entry.id} className={styles.historyRow} data-testid={`history-entry-${entry.id}`}>
              <span>
                {entry.oldPriceMinor !== null && entry.newPriceMinor !== null ? (
                  <>
                    {formatMoney(entry.oldPriceMinor)} → {formatMoney(entry.newPriceMinor)}
                  </>
                ) : (
                  `${entry.field} changed`
                )}
                <span className={styles.historyMeta}>
                  {' · '}
                  {entry.actorName} · {new Date(entry.createdAt).toLocaleString()}
                  {entry.note ? ` · ${entry.note}` : ''}
                </span>
              </span>
              {entry.oldPriceMinor !== null && (
                <button type="button" className="btnText" disabled={revertingId === entry.id} onClick={() => void revert(entry)} data-testid={`revert-${entry.id}`}>
                  Restore {formatMoney(entry.oldPriceMinor)}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
