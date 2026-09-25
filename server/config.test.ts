// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.ts'

const production = {
  FRAMENGINE_ENV: 'production',
  DATABASE_URL: 'file:/var/lib/framengine/db.sqlite',
  PUBLIC_BASE_URL: 'https://frames.example.com',
  PAYMENT_PROVIDER: 'razorpay',
  RAZORPAY_KEY_ID: 'rzp_live_x',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsec',
}

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    loadConfig(source)
    return []
  } catch (error) {
    if (error instanceof ConfigError) return error.problems
    throw error
  }
}

describe('development and test defaults', () => {
  it('development works with no configuration at all, using the sandbox', () => {
    const config = loadConfig({})
    expect(config.env).toBe('development')
    expect(config.payment.provider).toBe('sandbox')
    expect(config.databaseUrl).toMatch(/^file:/)
    expect(config.rateLimit.enabled).toBe(true)
  })

  it('test uses an in-memory database and no rate limit by default', () => {
    const config = loadConfig({ FRAMENGINE_ENV: 'test' })
    expect(config.databaseUrl).toBe('file::memory:')
    expect(config.rateLimit.enabled).toBe(false)
  })

  it('NODE_ENV is honoured when FRAMENGINE_ENV is unset', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).env).toBe('test')
  })
})

describe('production refuses to start unsafely', () => {
  it('accepts a complete Razorpay configuration', () => {
    const config = loadConfig(production)
    expect(config.env).toBe('production')
    expect(config.payment).toMatchObject({ provider: 'razorpay', keyId: 'rzp_live_x' })
    expect(config.staticDir).toBe('./dist')
    expect(config.host).toBe('0.0.0.0')
  })

  it('will not run with the sandbox payment provider — no pretend payments in production', () => {
    expect(problemsFor({ ...production, PAYMENT_PROVIDER: 'sandbox' }).join()).toMatch(/sandbox is not allowed in production/)
  })

  it('will not run with no payment provider chosen', () => {
    expect(problemsFor({ ...production, PAYMENT_PROVIDER: undefined }).join()).toMatch(/PAYMENT_PROVIDER/)
  })

  it.each(['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'])('requires %s', (name) => {
    expect(problemsFor({ ...production, [name]: undefined }).join()).toContain(name)
  })

  it('requires a database, and https', () => {
    expect(problemsFor({ ...production, DATABASE_URL: undefined }).join()).toMatch(/DATABASE_URL/)
    expect(problemsFor({ ...production, PUBLIC_BASE_URL: 'http://frames.example.com' }).join()).toMatch(/https/)
    expect(problemsFor({ ...production, PUBLIC_BASE_URL: undefined }).join()).toMatch(/PUBLIC_BASE_URL/)
  })

  it('lists every problem at once, not one at a time', () => {
    const problems = problemsFor({ FRAMENGINE_ENV: 'production' })
    expect(problems.length).toBeGreaterThanOrEqual(3)
  })
})

describe('validation of other settings', () => {
  it('rejects a nonsense port or upload limit', () => {
    expect(problemsFor({ PORT: 'abc' }).join()).toMatch(/PORT/)
    expect(problemsFor({ MAX_UPLOAD_BYTES: '-5' }).join()).toMatch(/MAX_UPLOAD_BYTES/)
  })

  it('rejects an unknown payment provider', () => {
    expect(problemsFor({ PAYMENT_PROVIDER: 'paypal' }).join()).toMatch(/must be "razorpay" or "sandbox"/)
  })

  it('normalises the WhatsApp number to digits and rejects nonsense', () => {
    expect(loadConfig({ WHATSAPP_NUMBER: '+91 98765-43210' }).whatsappNumber).toBe('919876543210')
    expect(loadConfig({}).whatsappNumber).toBeNull()
    expect(problemsFor({ WHATSAPP_NUMBER: '123' }).join()).toMatch(/WHATSAPP_NUMBER/)
  })

  it('parses allowed origins', () => {
    expect(loadConfig({ CORS_ORIGINS: 'https://a.com, https://b.com' }).corsOrigins).toEqual(['https://a.com', 'https://b.com'])
  })
})
