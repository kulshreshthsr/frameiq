/**
 * (Re)generates the production package for an order.
 *
 *   npm run order:package -- FRM-2026-000123
 *
 * The package is produced automatically when an order is paid; use this if
 * that step failed, or to rebuild it after files were moved.
 */
import { buildContext } from '../server/bootstrap.ts'
import { loadConfig } from '../server/config.ts'
import { loadEnvFile } from '../server/env.ts'
import { findOrderByPublicId, PUBLIC_ID_PATTERN } from '../server/orders/repo.ts'
import { generateProductionPackage } from '../server/production/package.ts'

async function main() {
  loadEnvFile()
  const publicId = process.argv[2] ?? ''
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    console.error('Usage: npm run order:package -- FRM-2026-000123')
    process.exit(1)
  }
  const ctx = await buildContext(loadConfig())
  const order = await findOrderByPublicId(ctx.db, publicId)
  if (!order) {
    console.error(`No order ${publicId}`)
    process.exit(1)
  }
  if (order.paymentStatus !== 'paid') console.warn(`Note: ${publicId} is not paid (${order.paymentStatus}).`)
  const result = await generateProductionPackage(ctx, order.id)
  console.log(`Wrote ${result.files.length + 1} files to ${ctx.config.packagesDir}/${result.folder}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
