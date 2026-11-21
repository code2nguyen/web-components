/**
 * AI readiness score: how well an AI agent, given only what c2n ships to it (the MCP registry, the component manifests,
 * the framework declarations), can find a component for a need, understand its API, write valid code and use it right.
 *
 * Every component is scored on six dimensions, each made of deterministic checks scored 0–1. A check that does not
 * apply (a component with no events has nothing to describe) is left out of its dimension instead of counting as a pass,
 * and a dimension with no applicable check scores full marks. The dimension weights add up to 100.
 *
 * Pure functions over a `Sources` object, so the unit tests can stub the file system.
 */
import { PLACEHOLDER_INTENT } from '../frontmatter.ts'
import { readFileSync } from 'node:fs'
import { searchComponents } from '../../src/search.ts'
import { validateMarkup } from '../../src/lib/validate.ts'
import { COMPONENT_MAX_CHARS, COMPONENT_SECTIONS, renderComponentFitted } from '../../src/render.ts'
import type { ComponentEntry, ElementEntry, Example, Registry } from '../../src/registry-types.ts'

export type DimensionId = 'identity' | 'api' | 'examples' | 'composition' | 'framework' | 'validation'

export const DIMENSIONS: { id: DimensionId; label: string; weight: number; question: string }[] = [
  { id: 'identity', label: 'Identity and purpose', weight: 15, question: 'Does the AI understand what the component does and when to use it?' },
  { id: 'api', label: 'API documentation', weight: 25, question: 'Are properties, types, defaults, slots, events and CSS variables documented?' },
  { id: 'examples', label: 'Usage examples', weight: 20, question: 'Are there valid, realistic code examples covering the API?' },
  { id: 'composition', label: 'Composition knowledge', weight: 15, question: 'Does the AI understand compatible children, slots and related components?' },
  { id: 'framework', label: 'Framework integration', weight: 15, question: 'Does it know how to import, configure and use the component in each framework?' },
  { id: 'validation', label: 'Validation', weight: 10, question: 'Can generated usage be checked against the real API and compiled?' },
]

export interface Sources {
  /** Text of the package's generated `react.d.ts` / `vue.d.ts`, or null when it has none. */
  frameworkFile(pkg: string, framework: 'react' | 'vue'): string | null
  /** Tags the Angular adapter supplies a ControlValueAccessor for. */
  angularTags: Set<string>
  /** Tags declared in an `HTMLElementTagNameMap` of the package's emitted declarations. */
  declaredTags(pkg: string): Set<string>
}

export interface Check {
  id: string
  label: string
  /** 0–1. */
  score: number
  weight: number
  /** What is missing, for the report; empty when the check passes. */
  detail?: string
}

export interface DimensionResult {
  id: DimensionId
  label: string
  weight: number
  /** 0–1. */
  score: number
  points: number
  checks: Check[]
}

export interface ComponentReadiness {
  id: string
  title: string
  category: string
  package: string
  /** 0–100. */
  score: number
  grade: string
  dimensions: DimensionResult[]
}

export function grade(score: number): string {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
}

const words = (text = '') => text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length
const described = (text?: string) => words(text) >= 3
const typed = (type?: string) => !!type && type.trim() !== '' && type !== 'unknown' && type !== 'any'

/** Share of `items` passing `test`, as a check; undefined (not applicable) when there is nothing to test. */
function share<T>(id: string, label: string, weight: number, items: T[], test: (item: T) => boolean, name: (item: T) => string): Check | undefined {
  if (items.length === 0) return undefined
  const failing = items.filter((i) => !test(i))
  return {
    id,
    label,
    weight,
    score: 1 - failing.length / items.length,
    detail: failing.length
      ? `${failing.length}/${items.length} missing: ${failing.slice(0, 6).map(name).join(', ')}${failing.length > 6 ? ', …' : ''}`
      : undefined,
  }
}

function check(id: string, label: string, weight: number, score: number, detail?: string): Check {
  return { id, label, weight, score: Math.max(0, Math.min(1, score)), detail: score >= 1 ? undefined : detail }
}

/**
 * A slot the author never fills by hand in a page: assigned by the component, kept for compatibility, or server-rendered
 * content hidden once the element upgrades. Its description tells an agent all it needs; a gallery card cannot show it.
 */
/**
 * Standard CSS property names, from the `mdn-data` the CSS tooling installs. Without it every variable counts as one
 * that needs a description.
 */
const STANDARD_PROPERTIES: Set<string> = (() => {
  try {
    const file = new URL('../../../../../node_modules/mdn-data/css/properties.json', import.meta.url)
    return new Set(Object.keys(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>))
  } catch {
    return new Set()
  }
})()

const UNWRITTEN = /no `slot` attribute needed|retained for compatibility|server-rendered/i

/** Small content elements that go in any slot, as buttons and icons do: nesting one is not composition to document. */
const CONTENT_TAGS = new Set(['c2-badge', 'c2-avatar', 'c2-avatar-group', 'c2-kbd', 'c2-separator', 'c2-link-button', 'c2-status-light'])

/** Every element tag of an npm package, over all the docs pages that document it. */
function packageTags(registry: Registry, pkg: string): string[] {
  return Object.values(registry.components)
    .filter((component) => component.package === pkg)
    .flatMap((component) => component.elements.map((element) => element.tag))
}

/** `c2-*` tags written in an example. */
export function exampleTags(example: Example): string[] {
  return example.tags ?? [...new Set([...example.html.matchAll(/<(c2-[a-z0-9-]+)/g)].map((m) => m[1]))]
}

/** `c2-*` tags written inside an element of `own` in `html` (other than `own` tags themselves). */
export function nestedTags(html: string, own: Set<string>): string[] {
  const found = new Set<string>()
  const pattern = /<(\/?)(c2-[a-z0-9-]+)\b[^>]*?(\/?)>/g
  let depth = 0
  for (const m of html.matchAll(pattern)) {
    const [, close, tag, selfClosing] = m
    if (own.has(tag)) {
      if (close) depth = Math.max(0, depth - 1)
      else if (!selfClosing) depth++
    } else if (depth > 0 && !close) found.add(tag)
  }
  return [...found]
}

function usesAttribute(html: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<c2-[^>]*\\s${escaped}(?=[\\s=>/])`, 'i').test(html)
}

export function isFormControl(element: ElementEntry): boolean {
  const names = new Set(element.attributes.map((a) => a.name))
  // The rule of `formControlModel()` in framework-types, which decides who gets an accessor: a `name`, a `value` or
  // `checked`, and an `input` or `change` event. A button has a name and a value but is no value control.
  return names.has('name') && (names.has('value') || names.has('checked')) && element.events.some((e) => e.name === 'input' || e.name === 'change')
}

/** Rank (1-based) of `id` when the registry is searched for `query`, or Infinity. */
export function searchRank(registry: Registry, query: string, ids: string[], limit = 10): number {
  const hits = searchComponents(registry, query, limit)
  const index = hits.findIndex((h) => ids.includes(h.component.id))
  return index < 0 ? Infinity : index + 1
}

/** The component's description with its own names removed: what an agent knows of the need, not the answer. */
export function needFromDescription(component: ComponentEntry): string {
  const own = new Set(
    `${component.title} ${component.id} ${component.elements.map((e) => e.tag).join(' ')}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && t !== 'c2'),
  )
  return component.description
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !own.has(w.toLowerCase()))
    .join(' ')
}

// ---------------------------------------------------------------------------------------------------------------------

function identity(registry: Registry, c: ComponentEntry): Check[] {
  const elementText = c.elements[0]?.description ?? ''
  const rank = searchRank(registry, needFromDescription(c), [c.id])
  // The generator's `TODO:` placeholders count as missing (build-registry drops them too; a stale registry may not).
  const written = (c.intents ?? []).filter((intent) => !PLACEHOLDER_INTENT.test(intent)).length
  return [
    check(
      'description',
      'One-line description says what it is',
      2,
      words(c.description) >= 8 ? 1 : words(c.description) >= 4 ? 0.5 : 0,
      'description shorter than 8 words',
    ),
    check(
      'when-to-use',
      'Explains how it works and when to use it',
      2,
      Math.max(words(c.intro), words(elementText)) >= 25 ? 1 : 0,
      'no intro or element description of 25+ words',
    ),
    share(
      'element-descriptions',
      'Every element has a description',
      2,
      c.elements,
      (e) => words(e.description) >= 5,
      (e) => e.tag,
    )!,
    // What it is for, worded as a requirement: a held-out benchmark found these reach new wording that keywords miss.
    check(
      'intents',
      'Intents say what it is for, worded as requirements',
      2,
      written >= 3 ? 1 : written > 0 ? 0.5 : 0,
      `${written} intent(s) written in the docs frontmatter (want 3–5)`,
    ),
    check(
      'distinguishable',
      'Found by search from its need (description minus its own name)',
      3,
      rank <= 3 ? 1 : rank <= 10 ? 0.5 : 0,
      rank === Infinity ? 'not in the top 10 for its own description' : `ranked #${rank} for its own description`,
    ),
  ].filter(Boolean)
}

function api(c: ComponentEntry): Check[] {
  const attributes = c.elements.flatMap((e) => e.attributes.map((a) => ({ ...a, tag: e.tag })))
  const events = c.elements.flatMap((e) => e.events.map((v) => ({ ...v, tag: e.tag })))
  const slots = c.elements.flatMap((e) => e.slots.map((s) => ({ ...s, tag: e.tag })))
  const css = c.elements.flatMap((e) => e.cssProperties.map((p) => ({ ...p, tag: e.tag })))
  // What `get_component` serves: the registry's script-only API, not the manifest an agent never reads.
  const script = c.elements.flatMap((e) => (e.scriptApi ?? []).map((m) => ({ ...m, tag: e.tag })))
  const props = script.filter((m) => m.kind === 'property')
  const methods = script.filter((m) => m.kind === 'method')
  // `get_component` answers in one response: shortened when long, cut when even the shortest form does not fit.
  const answer = renderComponentFitted(c, { include: new Set(COMPONENT_SECTIONS), installed: null })
  const shortened = answer.includes('_Shortened to fit one response')
  const fits = answer.length <= COMPONENT_MAX_CHARS
  const checks = [
    check(
      'fits',
      'get_component answers in full in one response',
      1.5,
      !fits ? COMPONENT_MAX_CHARS / answer.length : shortened ? 0.5 : 1,
      !fits ? `${answer.length} characters even shortened: cut at ${COMPONENT_MAX_CHARS}` : 'shortened to fit: descriptions or CSS tables left out',
    ),
    share(
      'attributes-described',
      'Attributes described',
      3,
      attributes,
      (a) => described(a.description),
      (a) => a.name,
    ),
    share(
      'attributes-typed',
      'Attributes typed',
      2,
      attributes,
      (a) => typed(a.type),
      (a) => a.name,
    ),
    share(
      'attributes-defaults',
      'Attribute defaults stated',
      1,
      attributes,
      (a) => a.default !== undefined || /\|\s*undefined|\?$/.test(a.type),
      (a) => a.name,
    ),
    share(
      'properties-described',
      'Property-only API described (renderers, data sources)',
      2,
      props,
      (p) => described(p.description),
      (p) => p.name,
    ),
    share(
      'properties-typed',
      'Property-only API typed',
      1,
      props,
      (p) => typed(p.type),
      (p) => p.name,
    ),
    share(
      'methods-described',
      'Public methods described',
      1,
      methods,
      (m) => described(m.description),
      (m) => `${m.name}()`,
    ),
    share(
      'events-described',
      'Events described',
      2,
      events,
      (e) => described(e.description),
      (e) => e.name,
    ),
    share(
      'events-typed',
      'Event detail typed',
      1,
      events,
      (e) => typed(e.type),
      (e) => e.name,
    ),
    share(
      'slots-described',
      'Slots described',
      1.5,
      slots,
      (s) => described(s.description),
      (s) => s.name || '(default)',
    ),
    // A variable named after a CSS property says what it sets (`__header__hover--background-color`), and get_component
    // groups it by part and state: only a name that is not one (`--size`, `--token-keyword`, `--visible-rows`) needs words.
    share(
      'css-described',
      'CSS variables whose name is not a CSS property are described',
      0.75,
      css.filter((p) => !STANDARD_PROPERTIES.has(p.property)),
      (p) => described(p.description),
      (p) => p.name,
    ),
  ]
  return checks.filter((x): x is Check => !!x)
}

function examples(c: ComponentEntry): Check[] {
  const usage = c.examples.filter((e) => e.kind === 'usage')
  const all = c.examples.filter((e) => e.kind !== 'preview')
  const html = all.map((e) => e.html).join('\n')
  const shown = new Set(all.flatMap(exampleTags))
  const attributes = c.elements.flatMap((e) => e.attributes.map((a) => a.name)).filter((n, i, list) => list.indexOf(n) === i)
  const coverage = attributes.length ? attributes.filter((a) => usesAttribute(html, a)).length / attributes.length : 1
  const uncovered = attributes.filter((a) => !usesAttribute(html, a))
  return [
    check('usage', 'Usage examples in the docs', 3, usage.length >= 3 ? 1 : usage.length * 0.3, `${usage.length} usage example(s)`),
    check('gallery', 'Gallery of styled variants', 1.5, c.hasGallery ? 1 : 0, 'no gallery page'),
    share(
      'elements-shown',
      'Every element appears in an example',
      2,
      c.elements.filter((e) => !e.tag.includes('{name}')),
      (e) => shown.has(e.tag),
      (e) => e.tag,
    ),
    // Half the attributes demonstrated is a well-covered API: the rest are read from the API table.
    attributes.length
      ? check(
          'attributes-shown',
          'Attributes demonstrated in examples',
          2,
          coverage / 0.6,
          `${Math.round(coverage * 100)}% shown; not: ${uncovered.slice(0, 6).join(', ')}`,
        )
      : undefined,
  ].filter((x): x is Check => !!x)
}

function composition(registry: Registry, c: ComponentEntry): Check[] {
  const all = c.examples.filter((e) => e.kind !== 'preview')
  const html = all.map((e) => e.html).join('\n')
  // A slot family named by pattern (`detail-<row>`) has no one name to show.
  const named = c.elements.flatMap((e) =>
    e.slots
      .filter((s) => s.name && s.name !== 'default' && !/[<{]/.test(s.name) && !UNWRITTEN.test(s.description ?? ''))
      .map((s) => ({ tag: e.tag, name: s.name })),
  )
  const own = new Set(c.elements.map((e) => e.tag))
  // Components the examples put inside this one: its children and slotted content, not the layout around it.
  // Buttons, icons and small content elements are generic slot content (an `actions` slot holds a `c2-button`): no
  // component's docs need to name them. What counts is a specific child, such as `c2-list-item` in `c2-select`.
  const generic = (tag: string) => CONTENT_TAGS.has(tag) || ['Buttons', 'Icons'].includes(registry.components[registry.tagIndex[tag]]?.category ?? '')
  const foreign = [...new Set(all.flatMap((e) => nestedTags(e.html, own)))].filter((t) => registry.tagIndex[t] && registry.tagIndex[t] !== c.id && !generic(t))
  const known = new Set([...c.composition.internal, ...c.composition.slotted])
  const text = `${c.description} ${c.intro ?? ''} ${c.elements.map((e) => `${e.description} ${e.slots.map((s) => s.description ?? '').join(' ')}`).join(' ')}`
  const children = c.elements.slice(1)
  const checks = [
    share(
      'slots-shown',
      'Named slots used in an example',
      3,
      named,
      (s) => new RegExp(`slot=["']${s.name}["']`).test(html),
      (s) => `${s.tag}[${s.name}]`,
    ),
    children.length
      ? share(
          'children-linked',
          'Child elements say what they belong to',
          2,
          children,
          // A child several pages share (`c2-chart-legend` on every chart page) may name any element of its package.
          (child) =>
            [...own, ...packageTags(registry, c.package)].some((t) => t !== child.tag && child.description.includes(t)) ||
            c.elements[0].description.includes(child.tag),
          (e) => e.tag,
        )
      : undefined,
    share(
      'related-documented',
      'Other components it is shown with are named in its docs',
      2,
      foreign,
      (t) => known.has(t) || text.includes(t),
      (t) => t,
    ),
    share(
      'parts-described',
      'CSS parts described',
      1,
      c.elements.flatMap((e) => e.cssParts),
      (p) => described(p.description),
      (p) => p.name,
    ),
  ]
  return checks.filter((x): x is Check => !!x)
}

function framework(c: ComponentEntry, sources: Sources): Check[] {
  const tags = c.elements.map((e) => e.tag).filter((t) => !t.includes('{name}'))
  const react = sources.frameworkFile(c.package, 'react')
  const vue = sources.frameworkFile(c.package, 'vue')
  const declared = sources.declaredTags(c.package)
  const forms = c.elements.filter(isFormControl)
  return [
    // Icon sets install on their own; every other component should be reachable from the `@c2n/components` bundle.
    check(
      'install',
      'Install and import lines',
      2,
      (c.install.npm && c.install.import ? 0.5 : 0) + (c.install.umbrella || c.category === 'Icons' ? 0.5 : 0),
      c.install.import ? 'not in @c2n/components' : 'no install or import line',
    ),
    tags.length
      ? share(
          'react-types',
          'React JSX types',
          2,
          tags,
          (t) => !!react?.includes(`'${t}'`),
          (t) => t,
        )
      : undefined,
    tags.length
      ? share(
          'vue-types',
          'Vue component types',
          2,
          tags,
          (t) => !!vue?.includes(`'${t}'`),
          (t) => t,
        )
      : undefined,
    share(
      'angular-forms',
      'Angular form binding (ControlValueAccessor)',
      1.5,
      forms,
      (e) => sources.angularTags.has(e.tag),
      (e) => e.tag,
    ),
    tags.length
      ? share(
          'tag-map',
          'Declared in HTMLElementTagNameMap (TypeScript)',
          1.5,
          tags,
          (t) => declared.has(t),
          (t) => t,
        )
      : undefined,
  ].filter((x): x is Check => !!x)
}

function validation(registry: Registry, c: ComponentEntry): Check[] {
  const all = c.examples.filter((e) => e.kind !== 'preview')
  const results = all.map((e) => ({ example: e, findings: validateMarkup(registry, `${e.html}${e.css ? `\n<style>${e.css}</style>` : ''}`).findings }))
  const elements = c.elements.filter((e) => !e.tag.includes('{name}'))
  return [
    share(
      'examples-valid',
      'Examples pass validate_markup without errors',
      3,
      results,
      (r) => !r.findings.some((f) => f.severity === 'error'),
      (r) => `${r.example.label}: ${r.findings.find((f) => f.severity === 'error')?.message.split('.')[0]}`,
    ),
    share(
      'examples-clean',
      'Examples pass without warnings',
      1,
      results,
      (r) => r.findings.length === 0,
      (r) => `${r.example.label}: ${r.findings[0]?.message.split('.')[0]}`,
    ),
    share(
      'properties-known',
      'Validator knows its properties (property bindings checkable)',
      1,
      elements,
      (e) => (e.properties?.length ?? 0) > 0,
      (e) => e.tag,
    ),
  ].filter((x): x is Check => !!x)
}

function dimension(id: DimensionId, checks: Check[]): DimensionResult {
  const meta = DIMENSIONS.find((d) => d.id === id)!
  const total = checks.reduce((sum, c) => sum + c.weight, 0)
  const score = total ? checks.reduce((sum, c) => sum + c.score * c.weight, 0) / total : 1
  return { id, label: meta.label, weight: meta.weight, score, points: score * meta.weight, checks }
}

export function scoreComponent(registry: Registry, c: ComponentEntry, sources: Sources): ComponentReadiness {
  const dimensions = [
    dimension('identity', identity(registry, c)),
    dimension('api', api(c)),
    dimension('examples', examples(c)),
    dimension('composition', composition(registry, c)),
    dimension('framework', framework(c, sources)),
    dimension('validation', validation(registry, c)),
  ]
  const score = Math.round(dimensions.reduce((sum, d) => sum + d.points, 0) * 10) / 10
  return { id: c.id, title: c.title, category: c.category, package: c.package, score, grade: grade(score), dimensions }
}

// ---------------------------------------------------------------------------------------------------------------------
// Discovery benchmark

export interface Task {
  id: string
  requirement: string
  expect: string[]
  tags?: string[]
  attributes?: string[]
}

export interface TaskResult {
  id: string
  requirement: string
  expect: string[]
  /** Rank of the best expected component, 1-based; null when not in the top 10. */
  rank: number | null
  /** Rank of the preferred (first) expected component. */
  preferredRank: number | null
  top: string[]
}

export interface DiscoveryResult {
  tasks: TaskResult[]
  hitAt1: number
  hitAt3: number
  /** Mean reciprocal rank, 0–1. */
  mrr: number
  /** 0–100: the MRR as a score. */
  score: number
}

export function runDiscovery(registry: Registry, tasks: Task[]): DiscoveryResult {
  const results = tasks.map((task): TaskResult => {
    const hits = searchComponents(registry, task.requirement, 10).map((h) => h.component.id)
    const ranks = task.expect.map((id) => hits.indexOf(id)).filter((i) => i >= 0)
    const preferred = hits.indexOf(task.expect[0])
    return {
      id: task.id,
      requirement: task.requirement,
      expect: task.expect,
      rank: ranks.length ? Math.min(...ranks) + 1 : null,
      preferredRank: preferred >= 0 ? preferred + 1 : null,
      top: hits.slice(0, 3),
    }
  })
  const n = results.length || 1
  const hitAt1 = results.filter((r) => r.rank === 1).length / n
  const hitAt3 = results.filter((r) => r.rank !== null && r.rank <= 3).length / n
  const mrr = results.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / n
  return { tasks: results, hitAt1, hitAt3, mrr, score: Math.round(mrr * 1000) / 10 }
}
