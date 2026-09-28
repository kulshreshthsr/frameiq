// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { memoryLogger, redact } from './log.ts'

describe('logging never leaks sensitive data', () => {
  it('redacts anything that looks like a secret, by field name', () => {
    const out = redact({ razorpay_signature: 'abc', keySecret: 'shh', accessToken: 'tok', password: 'p', authorization: 'Bearer x', apiKey: 'k', cardNumber: '4111' }) as Record<string, unknown>
    for (const value of Object.values(out)) expect(value).toBe('[redacted]')
  })

  it('but keeps a public key id, which is not a secret', () => {
    expect((redact({ keyId: 'rzp_test_123' }) as Record<string, unknown>).keyId).toBe('rzp_test_123')
  })

  it('masks mobile numbers, keeping the last four digits', () => {
    const out = redact({ mobile: '+919876543210', phone: '9876543210', contact: '+911234567890' }) as Record<string, string>
    expect(out.mobile).toMatch(/^•+3210$/)
    expect(out.mobile).not.toContain('9876')
    expect(out.phone).toMatch(/3210$/)
  })

  it('hides street addresses', () => {
    expect((redact({ line1: '12 MG Road', line2: 'Flat 4', address: 'x' }) as Record<string, string>).line1).toBe('[redacted]')
  })

  it('redacts inside nested objects and arrays', () => {
    const out = redact({ order: { customer: { mobile: '9876543210' }, events: [{ signature: 's' }] } }) as any
    expect(out.order.customer.mobile).toMatch(/3210$/)
    expect(out.order.customer.mobile).not.toContain('9876')
    expect(out.order.events[0].signature).toBe('[redacted]')
  })

  it('cuts very long text so a payload can’t flood the log', () => {
    expect(String(redact({ note: 'x'.repeat(5000) }, 'note') as string).length).toBeLessThan(400)
  })

  it('cannot recurse forever on a deep or cyclic-looking structure', () => {
    let deep: Record<string, unknown> = {}
    const root = deep
    for (let i = 0; i < 50; i++) {
      deep.next = {}
      deep = deep.next as Record<string, unknown>
    }
    expect(() => redact(root)).not.toThrow()
  })

  it('applies redaction to every event automatically', () => {
    const { logger, records } = memoryLogger()
    logger.event('payment.test', { publicOrderId: 'FRM-1', razorpay_signature: 'secret-sig', mobile: '9876543210' })
    const line = JSON.stringify(records[0])
    expect(line).not.toContain('secret-sig')
    expect(line).not.toContain('98765')
    expect(records[0]).toMatchObject({ event: 'payment.test', level: 'info', publicOrderId: 'FRM-1' })
  })

  it('records levels, an event name and a timestamp', () => {
    const { logger, records } = memoryLogger()
    logger.warn('a')
    logger.error('b')
    expect(records.map((r) => r.level)).toEqual(['warn', 'error'])
    expect(records[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
