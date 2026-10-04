/**
 * Component-level shorthand variables.
 *
 * A component may document a shorthand such as `--c2-details--border` behind its per-side variables
 * (`css.cssVar(border-top, border)` → `var(--c2-details--border-top, var(--c2-details--border, <default>))`), so a
 * consumer can set one variable instead of four. If the base theme then wrote every per-side variable at
 * `:root`/`:host`, the per-side value would always be set and the shorthand would never be consulted. So a per-side
 * variable whose stylesheet falls back to its shorthand, and which the classifier maps to exactly the value it maps
 * the shorthand to, is left out of `base.css`: it falls through to the shorthand, which follows the token. A per-side
 * variable the consumer sets still wins, and one with a value of its own (a different default) is still written.
 */
import type { ClassifiedVar } from './emit.ts'

/** Shorthand CSS property → the longhands a component may expose as separate variables behind it. */
export const LONGHANDS: Record<string, string[]> = {
  border: ['border-top', 'border-right', 'border-bottom', 'border-left'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
}

const SHORTHAND_OF = new Map(
  Object.entries(LONGHANDS).flatMap(([shorthand, longhands]) => longhands.map((longhand): [string, string] => [longhand, shorthand])),
)

/** The shorthand variable a longhand variable would fall back to: same component, part and state, shorthand property. */
export function shorthandName(name: string, property: string): string | undefined {
  const shorthand = SHORTHAND_OF.get(property)
  if (!shorthand || !name.endsWith(`--${property}`)) return undefined
  return `${name.slice(0, -property.length)}${shorthand}`
}

/**
 * Longhand variable name → the shorthand variable that covers it in the base theme. Requires all three of: the
 * shorthand is documented by the same package, the built stylesheet falls back from the longhand to it, and both
 * are mapped to the same emitted value (so leaving the longhand out changes nothing under the theme).
 */
export function coveredByShorthand(classified: ClassifiedVar[], chains: Map<string, Set<string>>): Map<string, string> {
  const byName = new Map(classified.map((entry) => [entry.cssVar.name, entry]))
  const covered = new Map<string, string>()
  for (const { cssVar, result } of classified) {
    if (result.kind !== 'mapped') continue
    const shorthand = shorthandName(cssVar.name, cssVar.property)
    if (!shorthand || !chains.get(cssVar.name)?.has(shorthand)) continue
    const target = byName.get(shorthand)
    if (!target || target.cssVar.pkg !== cssVar.pkg || target.result.kind !== 'mapped' || target.result.value !== result.value) continue
    covered.set(cssVar.name, shorthand)
  }
  return covered
}
