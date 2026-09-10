/** Groups flat CSS variables by part, then by state, for compact rendering. */
import type { CssProperty } from '../registry-types.ts'

export interface CssGroup {
  part: string
  states: { state: string; properties: CssProperty[] }[]
}

export function groupCssProperties(properties: CssProperty[]): CssGroup[] {
  const groups = new Map<string, Map<string, CssProperty[]>>()
  for (const property of properties) {
    const byState = groups.get(property.part) ?? new Map<string, CssProperty[]>()
    const state = property.state ?? ''
    byState.set(state, [...(byState.get(state) ?? []), property])
    groups.set(property.part, byState)
  }
  return [...groups.entries()].map(([part, byState]) => ({
    part,
    states: [...byState.entries()].map(([state, props]) => ({ state, properties: props })),
  }))
}
