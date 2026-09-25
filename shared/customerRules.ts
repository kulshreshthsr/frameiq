/**
 * What we ask a customer for, and how we check it. Only what is operationally
 * necessary to deliver a frame: a name, a way to reach them, and an address.
 *
 * Each rule is a plain function returning a customer-facing message (or null
 * if the value is fine), so the form can show it beside the field as they
 * type and the server can enforce the very same rule. "Robust but not
 * hostile": generous about formatting (spaces, dashes, +91), strict only
 * about what would make delivery fail.
 */

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const

export type IndianState = (typeof INDIAN_STATES)[number]

/**
 * Turns however a customer typed their mobile number into "+91XXXXXXXXXX", or
 * null if it isn't a valid Indian mobile number. Accepts spaces, dashes,
 * brackets, a leading 0, 91 or +91.
 */
export function normalizeMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (!/^\d+$/.test(digits)) return null
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}

export function checkName(value: string): string | null {
  const v = value.trim()
  if (v.length < 2) return 'Please enter your name.'
  if (v.length > 80) return 'That name is a bit long — please shorten it.'
  return null
}

export function checkMobile(value: string): string | null {
  if (value.trim() === '') return 'Please enter your mobile number.'
  return normalizeMobile(value) ? null : 'Enter a 10-digit mobile number, like 98765 43210.'
}

export function checkAddressLine(value: string): string | null {
  const v = value.trim()
  if (v.length < 5) return 'Please enter your house/flat number and street.'
  if (v.length > 120) return 'That line is a bit long — please shorten it.'
  return null
}

export function checkOptionalAddressLine(value: string): string | null {
  return value.trim().length > 120 ? 'That line is a bit long — please shorten it.' : null
}

export function checkCity(value: string): string | null {
  const v = value.trim()
  if (v.length < 2) return 'Please enter your city or town.'
  if (v.length > 60) return 'That name is a bit long — please shorten it.'
  return null
}

export function checkState(value: string): string | null {
  return (INDIAN_STATES as readonly string[]).includes(value) ? null : 'Please choose your state.'
}

/** Indian PIN codes are six digits and never start with 0. */
export function checkPin(value: string): string | null {
  const v = value.replace(/\s/g, '')
  if (v === '') return 'Please enter your PIN code.'
  return /^[1-9]\d{5}$/.test(v) ? null : 'A PIN code is 6 digits, like 560001.'
}

/** What the form holds while the customer is typing (raw strings). */
export interface CustomerForm {
  name: string
  mobile: string
}
export interface DeliveryForm {
  line1: string
  line2: string
  city: string
  state: string
  pin: string
}

export function emptyCustomerForm(): CustomerForm {
  return { name: '', mobile: '' }
}
export function emptyDeliveryForm(): DeliveryForm {
  return { line1: '', line2: '', city: '', state: '', pin: '' }
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>

export function validateCustomerForm(form: CustomerForm): FieldErrors<CustomerForm> {
  const errors: FieldErrors<CustomerForm> = {}
  const name = checkName(form.name)
  const mobile = checkMobile(form.mobile)
  if (name) errors.name = name
  if (mobile) errors.mobile = mobile
  return errors
}

export function validateDeliveryForm(form: DeliveryForm): FieldErrors<DeliveryForm> {
  const errors: FieldErrors<DeliveryForm> = {}
  const line1 = checkAddressLine(form.line1)
  const line2 = checkOptionalAddressLine(form.line2)
  const city = checkCity(form.city)
  const state = checkState(form.state)
  const pin = checkPin(form.pin)
  if (line1) errors.line1 = line1
  if (line2) errors.line2 = line2
  if (city) errors.city = city
  if (state) errors.state = state
  if (pin) errors.pin = pin
  return errors
}

/** Masks a mobile number for logs and lists: +91 ••••• ••210. */
export function maskMobile(mobile: string): string {
  return mobile.length > 4 ? `${'•'.repeat(mobile.length - 4)}${mobile.slice(-4)}` : '••••'
}
