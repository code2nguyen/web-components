// Number helpers shared by `c2-meter` and `c2-range-indicator`.

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function finite(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** One `Intl.NumberFormat` per locale and options, shared by every meter and every render. */
const formats = new Map<string, Intl.NumberFormat>()

export function numberFormat(locale: string, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formats.get(key)
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, options)
    } catch {
      // An invalid `lang` falls back to English rather than breaking the render.
      format = new Intl.NumberFormat('en', options)
    }
    formats.set(key, format)
  }
  return format
}
