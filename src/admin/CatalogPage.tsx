import { useEffect, useMemo, useState } from 'react'
import { formatMoney } from '../../shared/money'
import { adminApi, isAdminApiError } from './adminApi'
import { useAdminCatalog } from './catalogStore'
import { Link } from './Link'
import styles from './admin.module.css'
import type { AdminProductView } from '../../shared/admin'

type SortKey = 'name' | 'updated' | 'price'

function priceRange(product: AdminProductView): string {
  if (product.sizes.length === 0) return '—'
  const prices = product.sizes.map((s) => s.priceMinor)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`
}

export function CatalogPage() {
  const catalog = useAdminCatalog((s) => s.catalog)
  const loading = useAdminCatalog((s) => s.loading)
  const error = useAdminCatalog((s) => s.error)
  const load = useAdminCatalog((s) => s.load)
  const setCatalog = useAdminCatalog((s) => s.setCatalog)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sort, setSort] = useState<SortKey>('name')
  const [toggling, setToggling] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!catalog) void load()
  }, [catalog, load])

  const products = useMemo(() => {
    if (!catalog) return []
    let list = catalog.products
    if (filter !== 'all') list = list.filter((p) => (filter === 'active' ? p.active : !p.active))
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.styleId.toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'updated') sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    if (sort === 'price') sorted.sort((a, b) => (a.sizes[0]?.priceMinor ?? 0) - (b.sizes[0]?.priceMinor ?? 0))
    return sorted
  }, [catalog, filter, query, sort])

  const toggleActive = async (product: AdminProductView) => {
    setToggling(product.id)
    setToggleError(null)
    try {
      const next = !product.active
      if (next && !product.sizes.some((s) => s.active)) {
        setToggleError(`"${product.name}" has no active size — add or reactivate one before turning it on.`)
        return
      }
      const updated = await adminApi.updateProduct(product.id, { expectedVersion: product.rowVersion, active: next })
      setCatalog(updated)
    } catch (error) {
      setToggleError(isAdminApiError(error) && error.code === 'STALE_VERSION' ? 'That product changed elsewhere — reloading.' : 'Couldn’t change that. Please try again.')
      if (isAdminApiError(error) && error.code === 'STALE_VERSION') void load()
    } finally {
      setToggling(null)
    }
  }

  if (loading && !catalog) return <p role="status">Loading catalog…</p>
  if (error) return <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>
  if (!catalog) return null

  return (
    <div className={styles.page} data-testid="catalog-page">
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Catalog</h1>
        <div className={styles.pageActions}>
          <Link to="/admin/catalog/bulk" className="btn btnSecondary">
            Bulk pricing
          </Link>
          <Link to="/admin/products/new" className="btn btnPrimary" data-testid="new-product">
            New product
          </Link>
        </div>
      </div>

      {toggleError && <p className={`${styles.banner} ${styles.bannerError}`}>{toggleError}</p>}

      <div className={styles.toolbar}>
        <input className={`${styles.input} ${styles.searchInput}`} placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="catalog-search" aria-label="Search products" />
        <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter by status">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
          <option value="name">Sort: name</option>
          <option value="updated">Sort: last updated</option>
          <option value="price">Sort: price</option>
        </select>
      </div>

      {products.length === 0 ? (
        <p className={styles.emptyState}>No products match.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Product</th>
              <th>Style</th>
              <th>Status</th>
              <th className={styles.numeric}>Sizes</th>
              <th className={styles.numeric}>Price range</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} data-testid={`product-row-${product.id}`}>
                <td data-label="Product">
                  <Link to={`/admin/products/${product.id}`}>{product.name}</Link>
                </td>
                <td data-label="Style">{product.styleId}</td>
                <td data-label="Status">
                  <span className={`${styles.badge} ${product.active ? styles.badgeActive : styles.badgeInactive}`}>{product.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className={styles.numeric} data-label="Sizes">
                  {product.sizes.length}
                </td>
                <td className={styles.numeric} data-label="Price range">
                  {priceRange(product)}
                </td>
                <td data-label="Updated">{new Date(product.updatedAt).toLocaleDateString()}</td>
                <td data-label="">
                  <button type="button" className="btnText" disabled={toggling === product.id} onClick={() => void toggleActive(product)} data-testid={`toggle-${product.id}`}>
                    {product.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
