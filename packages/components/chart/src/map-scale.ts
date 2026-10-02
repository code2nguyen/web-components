/**
 * The colour scale of a choropleth: a value in, a colour out. Pure functions, so the scale can be tested without
 * an engine and reused by an application drawing its own key.
 *
 * Colours are mixed in OKLab, where equal steps look like equal steps. Mixing in sRGB makes the middle of a
 * light-to-dark blue ramp muddy and greyer than either end.
 */

/** `[r, g, b, a]`, channels 0–255 and alpha 0–1. */
export type Rgba = [number, number, number, number]

/** How values map to colours. */
export interface MapScaleOptions {
  /** One hue from light to dark, or two hues meeting at a neutral midpoint. */
  kind: 'sequential' | 'diverging'
  /** `[min, max]`, or `[min, mid, max]` for a diverging scale. */
  domain: readonly number[]
  /** Class breaks. With them the scale is stepped: `thresholds.length + 1` classes, a value equal to a break in the upper one. */
  thresholds?: readonly number[]
  /** One colour per class, overriding the ramp. Needs `thresholds`. */
  colors?: readonly string[]
  /** The low end of a sequential scale, or the negative end of a diverging one. */
  start: string
  /** The high end, or the positive end of a diverging scale. */
  end: string
  /** The neutral midpoint of a diverging scale. */
  mid: string
}

/** A resolved scale: the colour for a value, and what the legend needs to draw its key. */
export interface MapScale {
  colorOf(value: number): string
  /** The classes of a stepped scale, lowest first, or `undefined` for a continuous one. */
  steps?: { color: string; from: number; to: number }[]
  /** The resolved domain, `[min, max]` or `[min, mid, max]`. */
  domain: number[]
  /** Colours sampled evenly across a continuous scale, for a CSS gradient. */
  gradient(stops?: number): string[]
}

/** Parses `rgb()`/`rgba()`, `color(srgb …)` and hex. Anything else (a named colour, `oklch()`) returns `undefined`. */
export function parseColor(value: string): Rgba | undefined {
  const text = value.trim()
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(text)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha(rgb[4])]
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(text)
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, alpha(srgb[4])]
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(text)
  if (!hex) return undefined
  const digits = hex[1].length <= 4 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1]
  const channel = (index: number) => parseInt(digits.slice(index * 2, index * 2 + 2), 16)
  return [channel(0), channel(1), channel(2), digits.length === 8 ? channel(3) / 255 : 1]
}

function alpha(value: string | undefined): number {
  if (value === undefined) return 1
  return value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value)
}

export function formatColor([r, g, b, a]: Rgba): string {
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value)))
  return a >= 1 ? `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})` : `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${Math.round(a * 1000) / 1000})`
}

const toLinear = (channel: number) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
const fromLinear = (value: number) => 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)

function toOklab([r, g, b, a]: Rgba): Rgba {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    a,
  ]
}

function fromOklab([L, A, B, a]: Rgba): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a,
  ]
}

/** `from` and `to` mixed at `t` (0–1) in OKLab. A colour that cannot be parsed is returned as it is at its own end. */
export function mixColors(from: string, to: string, t: number): string {
  const a = parseColor(from)
  const b = parseColor(to)
  if (!a || !b) return t < 0.5 ? from : to
  const p = toOklab(a)
  const q = toOklab(b)
  const amount = Math.min(1, Math.max(0, t))
  return formatColor(fromOklab([0, 1, 2, 3].map((index) => p[index] + (q[index] - p[index]) * amount) as Rgba))
}

/** The extent of the finite values, or `[0, 1]` when there are none. */
export function extentOf(values: Iterable<number | null>): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  return min <= max ? [min, max] : [0, 1]
}

/**
 * Builds the scale. A sequential domain defaults to the data's extent, a diverging one to a range symmetric around
 * `0`, so equal distances from the midpoint get equally strong colours on both sides.
 */
export function createMapScale(options: MapScaleOptions, values: Iterable<number | null>): MapScale {
  const diverging = options.kind === 'diverging'
  const [dataMin, dataMax] = extentOf(values)
  let domain: number[]
  if (diverging) {
    const mid = options.domain.length === 3 ? options.domain[1] : 0
    if (options.domain.length >= 2) domain = [options.domain[0], mid, options.domain[options.domain.length - 1]]
    else {
      const reach = Math.max(Math.abs(dataMin - mid), Math.abs(dataMax - mid)) || 1
      domain = [mid - reach, mid, mid + reach]
    }
  } else {
    domain = options.domain.length >= 2 ? [options.domain[0], options.domain[options.domain.length - 1]] : [dataMin, dataMax]
  }

  /** `t` from -1 (negative end) through 0 (midpoint) to 1 for a diverging scale, 0 to 1 for a sequential one. */
  const rampAt = (t: number): string => {
    if (!diverging) return mixColors(options.start, options.end, t)
    return t < 0 ? mixColors(options.mid, options.start, -t) : mixColors(options.mid, options.end, t)
  }
  const position = (value: number): number => {
    if (!diverging) {
      const [min, max] = domain
      return max === min ? 1 : (value - min) / (max - min)
    }
    const [min, mid, max] = domain
    if (value < mid) return mid === min ? -1 : -Math.min(1, (mid - value) / (mid - min))
    return max === mid ? 1 : Math.min(1, (value - mid) / (max - mid))
  }

  const thresholds = [...(options.thresholds ?? [])].filter(Number.isFinite).sort((a, b) => a - b)
  if (thresholds.length > 0) {
    const count = thresholds.length + 1
    const steps = Array.from({ length: count }, (_unused, index) => {
      const explicit = options.colors?.[index]
      const t = count === 1 ? 1 : diverging ? -1 + (2 * index) / (count - 1) : index / (count - 1)
      return {
        color: explicit ?? rampAt(t),
        from: index === 0 ? -Infinity : thresholds[index - 1],
        to: index === count - 1 ? Infinity : thresholds[index],
      }
    })
    return {
      steps,
      domain,
      colorOf: (value) => steps[thresholds.filter((threshold) => value >= threshold).length].color,
      gradient: () => steps.map((step) => step.color),
    }
  }

  return {
    domain,
    colorOf: (value) => rampAt(Math.max(diverging ? -1 : 0, Math.min(1, position(value)))),
    gradient: (stops = 9) => Array.from({ length: stops }, (_unused, index) => rampAt(diverging ? -1 + (2 * index) / (stops - 1) : index / (stops - 1))),
  }
}
