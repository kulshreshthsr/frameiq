/**
 * Structured (JSON-lines) logging — one event per line, easy to grep and to
 * ship to any log tool. Lifecycle events (order.created, payment.succeeded…)
 * are logged by name with a few facts, never with payloads.
 *
 * SENSITIVE DATA NEVER REACHES THE LOG. Field names that suggest a secret are
 * replaced wholesale, mobile numbers are masked, and long free-text values
 * are cut. This runs on every event, so forgetting to redact at a call site
 * cannot leak.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogRecord {
  time: string
  level: LogLevel
  event: string
  [field: string]: unknown
}

export interface Logger {
  event(name: string, fields?: Record<string, unknown>): void
  warn(name: string, fields?: Record<string, unknown>): void
  error(name: string, fields?: Record<string, unknown>): void
}

const SECRET_KEY = /secret|signature|token|password|authorization|cookie|card|cvv|key(?!_?id)|otp/i
const MOBILE_KEY = /mobile|phone|contact/i
const ADDRESS_KEY = /^(line1|line2|address|street)$/i
const MAX_STRING = 300

export function redact(value: unknown, key = '', depth = 0): unknown {
  if (depth > 6) return '[deep]'
  if (SECRET_KEY.test(key)) return '[redacted]'
  if (ADDRESS_KEY.test(key)) return '[redacted]'
  if (typeof value === 'string') {
    if (MOBILE_KEY.test(key)) return value.length > 4 ? `${'•'.repeat(value.length - 4)}${value.slice(-4)}` : '••••'
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, key, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v, k, depth + 1)
    return out
  }
  return value
}

export function createLogger(sink: (record: LogRecord) => void, now: () => Date = () => new Date()): Logger {
  const emit = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    sink({ time: now().toISOString(), level, event, ...(redact(fields) as Record<string, unknown>) })
  }
  return {
    event: (name, fields) => emit('info', name, fields),
    warn: (name, fields) => emit('warn', name, fields),
    error: (name, fields) => emit('error', name, fields),
  }
}

/** Writes JSON lines to stdout (errors to stderr). */
export const stdoutSink = (record: LogRecord): void => {
  const line = JSON.stringify(record)
  if (record.level === 'error') console.error(line)
  else console.log(line)
}

/** For tests: collects records in memory. */
export function memoryLogger(): { logger: Logger; records: LogRecord[] } {
  const records: LogRecord[] = []
  return { logger: createLogger((r) => records.push(r)), records }
}

export const silentLogger: Logger = { event() {}, warn() {}, error() {} }
