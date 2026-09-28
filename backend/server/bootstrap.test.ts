import { createClient } from '@libsql/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildContext } from './bootstrap.ts'
import { loadConfig } from './config.ts'
import { findUserByEmail } from './auth/users.ts'
import { isCatalogEmpty } from './catalog/catalogRepo.ts'
import { guardDb, type Db } from './db/client.ts'
import { memoryLogger } from './log.ts'

/**
 * `buildContext` is what a real server start calls; `server/test/harness.ts`
 * builds its `AppContext` by hand for speed, which is why the owner-bootstrap
 * behaviour written into `buildContext` itself needs its own coverage here —
 * nothing else exercises it.
 */

let db: Db

beforeEach(() => {
  db = guardDb(createClient({ url: 'file::memory:' }))
})

async function freshCatalogless(overrides: Record<string, string> = {}) {
  const config = loadConfig({ FRAMENGINE_ENV: 'test', SANDBOX_WEBHOOK_SECRET: 'x', ...overrides })
  const { logger } = memoryLogger()
  return buildContext(config, { db, log: logger })
}

describe('owner bootstrap on server start', () => {
  it('creates the owner account from OWNER_BOOTSTRAP_* on an empty database', async () => {
    const ctx = await freshCatalogless({ OWNER_BOOTSTRAP_EMAIL: 'owner@shop.example', OWNER_BOOTSTRAP_PASSWORD: 'a-strong-password-1', OWNER_BOOTSTRAP_NAME: 'Asha' })
    const user = await findUserByEmail(ctx.db, 'owner@shop.example')
    expect(user).toMatchObject({ name: 'Asha', role: 'owner', active: true })
  })

  it('does nothing, and does not crash, when no bootstrap variables are set', async () => {
    const ctx = await freshCatalogless()
    expect(await findUserByEmail(ctx.db, 'anyone@shop.example')).toBeNull()
  })

  it('never overwrites an account that already exists — it is a one-time initializer, not a password reset', async () => {
    const first = await freshCatalogless({ OWNER_BOOTSTRAP_EMAIL: 'owner@shop.example', OWNER_BOOTSTRAP_PASSWORD: 'first-password-123' })
    const before = await findUserByEmail(first.db, 'owner@shop.example')

    // A second start, same (already-populated) database, a different bootstrap password.
    const second = await freshCatalogless({ OWNER_BOOTSTRAP_EMAIL: 'owner@shop.example', OWNER_BOOTSTRAP_PASSWORD: 'a-completely-different-password' })
    const after = await findUserByEmail(second.db, 'owner@shop.example')
    expect(after?.passwordHash).toBe(before?.passwordHash) // unchanged
  })

  it('still seeds the development catalog alongside the owner account', async () => {
    const ctx = await freshCatalogless({ OWNER_BOOTSTRAP_EMAIL: 'owner@shop.example', OWNER_BOOTSTRAP_PASSWORD: 'a-strong-password-1' })
    expect(await isCatalogEmpty(ctx.db)).toBe(false)
  })
})
