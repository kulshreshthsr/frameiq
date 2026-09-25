/**
 * Loads the product catalog from `shared/catalogSeed.ts` into the database.
 *
 *   npm run db:seed              # shows what would change
 *   npm run db:seed -- --apply   # replaces the stored catalog
 *
 * This is how the business owner changes what is sold: edit the seed file,
 * run this. Orders already placed keep the names and prices they were bought
 * at; only new orders see the new catalog.
 */
import { SEED_CATALOG } from '../shared/catalogSeed.ts'
import { validateCatalog } from '../shared/catalog.ts'
import { catalogVersion, isCatalogEmpty, loadCatalog, saveCatalog } from '../server/catalog/catalogRepo.ts'
import { loadConfig } from '../server/config.ts'
import { migrate, openDb } from '../server/db/client.ts'
import { loadEnvFile } from '../server/env.ts'

async function main() {
  loadEnvFile()
  const config = loadConfig()
  const apply = process.argv.includes('--apply')

  const problems = validateCatalog(SEED_CATALOG)
  if (problems.length > 0) {
    console.error('The catalog has problems:\n - ' + problems.join('\n - '))
    process.exit(1)
  }

  const db = await openDb(config.databaseUrl)
  await migrate(db)
  const incoming = catalogVersion(SEED_CATALOG)
  const stored = (await isCatalogEmpty(db)) ? null : (await loadCatalog(db)).version

  console.log(`Database : ${config.databaseUrl}`)
  console.log(`Stored   : ${stored ?? '(empty)'}`)
  console.log(`Incoming : ${incoming}  (${SEED_CATALOG.products.length} products)`)

  if (stored === incoming) {
    console.log('Nothing to change.')
    return
  }
  if (!apply) {
    console.log('\nRun again with --apply to replace the stored catalog.')
    return
  }
  await saveCatalog(db, SEED_CATALOG)
  console.log(`\nCatalog updated to ${incoming}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
