import type { Config } from './config.ts'
import type { Db } from './db/client.ts'
import type { Logger } from './log.ts'
import type { ObjectStorage } from './storage/objectStorage.ts'
import type { PaymentProvider } from './payments/provider.ts'
import type { Notifier } from './notifications/notifier.ts'

/**
 * Everything the server's services need, passed explicitly rather than
 * reached for globally. Tests build one with an in-memory database and
 * storage, a controllable clock, and the sandbox provider; production builds
 * one from configuration. Nothing in the services knows which it got.
 */
export interface AppContext {
  config: Config
  db: Db
  storage: ObjectStorage
  packageStorage: ObjectStorage
  log: Logger
  payments: PaymentProvider
  notifier: Notifier
  now: () => Date
  /** Random URL-safe id, injectable so tests can be deterministic. */
  randomId: (bytes?: number) => string
}
