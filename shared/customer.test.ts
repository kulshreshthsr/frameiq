import { describe, expect, it } from 'vitest'
import {
  INDIAN_STATES,
  checkAddressLine,
  checkCity,
  checkMobile,
  checkName,
  checkPin,
  checkState,
  customerSchema,
  deliverySchema,
  maskMobile,
  normalizeMobile,
  validateCustomerForm,
  validateDeliveryForm,
} from './customer'

describe('normalizeMobile — generous about how it is typed', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['98765-43210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+919876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['(98765) 43210', '+919876543210'],
    ['  9876543210  ', '+919876543210'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected)
  })

  it.each(['', '12345', '5876543210', '98765432', '98765432101', 'abcdefghij', '+1 415 555 2671', '98765 4321a', '0000000000'])('rejects %s', (input) => {
    expect(normalizeMobile(input)).toBeNull()
  })

  it('never lets two spellings of one number look different', () => {
    expect(normalizeMobile('98765 43210')).toBe(normalizeMobile('+91-9876543210'))
  })
})

describe('field rules give a helpful message, or nothing', () => {
  it('name', () => {
    expect(checkName('')).toMatch(/name/i)
    expect(checkName('A')).toMatch(/name/i)
    expect(checkName('Asha')).toBeNull()
    expect(checkName('  Asha Rao  ')).toBeNull()
    expect(checkName('x'.repeat(81))).toMatch(/long/)
  })

  it('mobile', () => {
    expect(checkMobile('')).toMatch(/enter your mobile/i)
    expect(checkMobile('123')).toMatch(/10-digit/)
    expect(checkMobile('9876543210')).toBeNull()
  })

  it('address line, city, state', () => {
    expect(checkAddressLine('12')).toMatch(/street/i)
    expect(checkAddressLine('12 MG Road')).toBeNull()
    expect(checkCity('B')).toMatch(/city/i)
    expect(checkCity('Bengaluru')).toBeNull()
    expect(checkState('')).toMatch(/state/i)
    expect(checkState('Atlantis')).toMatch(/state/i)
    expect(checkState('Karnataka')).toBeNull()
  })

  it.each(['560001', '110001', '400 001', '999999'])('accepts PIN %s', (pin) => {
    expect(checkPin(pin)).toBeNull()
  })

  it.each(['', '12345', '1234567', '060001', 'abcdef', '56000a'])('rejects PIN "%s"', (pin) => {
    expect(checkPin(pin)).not.toBeNull()
  })

  it('every state in the list is accepted, and the list has all 36 states and UTs', () => {
    expect(INDIAN_STATES).toHaveLength(36)
    for (const state of INDIAN_STATES) expect(checkState(state)).toBeNull()
  })
})

describe('customerSchema / deliverySchema (what the server enforces)', () => {
  it('cleans and normalises what it accepts', () => {
    const customer = customerSchema.parse({ name: '  Asha   Rao ', mobile: '98765 43210' })
    expect(customer).toEqual({ name: 'Asha Rao', mobile: '+919876543210' })
    const delivery = deliverySchema.parse({ line1: '12  MG Road', city: ' Bengaluru ', state: 'Karnataka', pin: '560 038' })
    expect(delivery).toEqual({ line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pin: '560038' })
  })

  it('reports the same customer-facing messages the form shows', () => {
    const result = customerSchema.safeParse({ name: '', mobile: '12' })
    expect(result.success).toBe(false)
    const messages = result.error!.issues.map((i) => i.message)
    expect(messages).toContain(checkName('')!)
    expect(messages).toContain(checkMobile('12')!)
  })

  it('rejects an unknown state and a bad PIN', () => {
    expect(deliverySchema.safeParse({ line1: '12 MG Road', city: 'X City', state: 'Nowhere', pin: '560038' }).success).toBe(false)
    expect(deliverySchema.safeParse({ line1: '12 MG Road', city: 'X City', state: 'Karnataka', pin: '5600' }).success).toBe(false)
  })

  it('bounds absurdly long input', () => {
    expect(customerSchema.safeParse({ name: 'x'.repeat(500), mobile: '9876543210' }).success).toBe(false)
  })
})

describe('form validation', () => {
  it('returns no errors for a good form and one per bad field otherwise', () => {
    expect(validateCustomerForm({ name: 'Asha Rao', mobile: '9876543210' })).toEqual({})
    expect(Object.keys(validateCustomerForm({ name: '', mobile: '' }))).toEqual(['name', 'mobile'])
    expect(validateDeliveryForm({ line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pin: '560038' })).toEqual({})
    expect(Object.keys(validateDeliveryForm({ line1: '', line2: '', city: '', state: '', pin: '' }))).toEqual(['line1', 'city', 'state', 'pin'])
  })

  it('address line 2 is optional', () => {
    expect(validateDeliveryForm({ line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pin: '560038' }).line2).toBeUndefined()
  })
})

describe('maskMobile', () => {
  it('shows only the last four digits', () => {
    expect(maskMobile('+919876543210')).toMatch(/^•+3210$/)
    expect(maskMobile('123')).toBe('••••')
  })
})
