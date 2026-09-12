/**
 * Rule engine: decides which `--c2-theme--*` token (if any) a component CSS variable follows.
 * First matching rule wins; the component's original default is always kept as the innermost fallback.
 */
import type { CssVar } from './manifests.ts'
import { overrides, type Override } from './overrides.ts'

export type Classification =
  | { kind: 'mapped'; rule: string; token: string; value: string }
  | { kind: 'unmapped'; rule: string; reason: string }
  | { kind: 'excluded'; rule: string; reason: string }

const t = (name: string) => `--c2-theme--${name}`

/** Normalise a colour literal to lowercase hex when possible, otherwise a whitespace-normalised string. */
export function normalizeColor(value: string): string {
  const v = value.trim().toLowerCase().replace(/\s+/g, ' ')
  const rgb = /^rgb\((\d+), ?(\d+), ?(\d+)\)$/.exec(v)
  if (rgb)
    return (
      '#' +
      rgb
        .slice(1, 4)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    )
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return v
}

const ACCENT = new Set(['#0265dc', '#476ef9', '#2f56e6'])
const ACCENT_HOVER = new Set(['#0154b8'])
const ACCENT_ACTIVE = new Set(['#01469a'])

const BACKGROUND_TOKENS: [Set<string>, string][] = [
  [new Set(['#ffffff']), 'color-surface'],
  [new Set(['#fafafa', '#f8f8f8']), 'color-surface-container-low'],
  [new Set(['#f4f4f5', '#e6e6e6', '#f5f5f5']), 'color-surface-container'],
  [ACCENT, 'color-primary'],
  [ACCENT_HOVER, 'color-primary-hover'],
  [ACCENT_ACTIVE, 'color-primary-active'],
  [new Set(['#edf1fe']), 'color-primary-container'],
  [new Set(['#18181b']), 'color-inverse-surface'],
  [new Set(['rgba(9, 9, 11, 0.45)', 'rgba(0, 0, 0, 0.32)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.5)']), 'color-scrim'],
]

const TEXT_TOKENS: [Set<string>, string][] = [
  [new Set(['#18181b', '#222222', '#1f2937']), 'color-on-surface'],
  [new Set(['#71717a', '#6d6d6d', '#a1a1aa', '#52525b']), 'color-on-surface-variant'],
  [new Set([...ACCENT, ...ACCENT_HOVER]), 'color-primary'],
  [new Set(['#dc2626', '#d31510']), 'color-error'],
  [new Set(['#e4e4e7']), 'color-outline-variant'],
]

const BORDER_COLOR_OUTLINE = new Set(['#bcbcc6', '#d5d5d5', '#b1b1b1', '#d4d4d8'])
const BORDER_COLOR_OUTLINE_VARIANT = new Set(['#e4e4e7'])
const BORDER_COLOR_STRONG = new Set(['#a1a1aa'])
const BORDER_COLOR_ERROR = new Set(['#dc2626'])

const RADIUS_TOKENS: Record<string, string> = {
  '4px': 'radius-sm',
  '6px': 'radius-md',
  '8px': 'radius-lg',
  '14px': 'radius-xl',
  '999px': 'radius-full',
  '9999px': 'radius-full',
  '50%': 'radius-full',
}

const FONT_SIZE_TOKENS: Record<string, string> = { '12px': 'font-size-sm', '14px': 'font-size-md' }
const FONT_WEIGHT_TOKENS: Record<string, string> = { '500': 'font-weight-medium', '600': 'font-weight-semibold' }

const SHADOW_MD_PREFIXES = new Set([
  'c2-tooltip',
  'c2-select',
  'c2-dropdown-list',
  'c2-overlay',
  'c2-color-select',
  'c2-menu',
  'c2-navigation-menu',
  'c2-navigation-menu-item',
])
const SHADOW_LG_PREFIXES = new Set(['c2-modal', 'c2-sheet', 'c2-side-nav'])

const EXCLUDED_PARTS = new Set(['theme', 'auto-color'])
const KEYWORDS = new Set(['transparent', 'none', 'inherit', 'initial', 'unset', 'currentcolor', 'auto'])

function lookup(tables: [Set<string>, string][], color: string): string | undefined {
  for (const [set, token] of tables) if (set.has(color)) return token
  return undefined
}

function mapped(rule: string, token: string, value: string): Classification {
  return { kind: 'mapped', rule, token: t(token), value }
}

function applyOverride(cssVar: CssVar, override: Override): Classification {
  if ('exclude' in override) return { kind: 'excluded', rule: 'R0', reason: override.exclude }
  const orig = cssVar.default ?? ''
  const value = override.value ? override.value.replaceAll('{orig}', orig) : `var(${t(override.token)}, ${orig})`
  return mapped('R0', override.token, value.trim())
}

/**
 * Classify one variable. `siblings` are all variables of the same component so colour rules can look at the
 * matching background of a `color` property.
 */
export function classify(cssVar: CssVar, siblings: CssVar[]): Classification {
  const override = overrides[cssVar.name]
  if (override) return applyOverride(cssVar, override)

  const { property, states, parts } = cssVar
  const orig = cssVar.default
  if (orig === undefined || orig === '') return { kind: 'unmapped', rule: 'R1', reason: 'no default (inherits)' }

  const keyword = orig.trim().toLowerCase()
  if (KEYWORDS.has(keyword) || keyword.startsWith('calc(') || keyword.startsWith('var(')) {
    return { kind: 'excluded', rule: 'R2', reason: `keyword / derived value ${orig}` }
  }

  if (parts.some((p) => EXCLUDED_PARTS.has(p)) || (cssVar.prefix === 'c2-avatar' && parts.includes('badge') && states.length > 0)) {
    return { kind: 'excluded', rule: 'R2', reason: 'identity / syntax colours are not themed' }
  }

  const isFocus = states.includes('focus')
  const isHover = states.includes('hover')
  const isOpen = states.includes('open')
  const isError = states.includes('error')
  const isReadOnly = states.includes('read-only')
  const isDisabled = states.includes('disabled')

  if (property === 'opacity' && isDisabled) return mapped('R3', 'disabled-opacity', `var(${t('disabled-opacity')}, ${orig})`)

  if (property === 'outline' && isFocus && !isError) return mapped('R4', 'focus-ring', `var(${t('focus-ring')}, ${orig})`)

  if (/^border(-top|-right|-bottom|-left)?$/.test(property)) {
    const border = /^(\d+(?:\.\d+)?px) solid (.+)$/.exec(orig.trim())
    if (!border) return { kind: 'unmapped', rule: 'R5', reason: `border shorthand not "<width> solid <color>": ${orig}` }
    const [, width, rawColor] = border
    const color = normalizeColor(rawColor)
    if (color === 'transparent' || width === '0px') return { kind: 'unmapped', rule: 'R5', reason: 'transparent / zero border' }
    const widthExpr = width === '1px' ? `var(${t('border-width')}, 1px)` : width
    let colorToken: string | undefined
    if (isFocus || isOpen) colorToken = ACCENT.has(color) ? 'color-primary' : undefined
    if (!colorToken && BORDER_COLOR_ERROR.has(color)) colorToken = 'color-error'
    if (!colorToken && (isHover || BORDER_COLOR_STRONG.has(color))) colorToken = BORDER_COLOR_STRONG.has(color) ? 'color-outline-strong' : undefined
    if (!colorToken && (isReadOnly || BORDER_COLOR_OUTLINE_VARIANT.has(color))) colorToken = 'color-outline-variant'
    if (!colorToken && BORDER_COLOR_OUTLINE.has(color)) colorToken = 'color-outline'
    if (!colorToken && color === '#ffffff') colorToken = 'color-surface'
    if (!colorToken) return { kind: 'unmapped', rule: 'R5', reason: `unknown border colour ${rawColor}` }
    const inner = `${widthExpr} solid var(${t(colorToken)}, ${rawColor.trim()})`
    if (colorToken === 'color-outline' && states.length === 0) return mapped('R5', 'border', `var(${t('border')}, ${inner})`)
    return mapped('R5', colorToken, inner)
  }

  if (property === 'background' || property === 'background-color') {
    const color = normalizeColor(orig)
    const token = lookup(BACKGROUND_TOKENS, color)
    if (!token) return { kind: 'unmapped', rule: 'R6', reason: `unknown background ${orig}` }
    return mapped('R6', token, `var(${t(token)}, ${orig})`)
  }

  if (property === 'color' || property.endsWith('-color')) {
    const color = normalizeColor(orig)
    if (color === '#ffffff') {
      const background = siblings.find(
        (s) =>
          (s.property === 'background' || s.property === 'background-color') &&
          s.parts.join('/') === parts.join('/') &&
          s.states.join('/') === states.join('/') &&
          s.default !== undefined &&
          ACCENT.has(normalizeColor(s.default)),
      )
      if (background) return mapped('R7', 'color-on-primary', `var(${t('color-on-primary')}, ${orig})`)
      return { kind: 'unmapped', rule: 'R7', reason: 'white text without an accent background' }
    }
    if (color === 'currentcolor' || color === 'inherit') return { kind: 'unmapped', rule: 'R7', reason: `keyword ${orig}` }
    const token = lookup(TEXT_TOKENS, color)
    if (!token) return { kind: 'unmapped', rule: 'R7', reason: `unknown colour ${orig}` }
    return mapped('R7', token, `var(${t(token)}, ${orig})`)
  }

  if (/border(-[a-z]+)*-radius$/.test(property)) {
    const token = RADIUS_TOKENS[orig.trim()]
    if (!token) return { kind: 'unmapped', rule: 'R8', reason: `radius ${orig} has no token` }
    return mapped('R8', token, `var(${t(token)}, ${orig})`)
  }

  if (property === 'font-size') {
    const token = FONT_SIZE_TOKENS[orig.trim()]
    if (!token) return { kind: 'unmapped', rule: 'R9', reason: `font-size ${orig} has no token` }
    return mapped('R9', token, `var(${t(token)}, ${orig})`)
  }

  if (property === 'font-weight') {
    const token = FONT_WEIGHT_TOKENS[orig.trim()]
    if (!token) return { kind: 'unmapped', rule: 'R10', reason: `font-weight ${orig} has no token` }
    return mapped('R10', token, `var(${t(token)}, ${orig})`)
  }

  if (property === 'font-family') {
    return mapped('R10', 'font-family', `var(${t('font-family')}, ${orig})`)
  }

  if (property === 'transition-duration' || property === 'animation-duration') {
    if (!/^\d+(\.\d+)?m?s$/.test(orig.trim())) return { kind: 'unmapped', rule: 'R11', reason: `duration ${orig} is not a single time` }
    return mapped('R11', 'motion-scale', `calc(${orig} * var(${t('motion-scale')}, 1))`)
  }

  if (property === 'box-shadow') {
    if (orig.trim() === 'none') return { kind: 'unmapped', rule: 'R12', reason: 'no shadow' }
    if (SHADOW_MD_PREFIXES.has(cssVar.prefix)) return mapped('R12', 'shadow-md', `var(${t('shadow-md')}, ${orig})`)
    if (SHADOW_LG_PREFIXES.has(cssVar.prefix)) return mapped('R12', 'shadow-lg', `var(${t('shadow-lg')}, ${orig})`)
    return { kind: 'unmapped', rule: 'R12', reason: 'shadow of an unlisted component' }
  }

  return { kind: 'unmapped', rule: 'R13', reason: `property ${property} is not themed by design` }
}
