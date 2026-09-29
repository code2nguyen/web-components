/**
 * What `build-registry.ts` derives from a gallery card so an agent can pick one without reading every CSS block and
 * copy it without hard-coding the gallery's palette: a stable slug (also the screenshot file name), a one-line
 * summary of what the card changes, and its CSS with theme-token literals turned into `var(--c2-theme--…, literal)`.
 */
import { parseCssVarName } from '../src/lib/css-var-name.ts'

export interface ThemeColor {
  name: string
  light: string | null
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** `Variants` + `Soft` → `variants--soft`, suffixed `-2`, `-3` when a gallery repeats a label within a section. */
export function exampleSlug(section: string | undefined, label: string, used: Set<string>): string {
  const base = [section, label].filter(Boolean).map(slugify).filter(Boolean).join('--') || 'example'
  let slug = base
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
  used.add(slug)
  return slug
}

const declarations = (css: string) => [...css.matchAll(/(--c2-[a-z0-9_-]+)\s*:\s*([^;}]+)/g)].map((m) => ({ name: m[1], value: m[2].trim() }))

const humanize = (text: string) => text.replaceAll('-', ' ')

/** Side and corner longhands read as their shorthand: four border sides are one "border" in a summary. */
const shorthand = (property: string) =>
  property.replace(/^border-(top|bottom)-(left|right)-radius$/, 'border-radius').replace(/^(border|padding|margin)-(top|right|bottom|left)(-|$)/, '$1$3')

const list = (items: string[]) => new Intl.ListFormat('en').format(items)

/**
 * The attributes the card sets on its outermost c2 element, other than presentation plumbing (`class`, `style`,
 * `slot`, `id`). Children (a table's columns, a list's items) carry content, not the look.
 */
function markupAttributes(html: string): string[] {
  const names = new Set<string>()
  for (const tag of [/<c2-[a-z0-9-]+([^>]*)>/.exec(html)].filter((match) => match !== null)) {
    for (const attribute of tag[1].matchAll(/\s([a-z][a-z0-9-]*)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
      if (['class', 'style', 'slot', 'id'].includes(attribute[1]) || attribute[1].startsWith('aria-') || attribute[1].startsWith('data-')) continue
      names.add(attribute[2] && attribute[2].length <= 24 ? `${attribute[1]}=${attribute[2]}` : attribute[1])
    }
  }
  return [...names]
}

/** `Restyles container background color, color and border, plus hover and active states. Sets size="sm".` */
export function summarizeExample(html: string, css: string | undefined): string {
  const targets = new Set<string>()
  const states = new Set<string>()
  for (const { name } of declarations(css ?? '')) {
    const parsed = parseCssVarName(name)
    if (!parsed) continue
    if (parsed.states.length) parsed.states.forEach((state) => states.add(humanize(state)))
    else targets.add(humanize([...parsed.parts, shorthand(parsed.property)].join(' ')))
  }
  const sentences: string[] = []
  const shown = [...targets].slice(0, 6)
  if (shown.length || states.size) {
    const what = shown.length ? `${list(shown)}${targets.size > shown.length ? ` and ${targets.size - shown.length} more` : ''}` : ''
    const how = states.size ? `${what ? ', plus ' : ''}${list([...states])} state${states.size > 1 ? 's' : ''}` : ''
    sentences.push(`Restyles ${what}${how}.`)
  }
  const attributes = markupAttributes(html)
  if (attributes.length) sentences.push(`Sets ${list(attributes.slice(0, 5))}.`)
  return sentences.join(' ') || 'Themed default, no overrides.'
}

/** Which tokens suit the property a value is assigned to: text takes the `on-*` roles, surfaces never do. */
function pickToken(property: string, candidates: string[]): string | undefined {
  const on = (token: string) => token.includes('--color-on-')
  if (/(^|-)(background|fill)(-color)?$|^background|shadow/.test(property)) return candidates.find((token) => !on(token))
  if (/(^|-)color$|^fill$|^stroke$|caret/.test(property) && !/border|outline/.test(property)) {
    return candidates.find(on) ?? candidates.find((token) => !/surface|container|scrim/.test(token))
  }
  if (/border|outline/.test(property)) return candidates.find((token) => token.includes('outline')) ?? candidates.find((token) => !on(token))
  return candidates[0]
}

const normalizeColor = (value: string) => value.toLowerCase().replace(/\s+/g, '')

/** `#3f3f46` → `[63, 63, 70, 1]`; `rgba(24, 24, 27, 0.55)` → `[24, 24, 27, 0.55]`. */
function parseColor(color: string): [number, number, number, number] | undefined {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color)
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('')
    const channel = (at: number) => parseInt(digits.slice(at, at + 2), 16)
    return [channel(0), channel(2), channel(4), digits.length === 8 ? channel(6) / 255 : 1]
  }
  const rgb = /^rgba?\(([^)]*)\)$/i.exec(color)
  if (!rgb) return undefined
  const [r, g, b, a = 1] = rgb[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)
  return [r, g, b, a]
}

/** Greys (and near-greys such as zinc) are ink and paper; anything with a hue is an accent. */
const isNeutral = ([r, g, b]: [number, number, number, number]) => Math.max(r, g, b) - Math.min(r, g, b) <= 16

const INK = 'var(--c2-theme--color-on-surface, #18181b)'
const PAPER = 'var(--c2-theme--color-surface, #ffffff)'

/**
 * An opaque grey no role owns, as a share of ink over paper: `#3f3f46` is 83% ink. Under the light theme that is the
 * authored grey to within a few levels; in dark mode ink and paper swap, so a hover two steps darker than its base
 * stays two steps apart instead of collapsing onto one role.
 */
function mixNeutral([r, g, b]: [number, number, number, number]): string {
  const ink = 24
  const paper = 255
  const share = Math.round(((paper - (r + g + b) / 3) / (paper - ink)) * 100)
  const clamped = Math.min(100, Math.max(0, share))
  return clamped === 0 ? PAPER : clamped === 100 ? INK : `color-mix(in srgb, ${INK} ${clamped}%, ${PAPER})`
}

const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi

/**
 * Makes a card's neutral colours follow the theme. A literal equal to a colour role's light value becomes
 * `var(--c2-theme--<role>, <literal>)`, the role chosen by the property it is assigned to; any other opaque grey becomes
 * a mix of ink and paper (`mixNeutral`). Under the default light theme the card renders as authored; with an
 * application's tokens, or in dark mode, its greys, text and borders flip with everything else.
 *
 * Hues stay literal: they are the card's accents. So does a whole rule block that paints a coloured background, since
 * its text was chosen against that colour and must not flip on its own. Only the `color-*` roles take part; the chart
 * palette tokens are series colours, not surfaces or text.
 */
export function themeExampleCss(css: string, tokens: ThemeColor[]): { css: string; themed: number; literal: number } {
  const byValue = new Map<string, string[]>()
  for (const token of tokens) {
    if (!token.light || !token.name.startsWith('--c2-theme--color-')) continue
    const key = normalizeColor(token.light)
    byValue.set(key, [...(byValue.get(key) ?? []), token.name])
  }
  let themed = 0
  let literal = 0
  // Plain declarations count too: `color: #3f3f46` on a card's own wrapper goes dark in dark mode just the same.
  const DECLARATION = /(--c2-[a-z0-9_-]+|\b[a-z][a-z-]*)(\s*:\s*)([^;]+)/g
  const propertyOf = (name: string) => (name.startsWith('--') ? (parseCssVarName(name)?.property ?? '') : name)
  // Innermost blocks only, so an `@media` wrapper is walked into rather than rewritten as one body.
  const out = css.replace(/\{([^{}]*)\}/g, (block, body: string) => {
    const accentSurface = [...body.matchAll(DECLARATION)].some(([, name, , value]) => {
      if (!/background/.test(propertyOf(name))) return false
      return [...value.matchAll(COLOR)].some((match) => {
        const color = parseColor(match[0])
        return !!color && color[3] >= 0.5 && !isNeutral(color)
      })
    })
    if (accentSurface) {
      literal += (body.match(COLOR) ?? []).length
      return block
    }
    const next = body.replace(DECLARATION, (declaration, name: string, colon: string, value: string) => {
      if (value.includes('var(') || value.includes('color-mix(')) return declaration
      const property = propertyOf(name)
      return `${name}${colon}${value.replace(COLOR, (match) => {
        const token = pickToken(property, byValue.get(normalizeColor(match)) ?? [])
        if (token) {
          themed++
          return `var(${token}, ${match})`
        }
        const color = parseColor(match)
        if (color && color[3] === 1 && isNeutral(color)) {
          themed++
          return mixNeutral(color)
        }
        literal++
        return match
      })}`
    })
    return `{${next}}`
  })
  return { css: out, themed, literal }
}
