import type { Cents } from './types.ts'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const plain = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `$12,500.00`, `-$15.00`. */
export function formatMoney(cents: Cents): string {
  return usd.format(cents / 100)
}

/** `12,500.00` with no symbol, for aligned columns of text. */
export function formatAmount(cents: Cents): string {
  return plain.format(cents / 100)
}

/** `+$18.37` / `-$45.00`, for a change rather than a balance. */
export function formatSigned(cents: Cents): string {
  return cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents)
}

export function sum(values: Iterable<Cents>): Cents {
  let total = 0
  for (const value of values) total += value
  return total
}

/** Cents to the decimal number a spreadsheet cell holds, and back. */
export const toDollars = (cents: Cents): number => cents / 100
export const toCents = (dollars: number): Cents => Math.round(dollars * 100)
