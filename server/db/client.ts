import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient, type Client, type InValue, type ResultSet, type Row, type Transaction } from '@libsql/client'
import { MIGRATIONS } from './migrations.ts'

/**
 * A thin layer over libsql (SQLite). It runs against a local file in
 * development and can be pointed at a hosted libsql database later without
 * touching any query. Everything that changes money-related state happens
 * inside a transaction (`withTx`), so a half-finished update is never visible.
 */

export type Db = Client

// --------------------------------------------------------------- serialisation
//
// SQLite has a single writer, and libsql hands its one connection to an open
// transaction — so a statement issued while another request's transaction is
// open collides with it (and, on an in-memory database, would land on a
// different, empty database). Every statement and transaction on a Db
// therefore goes through one queue and runs strictly one at a time. Correct
// first; for a shop taking orders, the throughput is far more than enough.

const EXCLUSIVE = Symbol('exclusive')
const RAW_TRANSACTION = Symbol('rawTransaction')
type Guarded = Client & { [EXCLUSIVE]: <T>(work: () => Promise<T>) => Promise<T>; [RAW_TRANSACTION]: Client['transaction'] }

/** Makes a libsql client safe to share between concurrent requests. */
export function guardDb(client: Client): Db {
  let tail: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work, work)
    tail = result.catch(() => undefined)
    return result
  }
  const rawExecute = client.execute.bind(client)
  const rawBatch = client.batch.bind(client)
  const rawTransaction = client.transaction.bind(client)
  client.execute = ((statement: Parameters<Client['execute']>[0]) => exclusive(() => rawExecute(statement))) as Client['execute']
  client.batch = ((statements: Parameters<Client['batch']>[0], mode?: Parameters<Client['batch']>[1]) => exclusive(() => rawBatch(statements, mode))) as Client['batch']
  const guarded = client as Guarded
  guarded[EXCLUSIVE] = exclusive
  guarded[RAW_TRANSACTION] = rawTransaction as Client['transaction']
  return client
}
/** Either the database or an open transaction — code that only runs queries takes this. */
export type Executor = Pick<Client, 'execute'> | Pick<Transaction, 'execute'>

export async function openDb(url: string): Promise<Db> {
  if (url.startsWith('file:') && !url.startsWith('file::memory:')) {
    const path = url.slice('file:'.length)
    if (path) mkdirSync(dirname(path), { recursive: true })
  }
  const db = guardDb(createClient({ url }))
  await db.execute('PRAGMA foreign_keys = ON')
  return db
}

export async function migrate(db: Db, now: () => Date = () => new Date()): Promise<string[]> {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set((await db.execute('SELECT id FROM schema_migrations')).rows.map((row) => String(row.id)))
  const ran: string[] = []
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    await withTx(db, async (tx) => {
      for (const statement of migration.statements) await tx.execute(statement)
      await tx.execute({ sql: 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', args: [migration.id, now().toISOString()] })
    })
    ran.push(migration.id)
  }
  return ran
}

export async function withTx<T>(db: Db, work: (tx: Transaction) => Promise<T>): Promise<T> {
  const guarded = db as Guarded
  const openTransaction = guarded[RAW_TRANSACTION] ?? db.transaction.bind(db)
  const inSlot = guarded[EXCLUSIVE] ?? (<R>(fn: () => Promise<R>) => fn())
  return inSlot(async () => {
    const tx = await openTransaction('write')
    try {
      const result = await work(tx)
      await tx.commit()
      return result
    } catch (error) {
      await tx.rollback()
      throw error
    } finally {
      tx.close()
    }
  })
}

export async function query(executor: Executor, sql: string, args: InValue[] = []): Promise<Row[]> {
  const result: ResultSet = await executor.execute({ sql, args })
  return result.rows
}

export async function queryOne(executor: Executor, sql: string, args: InValue[] = []): Promise<Row | undefined> {
  return (await query(executor, sql, args))[0]
}

export async function run(executor: Executor, sql: string, args: InValue[] = []): Promise<ResultSet> {
  return executor.execute({ sql, args })
}

/** True for a violated UNIQUE constraint (used to detect a duplicate insert). */
export function isUniqueViolation(error: unknown, column?: string): boolean {
  const message = String((error as { message?: string })?.message ?? '')
  return /UNIQUE constraint failed/i.test(message) && (column === undefined || message.includes(column))
}
