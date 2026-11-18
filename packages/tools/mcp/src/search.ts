export interface ExampleHit {
  component: ComponentEntry
  example: Example
  score: number
}

/**
 * Search across every component's gallery for a look ("compact", "glass", "danger", "pill", "underline"): the card's
 * label and section weigh most, then its description and use case, then the component it belongs to.
 */
export function searchExamples(registry: Registry, query: string, limit = 12, only?: ComponentEntry): ExampleHit[] {
  const terms = tokens(query)
  if (terms.length === 0) return []
  const hits: ExampleHit[] = []
  for (const component of only ? [only] : Object.values(registry.components)) {
    for (const example of component.examples) {
      if (example.kind !== 'gallery') continue
      const fields: [string, number][] = [
        [`${example.label} ${example.section ?? ''}`, 4],
        [`${example.description ?? ''} ${example.useWhen ?? ''} ${example.accessibility ?? ''}`, 2],
        [`${component.title} ${component.id} ${(example.tags ?? []).join(' ')}`, 2],
      ]
      let score = 0
      let matched = 0
      for (const term of terms) {
        let best = 0
        for (const [text, weight] of fields) {
          const haystack = tokens(text)
          if (haystack.includes(term)) best = Math.max(best, weight * 2)
          else if (term.length > 2 && haystack.some((h) => h.startsWith(term) || (h.length > 3 && term.startsWith(h)))) best = Math.max(best, weight)
        }
        if (best) matched++
        score += best
      }
      // Cards matching more of the query outrank one term matched strongly.
      if (score > 0) hits.push({ component, example, score: score * matched })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.component.title.localeCompare(b.component.title)).slice(0, limit)
}

/** Tokenised scoring over component names, descriptions, attributes, slots, example labels and icon names. */
import type { ComponentEntry, Example, Registry } from './registry-types.ts'

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

const STOP_WORDS = new Set(['an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'the', 'to', 'with'])

/** A word without one common English ending, so "removable", "removed" and "remove" share `remov`. */
function stem(word: string): string {
  for (const suffix of ['able', 'ible', 'ing', 'ion', 'ed', 's'])
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length).replace(/e$/, '')
  return word.replace(/e$/, '')
}

/**
 * How well a query term matches the tokens of a text: 2 for the word itself, 1.5 for another form of it ("chips" and
 * "chip", "removable" and "removed"), 1 for a word it begins ("drop" in "dropdown"), else 0.
 */
function termMatch(haystack: string[], term: string, stems?: string[]): number {
  if (haystack.includes(term)) return 2
  if (term.length < 3) return 0
  const root = stem(term)
  if (haystack.some((h, i) => h.length > 2 && (stems ? stems[i] : stem(h)) === root)) return 1.5
  // A text word the term extends counts only when it is most of the term: "chip" for "chips", not "form" for "format".
  return haystack.some((h) => h.length > 2 && (h.startsWith(term) || (term.startsWith(h) && h.length * 4 >= term.length * 3))) ? 1 : 0
}

/**
 * Rank the components for a need ("empty state", "format currency"). Each query term scores once per component, by
 * its best field: what the component is (title, id, tag) weighs most, then what it is for (description, intro), its
 * icons and category, and only then its API and examples. Summing every attribute, slot and event a term hits made
 * the components with the largest API (the table family) outrank the one whose description names the need. A
 * component matching more of the query outranks one matching a single term strongly; the number of API fields
 * matched only breaks ties within that.
 */
export function searchComponents(registry: Registry, query: string, limit = 10): SearchHit[] {
  const all = [...new Set(tokens(query))]
  // "with", "no", "for" match every description; they count only when the query has nothing else.
  const meaningful = all.filter((t) => !STOP_WORDS.has(t))
  const terms = meaningful.length ? meaningful : all
  if (terms.length === 0) return []
  const roots = new Set(terms.map(stem))
  const hits: SearchHit[] = []
  for (const component of Object.values(registry.components)) {
    const best = new Map<string, number>()
    const matches = new Set<string>()
    let breadth = 0
    for (const { label, haystack, stems, weight } of componentFields(component)) {
      let hit = false
      for (const term of terms) {
        const quality = termMatch(haystack, term, stems)
        if (!quality) continue
        hit = true
        best.set(term, Math.max(best.get(term) ?? 0, weight * quality))
      }
      if (hit) {
        // An icon set holds hundreds of names: one matching icon tells as much as fifty.
        if (!label.startsWith('icon:')) breadth++
        matches.add(label)
      }
    }
    if (best.size === 0) continue
    const coverage = 0.5 + (0.5 * best.size) / terms.length
    // The query names the component outright ("tree", "modal dialog", "filter chips"): it leads its family.
    const named = tokens(component.id).every((t) => roots.has(stem(t))) ? 1.25 : 1
    const relevance = [...best.values()].reduce((sum, v) => sum + v, 0) * coverage * named
    // Breadth is a tie-breaker worth less than one weak field match, however large the API.
    const score = relevance + Math.min(breadth, 20) / 20
    hits.push({ component, score, matches: [...matches].slice(0, 6) })
  }
  return hits.sort((a, b) => b.score - a.score || a.component.title.localeCompare(b.component.title)).slice(0, limit)
}

interface Field {
  label: string
  haystack: string[]
  stems: string[]
  weight: number
}

/** The searchable fields of a component, tokenised once: a registry entry does not change while it is loaded. */
const fieldCache = new WeakMap<ComponentEntry, Field[]>()

function componentFields(component: ComponentEntry): Field[] {
  const cached = fieldCache.get(component)
  if (cached) return cached
  const fields: [string, string, number][] = [
    ['title', component.title, 8],
    ['id', component.id, 8],
    ['tag', component.elements.map((e) => e.tag).join(' '), 8],
    ['description', `${component.description} ${component.intro ?? ''}`, 5],
    ['category', component.category, 3],
  ]
  for (const icon of component.icons ?? []) fields.push([`icon:${icon}`, icon, 5])
  for (const element of component.elements) {
    for (const a of element.attributes) fields.push([`attr:${a.name}`, `${a.name} ${a.description ?? ''}`, 2])
    for (const s of element.slots) fields.push([`slot:${s.name || 'default'}`, `${s.name} ${s.description ?? ''}`, 2])
    for (const e of element.events) fields.push([`event:${e.name}`, `${e.name} ${e.description ?? ''}`, 2])
  }
  for (const ex of component.examples)
    if (ex.kind !== 'preview')
      fields.push([`example:${ex.label}`, `${ex.label} ${ex.section ?? ''} ${ex.description ?? ''} ${ex.useWhen ?? ''} ${ex.accessibility ?? ''}`, 1])
  const result = fields.map(([label, text, weight]) => {
    const haystack = tokens(text)
    return { label, haystack, stems: haystack.map(stem), weight }
  })
  fieldCache.set(component, result)
  return result
}
