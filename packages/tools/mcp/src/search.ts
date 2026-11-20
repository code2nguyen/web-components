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
  /** The component's intent sharing the most of the query's words, when one shares any: why it was found. */
  intent?: string
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
}

/**
 * Words that make a query about an icon or an illustration. Only then, or when the query is itself an icon's name
 * (`trash`, `chevron-down`), are the icon sets' names searched: they hold over two thousand names (`user`, `bell`,
 * `calendar`, `lock`), so a plain requirement matched some icon by chance and put an icon set above the component it
 * needed. Not `arrow`: "arrow keys" is keyboard navigation, and an arrow icon is asked for as one.
 */
const ICON_WORDS = new Set(['emoji', 'glyph', 'glyphs', 'icon', 'icons', 'illustration', 'illustrations', 'pictogram', 'pictograms', 'symbol', 'symbols'])

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
 * its best field: what the component is (title, id, tag) weighs most, then the names developers use for it
 * (keywords), what it is for (description, intro, intents), its icons (only for a query about icons) and category, and only then its API and examples. Summing every attribute, slot and event a term hits made
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
  // The query as a word sequence, so a several-word name ("right click", "segmented control") can match as a phrase.
  const sequence = ` ${tokens(query).map(stem).join(' ')} `
  // A bare icon name is an icon query unless it also names a component: "trash" is, "pie chart" and "terminal" are not.
  const bare = nameKey(query)
  const names = nameSets(registry)
  const iconQuery = all.some((t) => ICON_WORDS.has(t)) || (names.icons.has(bare) && !names.components.has(bare))
  const scored: { component: ComponentEntry; best: Map<string, number>; matches: Set<string>; breadth: number }[] = []
  for (const component of Object.values(registry.components)) {
    const best = new Map<string, number>()
    const matches = new Set<string>()
    let breadth = 0
    for (const { label, haystack, stems, weight } of componentFields(component)) {
      if (!iconQuery && label.startsWith('icon:')) continue
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
    if (best.size > 0) scored.push({ component, best, matches, breadth })
  }
  // A word most components match ("show", "user", "list") tells little about which one is meant; a rare one ("faq",
  // "kebab") tells a lot. Each term is weighted by how few components it matches, so a long requirement written in
  // plain words is not won by the longest description.
  const total = Object.keys(registry.components).length
  const rarity = new Map(terms.map((term) => [term, Math.log(1 + total / Math.max(1, scored.filter((s) => s.best.has(term)).length))]))
  // Over the words some component matched: a word nothing matches would weigh the most and inflate the phrase bonus.
  const matched = terms.filter((term) => scored.some((s) => s.best.has(term)))
  const meanRarity = matched.reduce((sum, term) => sum + rarity.get(term)!, 0) / Math.max(1, matched.length)
  const hits: SearchHit[] = []
  for (const { component, best, matches, breadth } of scored) {
    // A name of several words found verbatim in the query says more than its words scattered over a description.
    const phrase = phrases(component, iconQuery).some((p) => sequence.includes(p)) ? 8 * meanRarity : 0
    const coverage = 0.5 + (0.5 * best.size) / terms.length
    // The query names the component outright ("tree", "modal dialog", "filter chips"): it leads its family.
    const named = tokens(component.id).every((t) => roots.has(stem(t))) ? 1.25 : 1
    const weighted = [...best].reduce((sum, [term, v]) => sum + v * (rarity.get(term) ?? 1), 0)
    const relevance = (weighted + phrase) * coverage * named
    // Breadth is a tie-breaker worth less than one weak field match, however large the API.
    const score = relevance + Math.min(breadth, 20) / 20
    const intent = matches.has('intents') ? bestIntent(component, terms, rarity) : undefined
    hits.push({ component, score, matches: [...(phrase ? ['phrase'] : []), ...matches].slice(0, 6), ...(intent ? { intent } : {}) })
  }
  return hits.sort((a, b) => b.score - a.score || a.component.title.localeCompare(b.component.title)).slice(0, limit)
}

/** The intent sharing the most of the query's words, rare words counting more. */
function bestIntent(component: ComponentEntry, terms: string[], rarity: Map<string, number>): string | undefined {
  let best: string | undefined
  let bestScore = 0
  for (const intent of component.intents ?? []) {
    const haystack = tokens(intent)
    const stems = haystack.map(stem)
    const score = terms.reduce((sum, term) => sum + (termMatch(haystack, term, stems) ? (rarity.get(term) ?? 1) : 0), 0)
    if (score > bestScore) [best, bestScore] = [intent, score]
  }
  return best
}

const nameCache = new WeakMap<Registry, { icons: Set<string>; components: Set<string> }>()

/**
 * A name with only the plural folded, so "star" is the keyword "stars" and "sliders" the component "slider". Not the
 * full stem: that made "book" the keyword "booking" and "selection" the component "select".
 */
function nameKey(name: string): string {
  return tokens(name)
    .map((t) => (t.length > 3 ? t.replace(/s$/, '') : t))
    .join('-')
}

/** Every icon name of the registry's icon sets, and every name of a component (id, title, keywords), as `nameKey` writes them. */
function nameSets(registry: Registry): { icons: Set<string>; components: Set<string> } {
  let names = nameCache.get(registry)
  if (!names) {
    const all = Object.values(registry.components)
    names = {
      icons: new Set(all.flatMap((c) => (c.icons ?? []).map(nameKey))),
      components: new Set(all.flatMap((c) => [c.id, c.title, ...(c.keywords ?? [])].map(nameKey))),
    }
    nameCache.set(registry, names)
  }
  return names
}

const phraseCache = new WeakMap<ComponentEntry, { names: string[]; icons: string[] }>()

/**
 * The component's names of two words or more (title and keywords; icon names too for a query about icons), stemmed and
 * padded for a whole-word `includes`.
 */
function phrases(component: ComponentEntry, withIcons: boolean): string[] {
  let cached = phraseCache.get(component)
  if (!cached) {
    const padded = (list: string[]) =>
      list
        .map((name) => tokens(name).map(stem))
        .filter((words) => words.length >= 2)
        .map((words) => ` ${words.join(' ')} `)
    cached = { names: padded([component.title, ...(component.keywords ?? [])]), icons: padded(component.icons ?? []) }
    phraseCache.set(component, cached)
  }
  return withIcons ? [...cached.names, ...cached.icons] : cached.names
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
    ['keywords', (component.keywords ?? []).join(' '), 8],
    ['description', `${component.description} ${component.intro ?? ''}`, 5],
    // What the component is for, worded as a requirement: it reaches requirements that name the need, not the widget.
    ['intents', (component.intents ?? []).join(' '), 5],
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
