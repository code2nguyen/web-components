/** Tokenised scoring over component names, descriptions, attributes, slots, example labels and icon names. */
import type { ComponentEntry, Registry } from './registry-types.ts'

export interface SearchHit {
  component: ComponentEntry
  score: number
  matches: string[]
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
}

export function searchComponents(registry: Registry, query: string, limit = 10): SearchHit[] {
  const terms = tokens(query)
  if (terms.length === 0) return []
  const hits: SearchHit[] = []
  for (const component of Object.values(registry.components)) {
    let score = 0
    const matches = new Set<string>()
    const fields: [string, string, number][] = [
      ['title', component.title, 6],
      ['id', component.id, 6],
      ['tag', component.elements.map((e) => e.tag).join(' '), 6],
      ['description', `${component.description} ${component.intro ?? ''}`, 3],
      ['category', component.category, 2],
    ]
    for (const element of component.elements) {
      for (const a of element.attributes) fields.push([`attr:${a.name}`, `${a.name} ${a.description ?? ''}`, 2])
      for (const s of element.slots) fields.push([`slot:${s.name || 'default'}`, `${s.name} ${s.description ?? ''}`, 2])
      for (const e of element.events) fields.push([`event:${e.name}`, `${e.name} ${e.description ?? ''}`, 2])
    }
    for (const ex of component.examples) if (ex.kind !== 'preview') fields.push([`example:${ex.label}`, `${ex.label} ${ex.section ?? ''}`, 1])
    for (const icon of component.icons ?? []) fields.push([`icon:${icon}`, icon, 3])
    for (const [label, text, weight] of fields) {
      const haystack = tokens(text)
      for (const term of terms) {
        if (haystack.some((h) => h === term)) {
          score += weight * 2
          matches.add(label)
        } else if (haystack.some((h) => h.includes(term) || term.includes(h))) {
          score += weight
          matches.add(label)
        }
      }
    }
    if (score > 0) hits.push({ component, score, matches: [...matches].slice(0, 6) })
  }
  return hits.sort((a, b) => b.score - a.score || a.component.title.localeCompare(b.component.title)).slice(0, limit)
}
