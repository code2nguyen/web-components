/** Card brands and the number rules each follows. Pure functions, no DOM, so they are easy to test. */

export type CardBrandId = 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb' | 'unionpay' | 'maestro'

export interface CardBrand {
  id: CardBrandId
  /** The brand's name, shown on the badge and announced. A proper noun, so it is not translated. */
  name: string
  /** Matches the first digits of its numbers (IIN ranges). */
  pattern: RegExp
  /** The lengths a number can have, the usual one first. */
  lengths: number[]
  /** Where the spaces go, as digit counts before each. */
  gaps: number[]
  /** Digits in the security code. */
  cvcLength: number
  /** Whether numbers pass the Luhn check (some UnionPay cards do not). */
  luhn: boolean
}

/** In matching order: the narrower ranges come before the wider ones they overlap. */
export const cardBrands: CardBrand[] = [
  { id: 'amex', name: 'American Express', pattern: /^3[47]/, lengths: [15], gaps: [4, 10], cvcLength: 4, luhn: true },
  { id: 'diners', name: 'Diners Club', pattern: /^(36|38|30[0-59])/, lengths: [14, 16, 19], gaps: [4, 10], cvcLength: 3, luhn: true },
  { id: 'jcb', name: 'JCB', pattern: /^35(2[89]|[3-8])/, lengths: [16, 17, 18, 19], gaps: [4, 8, 12], cvcLength: 3, luhn: true },
  {
    id: 'discover',
    name: 'Discover',
    pattern: /^(6011|64[4-9]|65|622(12[6-9]|1[3-9]|[2-8]|9[01]|92[0-5]))/,
    lengths: [16, 19],
    gaps: [4, 8, 12],
    cvcLength: 3,
    luhn: true,
  },
  { id: 'unionpay', name: 'UnionPay', pattern: /^(62|81)/, lengths: [16, 17, 18, 19], gaps: [4, 8, 12], cvcLength: 3, luhn: false },
  {
    id: 'maestro',
    name: 'Maestro',
    pattern: /^(5018|5020|5038|5893|6304|6759|676[1-3])/,
    lengths: [16, 12, 13, 14, 15, 17, 18, 19],
    gaps: [4, 8, 12],
    cvcLength: 3,
    luhn: true,
  },
  { id: 'mastercard', name: 'Mastercard', pattern: /^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/, lengths: [16], gaps: [4, 8, 12], cvcLength: 3, luhn: true },
  { id: 'visa', name: 'Visa', pattern: /^4/, lengths: [16, 13, 19], gaps: [4, 8, 12], cvcLength: 3, luhn: true },
]

/** Rules for a number whose brand is not known yet. */
export const unknownBrand: Omit<CardBrand, 'id' | 'name' | 'pattern'> = {
  lengths: [16, 12, 13, 14, 15, 17, 18, 19],
  gaps: [4, 8, 12],
  cvcLength: 3,
  luhn: true,
}

export function detectBrand(digits: string): CardBrand | undefined {
  return digits ? cardBrands.find((brand) => brand.pattern.test(digits)) : undefined
}

export function luhn(digits: string): boolean {
  let sum = 0
  for (let at = 0; at < digits.length; at++) {
    let digit = Number(digits[digits.length - 1 - at])
    if (at % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return digits.length > 0 && sum % 10 === 0
}

/** The digits with spaces at the brand's gaps ("4242 4242 4242 4242", "3782 822463 10005"). */
export function formatNumber(digits: string, gaps: number[]): string {
  let out = ''
  for (let at = 0; at < digits.length; at++) {
    if (gaps.includes(at)) out += ' '
    out += digits[at]
  }
  return out
}

/** "MMYY" digits as typed so far, shown as "MM / YY" once the year starts. */
export function formatExpiry(digits: string): string {
  return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits
}

/** Expiry digits after a keystroke: a first digit above 1 can only be a month of its own ("4" is "04"). */
export function normalizeExpiry(digits: string): string {
  const fixed = /^[2-9]/.test(digits) ? `0${digits}` : digits
  return fixed.slice(0, 4)
}

export type NumberState = 'empty' | 'incomplete' | 'invalid' | 'complete'

export function numberState(digits: string): NumberState {
  if (!digits) return 'empty'
  const brand = detectBrand(digits)
  const rules = brand ?? unknownBrand
  const longest = Math.max(...rules.lengths)
  if (digits.length > longest) return 'invalid'
  if (!rules.lengths.includes(digits.length)) return 'incomplete'
  // A failed check at the usual length or longer is a typo; at a shorter valid length the number may still grow.
  if (rules.luhn && !luhn(digits)) return digits.length < rules.lengths[0] ? 'incomplete' : 'invalid'
  return 'complete'
}

export type ExpiryState = 'empty' | 'incomplete' | 'invalid' | 'past' | 'complete'

/** The state of "MMYY" digits against the month `now` falls in (local time). */
export function expiryState(digits: string, now = new Date()): ExpiryState {
  if (!digits) return 'empty'
  if (digits.length < 4) return 'incomplete'
  const month = Number(digits.slice(0, 2))
  if (month < 1 || month > 12) return 'invalid'
  const year = 2000 + Number(digits.slice(2))
  const current = now.getFullYear() * 12 + now.getMonth()
  return year * 12 + month - 1 < current ? 'past' : 'complete'
}
