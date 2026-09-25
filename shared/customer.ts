import { z } from 'zod'
import { checkAddressLine, checkCity, checkMobile, checkName, checkOptionalAddressLine, checkPin, checkState, normalizeMobile } from './customerRules'

// The rules themselves (and the form helpers) live in customerRules.ts, which
// has no dependencies — the browser's forms use them directly without loading
// the validation library. This file adds the schemas the SERVER enforces.
export * from './customerRules'

// ---------------------------------------------------------------- schemas

const rule = (check: (value: string) => string | null) => (value: string, ctx: z.RefinementCtx) => {
  const message = check(value)
  if (message) ctx.addIssue({ code: 'custom', message })
}

export const customerSchema = z.object({
  name: z.string().max(200).superRefine(rule(checkName)).transform((v) => v.trim().replace(/\s+/g, ' ')),
  mobile: z
    .string()
    .max(40)
    .superRefine(rule(checkMobile))
    .transform((v) => normalizeMobile(v) ?? v),
})

export const deliverySchema = z.object({
  line1: z.string().max(300).superRefine(rule(checkAddressLine)).transform((v) => v.trim().replace(/\s+/g, ' ')),
  line2: z
    .string()
    .max(300)
    .superRefine(rule(checkOptionalAddressLine))
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .optional()
    .default(''),
  city: z.string().max(200).superRefine(rule(checkCity)).transform((v) => v.trim().replace(/\s+/g, ' ')),
  state: z.string().superRefine(rule(checkState)),
  pin: z
    .string()
    .max(20)
    .superRefine(rule(checkPin))
    .transform((v) => v.replace(/\s/g, '')),
})

export type Customer = z.infer<typeof customerSchema>
export type DeliveryAddress = z.infer<typeof deliverySchema>

