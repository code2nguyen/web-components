/** Loads `data/registry.json` and resolves tags / packages / ids to components. */
import { readFileSync } from 'node:fs'
import type { ComponentEntry, ElementEntry, Registry } from './registry-types.ts'

export function loadRegistry(): Registry {
  const url = new URL('../data/registry.json', import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8')) as Registry
}

export interface ResolvedElement {
  component: ComponentEntry
  element: ElementEntry
  /** Concrete tag (`c2-feather-arrow-right`), even when the element entry carries a pattern. */
  tag: string
  /** Concrete module (`@c2n/feather-icons/icons/arrow-right.js`). */
  modulePath: string
  className: string
}

/** Accepts `c2-button`, `button`, `@c2n/button`, `c2-tab` or a concrete icon tag such as `c2-feather-arrow-right`. */
export function resolveElement(registry: Registry, input: string): ResolvedElement | undefined {
  const query = input.trim().toLowerCase()
  const byPackage = registry.packageIndex[query]
  const byTag = registry.tagIndex[query]
  const id = byPackage ?? byTag ?? (registry.components[query] ? query : registry.tagIndex[`c2-${query}`])
  if (id) {
    const component = registry.components[id]
    const element = component.elements.find((e) => e.tag === query) ?? component.elements[0]
    if (component.tagPattern && element.tag.includes('{name}')) {
      const name = component.icons?.[0] ?? 'name'
      return concreteIcon(component, element, name)
    }
    return { component, element, tag: element.tag, modulePath: element.modulePath, className: element.className }
  }
  // Icon tags: match a pattern such as `c2-feather-{name}`.
  for (const component of Object.values(registry.components)) {
    if (!component.tagPattern) continue
    const prefix = component.tagPattern.replace('{name}', '')
    if (query.startsWith(prefix) && component.icons?.includes(query.slice(prefix.length))) {
      return concreteIcon(component, component.elements[0], query.slice(prefix.length))
    }
  }
  return undefined
}

function concreteIcon(component: ComponentEntry, element: ElementEntry, name: string): ResolvedElement {
  const pascal = name
    .split('-')
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('')
  return {
    component,
    element,
    tag: element.tag.replace('{name}', name),
    modulePath: element.modulePath.replace('{name}', name),
    className: element.className.replace('{Name}', pascal),
  }
}

/** Closest names for "did you mean" hints. */
export function suggest(candidates: string[], input: string, max = 3): string[] {
  const needle = input.toLowerCase()
  const scored = candidates
    .map((c) => ({ c, score: c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase()) ? 2 : distance(c.toLowerCase(), needle) <= 4 ? 1 : 0 }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.c.localeCompare(b.c))
  return scored.slice(0, max).map((s) => s.c)
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}
