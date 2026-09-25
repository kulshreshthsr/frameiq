/**
 * Server configuration, read from environment variables.
 *
 * Three environments — development, test, production — with safe defaults for
 * the first two and NO defaults for anything secret in production: if the
 * production configuration is incomplete or unsafe (for example, still using
 * the sandbox payment provider), the server refuses to start and says exactly
 * what is wrong. It cannot quietly run with pretend payments.
 */

export type EnvName = 'development' | 'test' | 'production'

export type PaymentConfig =
  | { provider: 'sandbox'; sandboxSecret: string }
  | { provider: 'razorpay'; keyId: string; keySecret: string; webhookSecret: string }

export interface Config {
  env: EnvName
  port: number
  host: string
  /** libsql URL: `file:./data/x.db` for a local file, `file::memory:` for tests. */
  databaseUrl: string
  uploadsDir: string
  packagesDir: string
  /** Directory of the built frontend to serve, or null to serve only the API. */
  staticDir: string | null
  /** Public origin of the site, used in links (https in production). */
  publicBaseUrl: string
  payment: PaymentConfig
  /** Business WhatsApp number in international digits (no +), if set. */
  whatsappNumber: string | null
  maxUploadBytes: number
  rateLimit: { enabled: boolean; windowMs: number; max: number; uploadMax: number }
  /** Allowed browser origins for cross-origin calls. Same-origin needs none. */
  corsOrigins: string[]
}

export class ConfigError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`Invalid server configuration:\n - ${problems.join('\n - ')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

type Source = Record<string, string | undefined>

const int = (value: string | undefined, fallback: number) => {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : NaN
}

function resolveEnv(source: Source): EnvName {
  const raw = source.FRAMENGINE_ENV ?? source.NODE_ENV
  return raw === 'production' || raw === 'test' ? raw : 'development'
}

export function loadConfig(source: Source = process.env): Config {
  const env = resolveEnv(source)
  const problems: string[] = []
  const isProd = env === 'production'

  const port = int(source.PORT, 8787)
  if (Number.isNaN(port)) problems.push('PORT must be a positive whole number')

  const maxUploadBytes = int(source.MAX_UPLOAD_BYTES, 45 * 1024 * 1024)
  if (Number.isNaN(maxUploadBytes)) problems.push('MAX_UPLOAD_BYTES must be a positive whole number')

  const databaseUrl = source.DATABASE_URL ?? (isProd ? '' : env === 'test' ? 'file::memory:' : 'file:./data/framengine.db')
  if (!databaseUrl) problems.push('DATABASE_URL is required in production')

  const provider = (source.PAYMENT_PROVIDER ?? (isProd ? '' : 'sandbox')).toLowerCase()
  let payment: PaymentConfig = { provider: 'sandbox', sandboxSecret: source.SANDBOX_WEBHOOK_SECRET ?? 'dev-sandbox-secret-not-for-production' }

  if (provider === 'razorpay') {
    const keyId = source.RAZORPAY_KEY_ID ?? ''
    const keySecret = source.RAZORPAY_KEY_SECRET ?? ''
    const webhookSecret = source.RAZORPAY_WEBHOOK_SECRET ?? ''
    if (!keyId) problems.push('RAZORPAY_KEY_ID is required when PAYMENT_PROVIDER=razorpay')
    if (!keySecret) problems.push('RAZORPAY_KEY_SECRET is required when PAYMENT_PROVIDER=razorpay')
    if (!webhookSecret) problems.push('RAZORPAY_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=razorpay')
    payment = { provider: 'razorpay', keyId, keySecret, webhookSecret }
  } else if (provider === 'sandbox') {
    if (isProd) problems.push('PAYMENT_PROVIDER=sandbox is not allowed in production — no real money would move')
  } else if (isProd || provider !== '') {
    problems.push(`PAYMENT_PROVIDER must be "razorpay" or "sandbox" (got "${provider}")`)
  }

  const publicBaseUrl = (source.PUBLIC_BASE_URL ?? (isProd ? '' : `http://localhost:${Number.isNaN(port) ? 8787 : port}`)).replace(/\/$/, '')
  if (!publicBaseUrl) problems.push('PUBLIC_BASE_URL is required in production')
  else if (isProd && !publicBaseUrl.startsWith('https://')) problems.push('PUBLIC_BASE_URL must be https:// in production')

  const whatsapp = (source.WHATSAPP_NUMBER ?? '').replace(/[^\d]/g, '')
  if (source.WHATSAPP_NUMBER && (whatsapp.length < 8 || whatsapp.length > 15)) problems.push('WHATSAPP_NUMBER must be an international number, digits only')

  if (problems.length > 0) throw new ConfigError(problems)

  return {
    env,
    port,
    host: source.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1'),
    databaseUrl,
    uploadsDir: source.UPLOADS_DIR ?? (env === 'test' ? './data/test-uploads' : './data/uploads'),
    packagesDir: source.PACKAGES_DIR ?? (env === 'test' ? './data/test-packages' : './data/packages'),
    staticDir: source.STATIC_DIR === undefined ? (isProd ? './dist' : null) : source.STATIC_DIR === '' ? null : source.STATIC_DIR,
    publicBaseUrl,
    payment,
    whatsappNumber: whatsapp || null,
    maxUploadBytes,
    rateLimit: {
      enabled: source.RATE_LIMIT === undefined ? env !== 'test' : source.RATE_LIMIT === 'on',
      windowMs: 60_000,
      max: int(source.RATE_LIMIT_MAX, 60),
      uploadMax: int(source.RATE_LIMIT_UPLOAD_MAX, 80),
    },
    corsOrigins: (source.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  }
}
