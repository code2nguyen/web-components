/** `graduated`: each tier's rate applies to the part of the quantity inside it. `volume`: the rate of the tier the whole quantity falls in applies to all of it. */
export type TierEditorPricing = 'graduated' | 'volume'

/** One tier: its upper bound (`null` for no limit) and its value. `from` is filled in when `tiers` is read and ignored when it is set. */
export interface TierEditorTier {
  /** The last value the tier covers; `null` on an open last tier. A bound that is not a number reads `NaN`. */
  upTo: number | null
  /** The tier's rate: a number, or the text typed (`5%`, a grade). */
  value: number | string
  /** The first value the tier covers: the bound before it plus `step`, or `start` for the first tier. */
  from?: number
}

/** One tier's share of a {@link TierEditorQuote}. */
export interface TierEditorTerm {
  /** Index of the tier in `tiers`. */
  tier: number
  /** The part of the quantity the tier's rate applies to. */
  units: number
  /** The tier's value, as in `tiers`. */
  value: number | string
}

/** What a quantity comes to over the tiers: {@link quoteTiers}, and the context of `renderPreview`. */
export interface TierEditorQuote {
  quantity: number
  pricing: TierEditorPricing
  /** Index of the tier the quantity falls in, or -1 when it is above the last bound. */
  tier: number
  /** The tiers that apply, with the quantity each one rates: every tier the quantity reaches when graduated, the one it falls in by volume. */
  terms: TierEditorTerm[]
  /** The sum of `units × rate` over the terms; `null` when the quantity falls in no tier or a rate is not a number. */
  total: number | null
}

/** A bound or a rate as a number: digits with an optional sign and decimal point; anything else is `null`. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed)) return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

/** A rate as a factor: a number, or a percentage (`5%` is 0.05). */
export function rateOf(value: number | string): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const percent = /^(.*)%$/.exec(value.trim())
  const number = parseNumber(percent ? percent[1] : value)
  return number === null ? null : percent ? number / 100 : number
}

/**
 * What `quantity` comes to over `tiers`, for `graduated` or `volume` pricing. Tier `i` covers the quantities above the
 * bound before it (`start - step` for the first) up to its own `upTo`; a tier with no bound covers the rest.
 */
export function quoteTiers(
  tiers: readonly TierEditorTier[],
  quantity: number,
  options: { pricing?: TierEditorPricing; start?: number; step?: number } = {},
): TierEditorQuote {
  const { pricing = 'graduated', start = 0, step = 0 } = options
  const terms: TierEditorTerm[] = []
  // Below the first tier's first value no tier applies.
  if (quantity < start) return { quantity, pricing, tier: -1, terms, total: null }
  let lower = start - step
  let tier = -1
  for (const [index, { upTo, value }] of tiers.entries()) {
    const upper = upTo ?? Infinity
    const units = Math.min(quantity, upper) - lower
    if (pricing === 'graduated' && units > 0) terms.push({ tier: index, units, value })
    if (quantity <= upper) {
      tier = index
      break
    }
    lower = upper
  }
  if (pricing === 'volume') terms.splice(0, terms.length, ...(tier === -1 ? [] : [{ tier, units: quantity, value: tiers[tier].value }]))
  let total: number | null = tier === -1 ? null : 0
  for (const term of terms) {
    const rate = rateOf(term.value)
    total = total === null || rate === null ? null : total + term.units * rate
  }
  return { quantity, pricing, tier, terms, total }
}
