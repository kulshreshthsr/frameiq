import { randomBytes } from 'node:crypto'
import { SEED_CATALOG } from '../shared/catalogSeed.ts'
import { isCatalogEmpty, saveCatalog } from './catalog/catalogRepo.ts'
import type { Config } from './config.ts'
import type { AppContext } from './context.ts'
import { migrate, openDb } from './db/client.ts'
import { createLogger, stdoutSink } from './log.ts'
import { LogNotifier } from './notifications/notifier.ts'
import { RazorpayProvider } from './payments/razorpay.ts'
import { SandboxProvider } from './payments/sandbox.ts'
import { DiskStorage } from './storage/objectStorage.ts'

export const randomId = (bytes = 16): string => randomBytes(bytes).toString('base64url')

/**
 * Turns configuration into a running set of services: opens the database,
 * applies migrations, and picks the payment provider. Tests pass `overrides`
 * to swap in an in-memory storage, a fixed clock, and so on.
 */
export async function buildContext(config: Config, overrides: Partial<AppContext> = {}): Promise<AppContext> {
  const log = overrides.log ?? createLogger(stdoutSink)
  const db = overrides.db ?? (await openDb(config.databaseUrl))
  const ran = await migrate(db)
  if (ran.length > 0) log.event('db.migrated', { migrations: ran })

  if (await isCatalogEmpty(db)) {
    if (config.env === 'production') {
      // Never fill a live shop with placeholder products and prices.
      throw new Error('The product catalog is empty. Edit shared/catalogSeed.ts, then run `npm run db:seed` before starting in production.')
    }
    const version = await saveCatalog(db, SEED_CATALOG)
    log.event('catalog.seeded', { version, note: 'development placeholder data' })
  }

  const rid = overrides.randomId ?? randomId
  const payments =
    overrides.payments ??
    (config.payment.provider === 'razorpay'
      ? new RazorpayProvider({ keyId: config.payment.keyId, keySecret: config.payment.keySecret, webhookSecret: config.payment.webhookSecret })
      : new SandboxProvider(config.payment.sandboxSecret, rid))

  return {
    config,
    db,
    log,
    storage: overrides.storage ?? new DiskStorage(config.uploadsDir),
    packageStorage: overrides.packageStorage ?? new DiskStorage(config.packagesDir),
    payments,
    notifier: overrides.notifier ?? new LogNotifier(log),
    now: overrides.now ?? (() => new Date()),
    randomId: rid,
  }
}
