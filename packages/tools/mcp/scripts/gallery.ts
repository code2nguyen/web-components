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

/**
 * Rewrites every colour literal equal to a token's light value as `var(--c2-theme--<token>, <literal>)`, choosing the
 * token by the property the variable sets. Under the default light theme the card renders exactly as authored; with
 * an application's tokens, or in dark mode, it follows them. Colours no token owns (accents such as a Tailwind blue)
 * stay literal: they are the card's deliberate choice.
 */
export function themeExampleCss(css: string, tokens: ThemeColor[]): { css: string; themed: number; literal: number } {
  const byValue = new Map<string, string[]>()
  for (const token of tokens) if (token.light) byValue.set(normalizeColor(token.light), [...(byValue.get(normalizeColor(token.light)) ?? []), token.name])
  let themed = 0
  let literal = 0
  const out = css.replace(/(--c2-[a-z0-9_-]+)(\s*:\s*)([^;}]+)/g, (declaration, name: string, colon: string, value: string) => {
    if (value.includes('var(')) return declaration
    const property = parseCssVarName(name)?.property ?? ''
    const next = value.replace(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi, (color) => {
      const token = pickToken(property, byValue.get(normalizeColor(color)) ?? [])
      if (!token) {
        literal++
        return color
      }
      themed++
      return `var(${token}, ${color})`
    })
    return `${name}${colon}${next}`
  })
  return { css: out, themed, literal }
}
