import type { AdminDashboard } from '../../../shared/admin.ts'
import { loadAdminCatalog, listAudit } from '../catalog/adminCatalogRepo.ts'
import type { Executor } from '../db/client.ts'
import { listOrdersForAdmin } from '../orders/adminOrders.ts'

/** The one-screen operational summary: what's sellable, what changed
 * recently, and what's come in. Deliberately not analytics — just enough to
 * orient the owner before they go make a change. */
export async function buildDashboard(ex: Executor): Promise<AdminDashboard> {
  const catalog = await loadAdminCatalog(ex)
  let activeProductCount = 0
  let inactiveProductCount = 0
  let activeSkuCount = 0
  let inactiveSkuCount = 0
  for (const product of catalog.products) {
    if (product.active) activeProductCount += 1
    else inactiveProductCount += 1
    for (const size of product.sizes) {
      if (size.active) activeSkuCount += 1
      else inactiveSkuCount += 1
    }
  }
  const [recentPriceChanges, recentOrders] = await Promise.all([listAudit(ex, { limit: 10 }), listOrdersForAdmin(ex, { limit: 10 })])
  return { activeProductCount, inactiveProductCount, activeSkuCount, inactiveSkuCount, recentPriceChanges, recentOrders }
}
