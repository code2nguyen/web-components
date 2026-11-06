/**
 * The bullet chart's arithmetic: bands, scales, ticks and the band a value falls in. Free of the DOM, so the specs can
 * check it as plain numbers.
 */

/** Which end of the scale is good: `higher` (the default) puts the good band at the top of the scale, `lower` near zero. */
export type BulletBetter = 'higher' | 'lower'

/** Most bands a row draws: past the scale start (and up to its end), boundaries after the fifth are left out. */
export const MAX_BANDS = 5

/** One qualitative band of a row, from `from` to `to` on the row's scale. */
export interface BulletBand {
  from: number
  to: number
  /** How good the band is, `0` for the poorest. With `better="lower"` the band nearest the start is the best. */
  quality: number
}

/** One row as the chart reads it from the data. */
export interface BulletRowInput {
  label: string
  description: string
  value: number | null
  target: number | null
  /** The band boundaries, ascending, as {@link bandBoundaries} reads them. */
  bands: number[]
  /** The row's own scale end, from `max-field`, or `null` to work it out. */
  max: number | null
  /** The row's own bar colour, from `color-field`. */
  color?: string
}

/** One bullet, as the tooltip, the table, the events and `rows` describe it. */
export interface BulletRow {
  /** The row's position in `data`. */
  index: number
  label: string
  description: string
  value: number | null
  target: number | null
  bands: BulletBand[]
  /** Where the row's scale starts and ends. */
  min: number
  max: number
  /** The index in `bands` of the band the value falls in, or `-1` without a value or bands. */
  band: number
  /** `value / target`, or `null` without both (or with a zero target). */
  attainment: number | null
  /** Whether the value meets the target: at or above it, or at or below it with `better="lower"`. `null` without both. */
  onTarget: boolean | null
  color?: string
}

/** The options {@link buildBulletRows} reads besides the rows. */
export interface BulletOptions {
  /** Where every scale starts. */
  min: number
  /** The scale end for every row without its own, or `undefined` to work it out from the row. */
  max?: number
  /** `row` gives each row its own scale; `shared` puts every row on the widest one. */
  scale: 'row' | 'shared'
  better: BulletBetter
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * The band boundaries a row or the `bands` attribute carries: an array of numbers, a JSON array, or a comma list.
 * Anything that is not a finite number is left out; the rest are sorted ascending without repeats. They are capped at
 * five only once the row's scale is known ({@link visibleBoundaries}), so boundaries under the start do not use up the five.
 */
export function bandBoundaries(raw: unknown): number[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return []
    try {
      list = text.startsWith('[') ? JSON.parse(text) : text.split(',')
    } catch {
      list = text.replace(/^\[|\]$/g, '').split(',')
    }
  }
  if (!Array.isArray(list)) return []
  const numbers = list.map((item) => (typeof item === 'string' && item.trim() !== '' ? Number(item) : item)).filter(finite)
  return [...new Set(numbers)].sort((a, b) => a - b)
}

/**
 * The boundaries a row on `[min, max]` draws: those past the start, up to the first at or past the end (the band
 * that reaches the end), at most five.
 */
export function visibleBoundaries(boundaries: readonly number[], min: number, max: number): number[] {
  const past = boundaries.filter((boundary) => boundary > min)
  const end = past.findIndex((boundary) => boundary >= max)
  return (end === -1 ? past : past.slice(0, end + 1)).slice(0, MAX_BANDS)
}

/** How good band `index` of `count` is, `0` for the poorest: the order of the bands, reversed with `better="lower"`. */
export function bandQuality(index: number, count: number, better: BulletBetter): number {
  return better === 'lower' ? count - 1 - index : index
}

/** Where a row's scale ends without an override: the largest of its last band, its value and its target. */
export function naturalMax(input: Pick<BulletRowInput, 'bands' | 'value' | 'target'>, min: number): number {
  const candidates = [input.bands[input.bands.length - 1], input.value, input.target].filter(finite)
  const end = candidates.length > 0 ? Math.max(...candidates) : min + 1
  return end > min ? end : min + 1
}

/** The band a value falls in: the first whose end it does not pass, the last when it is past them all, the first below the start. */
export function bandIndex(bands: readonly BulletBand[], value: number | null): number {
  if (value === null || bands.length === 0) return -1
  const at = bands.findIndex((band) => value <= band.to)
  return at === -1 ? bands.length - 1 : at
}

/** Turns the rows read from the data into bullets: bands from the scale start, scales, bands and attainment. */
export function buildBulletRows(inputs: readonly BulletRowInput[], options: BulletOptions): BulletRow[] {
  const min = finite(options.min) ? options.min : 0
  const ends = inputs.map((input) => {
    const own = input.max ?? (finite(options.max) ? options.max : null)
    return own !== null && own > min ? own : naturalMax(input, min)
  })
  const shared = Math.max(min + 1, ...ends)
  return inputs.map((input, index) => {
    const max = options.scale === 'shared' ? shared : ends[index]
    const boundaries = visibleBoundaries(input.bands, min, max)
    // The last band reaches the scale end: a value, target or `max` past the last boundary extends it, and a boundary
    // past the end is cut there.
    const bands: BulletBand[] = boundaries.map((to, at) => ({
      from: at === 0 ? min : boundaries[at - 1],
      to: at === boundaries.length - 1 ? max : Math.min(to, max),
      quality: bandQuality(at, boundaries.length, options.better),
    }))
    const { value, target } = input
    const attainment = value !== null && target !== null && target !== 0 ? value / target : null
    const onTarget = value === null || target === null ? null : options.better === 'lower' ? value <= target : value >= target
    return {
      index,
      label: input.label,
      description: input.description,
      value,
      target,
      bands,
      min,
      max,
      band: bandIndex(bands, value),
      attainment,
      onTarget,
      color: input.color,
    }
  })
}

/** Most ticks a row's axis draws, whatever it is asked for. */
const MAX_TICKS = 12

/**
 * Round tick values across `[min, max]`: the finest step of 1, 2, 2.5 or 5 times a power of ten that gives at most
 * `target + 1` ticks. The ends are ticks whenever they are on a step, so `0` and a round scale end are labelled. A span
 * too small for its offset to step through in safe integers (`1e12` to `1e12 + 0.001`) gets its two ends.
 */
export function bulletTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min) || !finite(min) || !finite(max)) return finite(min) ? [min] : []
  const wanted = Math.max(1, Math.min(MAX_TICKS - 1, Math.floor(target)))
  const power = 10 ** Math.floor(Math.log10((max - min) / wanted))
  const safe = (step: number) => Number.isSafeInteger(Math.ceil(Math.abs(min) / step)) && Number.isSafeInteger(Math.floor(Math.abs(max) / step))
  const count = (step: number) => Math.floor(max / step + 1e-9) - Math.ceil(min / step - 1e-9) + 1
  const step = [1, 2, 2.5, 5, 10, 20, 25, 50, 100].map((multiple) => multiple * power).find((candidate) => count(candidate) <= wanted + 1)
  if (step === undefined || !(step > 0) || !safe(step) || min + step === min) return [min, max]
  const first = Math.ceil(min / step - 1e-9)
  const ticks: number[] = []
  // Bounded by the count, not by the index: the loop ends however the floating point rounds.
  for (let at = 0; at < Math.min(count(step), MAX_TICKS); at += 1) ticks.push(Number(((first + at) * step).toPrecision(12)))
  return ticks
}
