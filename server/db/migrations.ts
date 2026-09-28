/**
 * Database schema, as an ordered list of migrations. Each runs once, inside a
 * transaction, and is recorded in `schema_migrations`. NEVER edit a migration
 * that has been applied anywhere real — add a new one instead.
 *
 * Money is always an INTEGER in minor units (paise).
 */

export interface Migration {
  id: string
  statements: string[]
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_init',
    statements: [
      // ------------------------------------------------------------ catalog
      `CREATE TABLE catalog_settings (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`,
      `CREATE TABLE catalog_glass_options (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         description TEXT NOT NULL,
         priced INTEGER NOT NULL,
         sort INTEGER NOT NULL
       )`,
      `CREATE TABLE catalog_mat_options (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         description TEXT NOT NULL,
         has_mat INTEGER NOT NULL,
         sort INTEGER NOT NULL
       )`,
      `CREATE TABLE catalog_products (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         tagline TEXT NOT NULL,
         description TEXT NOT NULL,
         style_id TEXT NOT NULL,
         active INTEGER NOT NULL,
         ships_with_mat INTEGER NOT NULL,
         moulding_note TEXT,
         production_notes TEXT,
         sort INTEGER NOT NULL
       )`,
      `CREATE TABLE catalog_sizes (
         product_id TEXT NOT NULL REFERENCES catalog_products(id),
         id TEXT NOT NULL,
         width REAL NOT NULL,
         height REAL NOT NULL,
         unit TEXT NOT NULL,
         display_label TEXT NOT NULL,
         price_minor INTEGER NOT NULL,
         glass_surcharge_minor INTEGER NOT NULL,
         mat_surcharge_minor INTEGER NOT NULL,
         sort INTEGER NOT NULL,
         PRIMARY KEY (product_id, id)
       )`,
      `CREATE TABLE catalog_product_options (
         product_id TEXT NOT NULL REFERENCES catalog_products(id),
         kind TEXT NOT NULL CHECK (kind IN ('glass', 'mat')),
         option_id TEXT NOT NULL,
         sort INTEGER NOT NULL,
         PRIMARY KEY (product_id, kind, option_id)
       )`,

      // ------------------------------------------------------------ orders
      `CREATE TABLE order_counters (
         year INTEGER PRIMARY KEY,
         last INTEGER NOT NULL
       )`,
      `CREATE TABLE orders (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         public_id TEXT NOT NULL UNIQUE,
         access_token_hash TEXT NOT NULL,
         idempotency_key TEXT NOT NULL UNIQUE,
         request_hash TEXT NOT NULL,
         customer_name TEXT NOT NULL,
         customer_mobile TEXT NOT NULL,
         delivery_json TEXT NOT NULL,
         currency TEXT NOT NULL,
         subtotal_minor INTEGER NOT NULL,
         delivery_fee_minor INTEGER NOT NULL,
         total_minor INTEGER NOT NULL,
         payment_status TEXT NOT NULL,
         order_status TEXT NOT NULL,
         catalog_version TEXT NOT NULL,
         snapshot_json TEXT NOT NULL,
         snapshot_digest TEXT NOT NULL,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         paid_at TEXT,
         cancelled_at TEXT,
         package_path TEXT,
         package_generated_at TEXT
       )`,
      // A denormalised copy of what was bought, at the price it was bought at.
      // Deliberately NOT a reference into the catalog: catalog edits must never
      // rewrite history.
      `CREATE TABLE order_items (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         order_id INTEGER NOT NULL REFERENCES orders(id),
         position INTEGER NOT NULL,
         product_id TEXT NOT NULL,
         product_name TEXT NOT NULL,
         style_id TEXT NOT NULL,
         size_id TEXT NOT NULL,
         size_label TEXT NOT NULL,
         width REAL NOT NULL,
         height REAL NOT NULL,
         unit TEXT NOT NULL,
         glass_id TEXT NOT NULL,
         glass_name TEXT NOT NULL,
         mat_id TEXT NOT NULL,
         mat_name TEXT NOT NULL,
         quantity INTEGER NOT NULL,
         unit_price_minor INTEGER NOT NULL,
         line_total_minor INTEGER NOT NULL,
         frame_numbers TEXT NOT NULL
       )`,
      `CREATE INDEX idx_order_items_order ON order_items(order_id)`,

      // ------------------------------------------------------------ uploads
      `CREATE TABLE uploads (
         id TEXT PRIMARY KEY,
         sha256 TEXT NOT NULL,
         mime TEXT NOT NULL,
         bytes INTEGER NOT NULL,
         width INTEGER NOT NULL,
         height INTEGER NOT NULL,
         storage_key TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`,
      `CREATE TABLE order_uploads (
         order_id INTEGER NOT NULL REFERENCES orders(id),
         role TEXT NOT NULL CHECK (role IN ('wall', 'preview', 'photo')),
         asset_id TEXT NOT NULL,
         upload_id TEXT NOT NULL REFERENCES uploads(id),
         PRIMARY KEY (order_id, role, asset_id)
       )`,

      // ------------------------------------------------------------ payments
      `CREATE TABLE payments (
         id TEXT PRIMARY KEY,
         order_id INTEGER NOT NULL REFERENCES orders(id),
         provider TEXT NOT NULL,
         provider_order_id TEXT NOT NULL,
         provider_payment_id TEXT,
         status TEXT NOT NULL,
         amount_minor INTEGER NOT NULL,
         currency TEXT NOT NULL,
         client_payload_json TEXT NOT NULL DEFAULT '{}',
         failure_reason TEXT,
         flag TEXT,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         UNIQUE (provider, provider_order_id)
       )`,
      `CREATE INDEX idx_payments_order ON payments(order_id)`,
      // One row per provider event ever received. The UNIQUE key is what makes
      // a replayed webhook a no-op.
      `CREATE TABLE payment_events (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         provider TEXT NOT NULL,
         event_id TEXT NOT NULL,
         type TEXT NOT NULL,
         payload_hash TEXT NOT NULL,
         outcome TEXT NOT NULL,
         received_at TEXT NOT NULL,
         UNIQUE (provider, event_id)
       )`,

      // ------------------------------------------------------------ messaging
      // Messages to send about an order. The order is the source of truth; a
      // channel like WhatsApp only ever consumes this queue.
      `CREATE TABLE notification_outbox (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         order_id INTEGER NOT NULL REFERENCES orders(id),
         channel TEXT NOT NULL,
         template TEXT NOT NULL,
         payload_json TEXT NOT NULL,
         status TEXT NOT NULL,
         attempts INTEGER NOT NULL DEFAULT 0,
         last_error TEXT,
         created_at TEXT NOT NULL,
         sent_at TEXT,
         UNIQUE (order_id, channel, template)
       )`,
    ],
  },
  {
    // Owner admin: accounts, sessions, per-row catalog versioning (for
    // optimistic concurrency) and a size-level active flag, and the audit
    // trail every price/product change is written to.
    id: '002_admin',
    statements: [
      `ALTER TABLE catalog_products ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE catalog_products ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'`,
      `ALTER TABLE catalog_sizes ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE catalog_sizes ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE catalog_sizes ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'`,

      `CREATE TABLE users (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         email TEXT NOT NULL UNIQUE,
         password_hash TEXT NOT NULL,
         role TEXT NOT NULL,
         active INTEGER NOT NULL DEFAULT 1,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         last_login_at TEXT
       )`,
      `CREATE TABLE admin_sessions (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL REFERENCES users(id),
         token_hash TEXT NOT NULL UNIQUE,
         created_at TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         last_seen_at TEXT NOT NULL
       )`,
      `CREATE INDEX idx_admin_sessions_user ON admin_sessions(user_id)`,
      // Every product/size field or price change, permanently. Deliberately
      // append-only: a "revert" adds another row rather than erasing history.
      `CREATE TABLE catalog_audit_log (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         batch_id TEXT NOT NULL,
         actor_user_id TEXT NOT NULL,
         actor_name TEXT NOT NULL,
         action TEXT NOT NULL,
         product_id TEXT NOT NULL,
         product_size_id TEXT,
         field TEXT NOT NULL,
         old_value TEXT,
         new_value TEXT,
         old_price_minor INTEGER,
         new_price_minor INTEGER,
         note TEXT,
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX idx_catalog_audit_product ON catalog_audit_log(product_id, product_size_id, created_at)`,
      `CREATE INDEX idx_catalog_audit_batch ON catalog_audit_log(batch_id)`,
    ],
  },
]
