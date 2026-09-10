/**
 * Parsing and formatting of the CSS values the inspector edits.
 *
 * The inspector controls are typed (a number field, a 4-side box, a border trio, a colour swatch) but the values they
 * round-trip are arbitrary CSS: `8px`, `0.5rem`, `4px 8px`, `1px dashed var(--x)`, `none`, `rgb(0 0 0 / 40%)`. Every
 * parser here therefore reports whether it understood the value; a control that gets `null` must fall back to a plain
 * text field instead of silently rewriting the value (which is how `0.5rem` used to become `NaNpx` and `none` became
 * `0px solid transparent`).
 */

/** Units the number controls offer. `''` is the unitless case (`line-height: 1.5`, `z-index: 10`, `opacity: .5`). */
export const LENGTH_UNITS = ['px', '%', 'rem', 'em', 'vh', 'vw', 'ch', ''] as const
export const TIME_UNITS = ['ms', 's'] as const

export const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'] as const

const NUMBER_WITH_UNIT = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i

export interface Length {
  value: number
  unit: string
}

/**
 * `"8px"` -> `{ value: 8, unit: 'px' }`, `"0"` -> `{ value: 0, unit: '' }`.
 * Returns `null` for anything that is not a single number with an optional unit (`calc(…)`, `var(…)`, `auto`, `50% 10%`).
 */
export function parseLength(raw: string | undefined | null): Length | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  const match = NUMBER_WITH_UNIT.exec(value)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed)) return null
  return { value: parsed, unit: match[2].toLowerCase() }
}

/** Formats a number + unit, dropping the unit for a plain `0` so `0px` and `0` stay interchangeable. */
export function formatLength(length: Length): string {
  const value = roundTo(length.value, 4)
  if (value === 0 && length.unit !== '%') return '0'
  return `${value}${length.unit}`
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Splits a CSS value on top-level whitespace, keeping `rgb(0, 0, 0)`, `var(--x, 1px)` and `calc(1px + 2%)` intact.
 * This is what makes border/shadow parsing safe: a naive `split(' ')` sees `rgb(0,` as a token.
 */
export function splitTopLevel(value: string, separator: 'space' | 'comma' = 'space'): string[] {
  const tokens: string[] = []
  let depth = 0
  let current = ''
  let quote = ''
  for (const char of value) {
    if (quote) {
      current += char
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '(') depth++
    if (char === ')') depth = Math.max(0, depth - 1)
    const isSeparator = depth === 0 && (separator === 'space' ? /\s/.test(char) : char === ',')
    if (isSeparator) {
      if (current) tokens.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

// ---------------------------------------------------------------------------
// Shorthands (padding, border-radius, margin, inset)
// ---------------------------------------------------------------------------

/**
 * Expands a box shorthand to the four sides in CSS order (top, right, bottom, left):
 * 1 value -> all four, 2 -> block/inline, 3 -> top/inline/bottom, 4 -> as given.
 * Returns `null` when the value is not 1-4 tokens (the old code silently turned `4px 8px` into `4px 4px 4px 4px`).
 */
export function expandBoxShorthand(raw: string | undefined | null): [string, string, string, string] | null {
  const tokens = splitTopLevel((raw ?? '').trim())
  switch (tokens.length) {
    case 1:
      return [tokens[0], tokens[0], tokens[0], tokens[0]]
    case 2:
      return [tokens[0], tokens[1], tokens[0], tokens[1]]
    case 3:
      return [tokens[0], tokens[1], tokens[2], tokens[1]]
    case 4:
      return [tokens[0], tokens[1], tokens[2], tokens[3]]
    default:
      return null
  }
}

/** Collapses four sides back to the shortest equivalent shorthand. */
export function collapseBoxShorthand(sides: [string, string, string, string]): string {
  const [top, right, bottom, left] = sides
  if (top === right && right === bottom && bottom === left) return top
  if (top === bottom && right === left) return `${top} ${right}`
  if (right === left) return `${top} ${right} ${bottom}`
  return `${top} ${right} ${bottom} ${left}`
}

// ---------------------------------------------------------------------------
// Border / outline
// ---------------------------------------------------------------------------

export interface BorderValue {
  width: string
  style: string
  color: string
}

/**
 * Parses a `border` / `outline` shorthand into its three parts, in any author order, and understands `none`.
 * Returns `null` when the value cannot be represented as width/style/colour (a bare `var(--border)`, for instance),
 * so the caller keeps the value verbatim in a text field rather than rewriting it.
 */
export function parseBorder(raw: string | undefined | null): BorderValue | null {
  const value = (raw ?? '').trim()
  if (!value) return { width: '0', style: 'none', color: 'currentColor' }
  const tokens = splitTopLevel(value)
  if (tokens.length === 1 && (tokens[0] === 'none' || tokens[0] === 'hidden' || tokens[0] === '0')) {
    return { width: '0', style: 'none', color: 'currentColor' }
  }
  if (tokens.length > 3) return null

  const result: BorderValue = { width: '', style: '', color: '' }
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (!result.style && (BORDER_STYLES as readonly string[]).includes(lower)) {
      result.style = lower
      continue
    }
    if (!result.width && (parseLength(token) !== null || ['thin', 'medium', 'thick'].includes(lower))) {
      result.width = token
      continue
    }
    if (!result.color) {
      result.color = token
      continue
    }
    return null
  }
  // A width alone is a legal shorthand but not something the trio control can round-trip losslessly unless we
  // supply the implied style; `border: 2px` renders nothing without a style, so `solid` is the useful default.
  return { width: result.width || '0', style: result.style || (result.width ? 'solid' : 'none'), color: result.color || 'currentColor' }
}

export function formatBorder(border: BorderValue): string {
  if (border.style === 'none') return 'none'
  return `${border.width || '0'} ${border.style || 'solid'} ${border.color || 'currentColor'}`.trim()
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** Values that are colours but have no swatch: the picker must not turn them into `#000000`. */
export const KEYWORD_COLORS = ['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert']

export function isKeywordColor(raw: string | undefined | null): boolean {
  return KEYWORD_COLORS.includes((raw ?? '').trim().toLowerCase())
}

/** True for values a colour picker cannot represent: `var(…)`, gradients, `url(…)`, multi-token values. */
export function isUnpickableColor(raw: string | undefined | null): boolean {
  const value = (raw ?? '').trim()
  if (!value) return false
  if (isKeywordColor(value)) return true
  return /^(var|url|linear-gradient|radial-gradient|conic-gradient|repeating-|image-set|color-mix)/i.test(value) || splitTopLevel(value).length > 1
}

/** Formats an alpha channel (0-1) as the percentage the inspector shows, without float noise (`43.9%`, not `43.921568…%`). */
export function formatAlpha(alpha: number): string {
  return `${roundTo(alpha * 100, 1)}%`
}

export function parseAlpha(raw: string): number | null {
  const value = Number((raw ?? '').replace('%', '').trim())
  if (!Number.isFinite(value) || value < 0 || value > 100) return null
  return roundTo(value / 100, 4)
}

// ---------------------------------------------------------------------------
// Keyword properties
// ---------------------------------------------------------------------------

/**
 * The keyword sets behind the `@cssproperty {type}` tags that used to fall through to a free-text field.
 * Keyed by manifest type first, then by the property name, so `{justify-content}` and a `--…--align-items`
 * both get a select.
 */
export const KEYWORD_OPTIONS: Record<string, string[]> = {
  'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'stretch'],
  'align-items': ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
  'align-self': ['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-direction-row': ['row', 'row-reverse', 'column', 'column-reverse'],
  'text-transform': ['none', 'capitalize', 'uppercase', 'lowercase'],
  'text-decoration': ['none', 'underline', 'overline', 'line-through'],
  'object-fit': ['fill', 'contain', 'cover', 'none', 'scale-down'],
  'stroke-linecap': ['butt', 'round', 'square'],
  'border-style': [...BORDER_STYLES],
  position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  'font-style': ['normal', 'italic', 'oblique'],
  'font-weight': ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
}

/** Property names whose value is a unitless number rather than a length. */
export const UNITLESS_TYPES = ['opacity', 'number', 'flex', 'aspect-ratio', 'tab-size', 'z-index', 'saturation', 'lightness']
