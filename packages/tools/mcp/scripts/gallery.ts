/**
 * What `build-registry.ts` derives from a gallery card so an agent can pick one without reading every CSS block and
 * copy it without hard-coding the gallery's palette: a stable slug (also the screenshot file name), a one-line
 * summary of what the card changes, and its CSS with theme-token literals turned into `var(--c2-theme--…, literal)`.
 */
import { parseCssVarName } from '../src/lib/css-var-name.ts'

export interface ThemeColor {
  name: string
  light: string | null
  dark?: string
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * `Variants` + `Soft` → `variants--soft`. The slug is also the screenshot file name on the docs site, so it must not
 * depend on card order: a label repeated within a section fails the build instead of being numbered.
 */
export function exampleSlug(section: string | undefined, label: string, used: Set<string>): string {
  const slug = [section, label].filter(Boolean).map(slugify).filter(Boolean).join('--') || 'example'
  if (used.has(slug)) throw new Error(`Two gallery cards share the slug "${slug}": give one its own label (a comma ends the label in fence meta)`)
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

/** The literal colours of a value; one that already reads a variable or a `color-mix()` has been themed. */
const literalColors = (value: string) =>
  value.includes('var(') || value.includes('color-mix(') || value.includes('light-dark(') ? [] : [...value.matchAll(COLOR)].map((match) => match[0])
const hex = (channels: number[]) =>
  `#${channels
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
const lightness = ([r, g, b]: [number, number, number, number]) => (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255

/** HSL saturation: a pale blue (`#eff6ff`) is fully saturated even though its channels are only 16 apart. */
function saturation([r, g, b]: [number, number, number, number]): number {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  return max === min ? 0 : (max - min) / (l > 0.5 ? 2 - max - min : max + min)
}

/** A pale wash of a hue (`#f3e8ff`, `#eff6ff`): the selected row, the soft badge, the info panel. */
const isTint = (color: [number, number, number, number]) =>
  color[3] === 1 && lightness(color) >= 0.85 && Math.max(color[0], color[1], color[2]) - Math.min(color[0], color[1], color[2]) >= 4 && saturation(color) >= 0.5
/** Accent text on a tint (`#7e22ce`, `#2f56e6`), too dark to read once the tint goes dark. */
const isAccentText = (color: [number, number, number, number]) => color[3] === 1 && !isNeutral(color) && lightness(color) <= 0.7

type Rgb = [number, number, number]

const mixRgb = (a: Rgb, b: Rgb, share: number): Rgb => [0, 1, 2].map((index) => a[index] * share + b[index] * (1 - share)) as Rgb

/** WCAG relative luminance and contrast ratio. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: Rgb, b: Rgb) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)

/** The dark theme's surface and text, from the tokens (the defaults are `@c2n/theme`'s). */
interface DarkPalette {
  surface: Rgb
  ink: Rgb
}

/**
 * The dark half of a tint: the vivid colour of its hue (`#f3e8ff` is `#7a00ff` at 10% over white) laid over the dark
 * surface at a somewhat larger share, so the wash still reads as that hue on a dark page.
 */
function darkTint([r, g, b]: [number, number, number, number], dark: DarkPalette): Rgb {
  const channels: Rgb = [r, g, b]
  const share = Math.max(0.01, Math.max(...channels.map((channel) => 255 - channel)) / 255)
  const vivid = channels.map((channel) => Math.min(255, Math.max(0, 255 - (255 - channel) / share))) as Rgb
  return mixRgb(vivid, dark.surface, Math.min(0.3, Math.max(0.12, share * 1.6)))
}

/** The dark half of accent text: the authored colour lightened towards dark-mode ink until it reads on every background. */
function darkText([r, g, b]: [number, number, number, number], backgrounds: Rgb[], dark: DarkPalette): Rgb {
  for (let step = 0; step <= 20; step++) {
    const candidate = mixRgb(dark.ink, [r, g, b], step / 20)
    if (backgrounds.every((background) => contrast(candidate, background) >= 4.5)) return candidate
  }
  return dark.ink
}

const lightDark = (light: string, dark: Rgb) => `light-dark(${light}, ${hex(dark)})`
/** `light-dark(#f3e8ff, …)`: the light half of a pair, which says whether the value was a tint. */
const lightHalf = (value: string) => /light-dark\(\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i.exec(value)?.[1]

// Syntax colours (`--c2-code-viewer__theme--token-keyword`) and a theme's `foreground` are text as well.
/**
 * A part that is painted rather than read (`--c2-tabs__indicator--color` is the selected pill's fill): its `color` is a
 * surface, so lightening it for dark mode would put light icons on a light fill.
 */
const FILL_PART = /__(?:indicator|track|thumb|bar|fill|progress|marker|dot|ring|beam|swatch|line)(?:__|--)/
const isTextDeclaration = (name: string, property: string) => isTextProperty(property) && !FILL_PART.test(name)
const isTextProperty = (property: string) =>
  /(^|-)color$|^fill$|^stroke$|caret|^token-|^foreground$/.test(property) && !/border|outline|background/.test(property)

/**
 * Makes a card's neutral colours follow the theme. A literal equal to a colour role's light value becomes
 * `var(--c2-theme--<role>, <literal>)`, the role chosen by the property it is assigned to; any other opaque grey becomes
 * a mix of ink and paper (`mixNeutral`). Under the default light theme the card renders as authored; with an
 * application's tokens, or in dark mode, its greys, text and borders flip with everything else.
 *
 * Mid-tone hues stay literal: they are the card's accents and read on either paper. A pale tint of a hue used as a
 * surface or border, and accent text in a block that paints one, become an explicit `light-dark(<authored>, <dark>)`
 * pair: the light half is exactly what was authored, the dark half a deeper wash of the hue (`darkTint`) and text
 * lightened until it reads on it (`darkText`), worked out once and then the author's to tune. `light-dark()` follows
 * the `color-scheme` that `@c2n/theme` sets with its dark mode. A whole rule block that paints a strong coloured
 * background stays literal, since its text was chosen against that colour and must not flip on its own, and so does a
 * block designed dark
 * (a dark background or light text). Only the `color-*` roles take part; the chart
 * palette tokens are series colours, not surfaces or text.
 */
export function themeExampleCss(
  css: string,
  tokens: ThemeColor[],
  { neutrals = 'all' }: { neutrals?: 'all' | 'tinted-blocks' } = {},
): { css: string; themed: number; literal: number } {
  const byValue = new Map<string, string[]>()
  for (const token of tokens) {
    if (!token.light || !token.name.startsWith('--c2-theme--color-')) continue
    // A theme-invariant colour (the dark-block roles) shares its value with a flipping role; matching a bare literal
    // to it would freeze a colour that has to follow the theme, so only roles with a dark value are candidates.
    if (!token.dark) continue
    const key = normalizeColor(token.light)
    byValue.set(key, [...(byValue.get(key) ?? []), token.name])
  }
  const darkOf = (name: string, fallback: Rgb): Rgb => {
    const value = tokens.find((token) => token.name === `--c2-theme--${name}`)?.dark
    const color = value ? parseColor(value) : undefined
    return color ? [color[0], color[1], color[2]] : fallback
  }
  const dark: DarkPalette = { surface: darkOf('color-surface', [24, 24, 27]), ink: darkOf('color-on-surface', [244, 244, 245]) }
  let themed = 0
  let literal = 0
  // Plain declarations count too: `color: #3f3f46` on a card's own wrapper goes dark in dark mode just the same.
  const DECLARATION = /(--c2-[a-z0-9_-]+|\b[a-z][a-z-]*)(\s*:\s*)([^;]+)/g
  const propertyOf = (name: string) => (name.startsWith('--') ? (parseCssVarName(name)?.property ?? '') : name)
  // Innermost blocks only, so an `@media` wrapper is walked into rather than rewritten as one body.
  const out = css.replace(/\{([^{}]*)\}/g, (block, body: string) => {
    const accentSurface = [...body.matchAll(DECLARATION)].some(([, name, , value]) => {
      if (!/background/.test(propertyOf(name))) return false
      return literalColors(value).some((literal) => {
        const color = parseColor(literal)
        return !!color && color[3] >= 0.5 && !isNeutral(color) && !isTint(color)
      })
    })
    // A block designed dark (a terminal, a night card) has a dark background or light text; its colours were chosen
    // against each other, and theming its greys would turn the background light in dark mode under fixed text.
    const darkSurface = [...body.matchAll(DECLARATION)].some(([, name, , value]) => {
      const property = propertyOf(name)
      return literalColors(value).some((literal) => {
        const color = parseColor(literal)
        if (!color || color[3] < 0.5) return false
        if (/background/.test(property)) return lightness(color) < 0.35
        return isTextDeclaration(name, property) && lightness(color) >= 0.85
      })
    })
    // A block that paints a tint: its accent text and (with `tinted-blocks`) its greys flip with the tint. Unless it
    // also lays a translucent light surface over a colour another block sets, which does not flip.
    // The block's tints, including the light half of a pair a first run already wrote, so a second run themes what
    // the first one left. Their dark halves are what accent text in the block has to read on.
    const tints = [...body.matchAll(DECLARATION)]
      .filter(([, name]) => !isTextDeclaration(name, propertyOf(name)))
      .flatMap(([, , , value]) => [...literalColors(value), lightHalf(value) ?? ''])
      .map((literal) => parseColor(literal))
      .filter((color): color is [number, number, number, number] => !!color && isTint(color))
    const tinted = tints.length > 0
    const textBackgrounds = [dark.surface, ...tints.map((color) => darkTint(color, dark))]
    const translucentLight = [...body.matchAll(DECLARATION)].some(
      ([, name, , value]) =>
        /background/.test(propertyOf(name)) &&
        literalColors(value).some((literal) => {
          const color = parseColor(literal)
          return !!color && color[3] < 1 && lightness(color) >= 0.85
        }),
    )
    if (accentSurface || darkSurface || (tinted && translucentLight)) {
      literal += (body.match(COLOR) ?? []).length
      return block
    }
    const themeNeutrals = neutrals === 'all' || tinted
    const next = body.replace(DECLARATION, (declaration, name: string, colon: string, value: string) => {
      if (value.includes('var(') || value.includes('color-mix(') || value.includes('light-dark(')) return declaration
      const property = propertyOf(name)
      return `${name}${colon}${value.replace(COLOR, (match) => {
        const color = parseColor(match)
        // A theme role's exact value stays that role, so an app's own tokens restyle it; a tint is only paired when
        // no role owns it.
        const roles = byValue.get(normalizeColor(match)) ?? []
        const token = themeNeutrals || (color && isTint(color)) ? pickToken(property, roles) : undefined
        if (token) {
          themed++
          return `var(${token}, ${match})`
        }
        if (color && isTint(color) && !isTextDeclaration(name, property)) {
          themed++
          return lightDark(match, darkTint(color, dark))
        }
        if (color && color[3] === 1 && isNeutral(color) && themeNeutrals) {
          themed++
          return mixNeutral(color)
        }
        if (color && tinted && isAccentText(color) && isTextDeclaration(name, property)) {
          themed++
          return lightDark(match, darkText(color, textBackgrounds, dark))
        }
        literal++
        return match
      })}`
    })
    return `{${next}}`
  })
  return { css: out, themed, literal }
}
