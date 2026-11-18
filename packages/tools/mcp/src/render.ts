/** Compact markdown renderers for tool results. */
import { groupCssProperties } from './lib/group-css.ts'
import { importPath, typeText, UMBRELLA, type InstalledInfo } from './installed.ts'
import type { ComponentEntry, CssProperty, ElementEntry, Example, Registry, ThemeEntry } from './registry-types.ts'

export const MAX_CHARS = 12_000
/**
 * `get_component`'s own limit: one component's API reference, worth a little more room than a list. The largest
 * attribute tables (the table family, 60+ attributes) fit it once everything else is shortened.
 */
export const COMPONENT_MAX_CHARS = 16_000

export function truncate(text: string, max = MAX_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n… (truncated at ${max} characters; narrow the request with a filter, limit or offset)`
}

function table(headers: string[], rows: string[][]): string {
  const esc = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
}

function code(value: string | undefined): string {
  return value === undefined || value === '' ? '—' : `\`${value}\``
}

export function renderComponentList(components: ComponentEntry[], installed: (pkg: string) => InstalledInfo | null): string {
  const rows = components.map((c) => [
    c.tagPattern ? `\`${c.tagPattern}\` (${c.icons?.length ?? 0} icons)` : c.elements.map((e) => `\`${e.tag}\``).join(', '),
    c.package,
    c.category,
    c.description || c.intro || '',
    installed(c.package)?.version ?? '—',
  ])
  return `${components.length} components\n\n${table(['Tag', 'Package', 'Category', 'Description', 'Installed'], rows)}\n\nNext: \`get_component\` for the API, \`get_examples\` for markup, \`get_theme\` before writing CSS.`
}

export type ComponentSection = 'attributes' | 'script' | 'slots' | 'events' | 'parts' | 'css' | 'composition' | 'presets'

export const COMPONENT_SECTIONS: ComponentSection[] = ['attributes', 'script', 'slots', 'events', 'parts', 'css', 'composition', 'presets']

export interface ComponentRenderOptions {
  include: Set<ComponentSection>
  installed: InstalledInfo | null
  /** Concrete tag / module when the request named an icon. */
  concrete?: { tag: string; modulePath: string; className: string }
  /** Sections drawn as one summary line instead of a table (`css`, `parts`). */
  summarize?: Set<ComponentSection>
  /** Every description cut to its first sentence. */
  compact?: boolean
  /** Only the requested element in full; the package's other elements as one line each. */
  focus?: boolean
  /** Summaries reduced to counts, and methods to their names. */
  brief?: boolean
}

export function renderComponent(component: ComponentEntry, options: ComponentRenderOptions): string {
  const { include, installed, concrete } = options
  const out: string[] = []
  const primary = concrete ?? { tag: component.elements[0].tag, modulePath: component.elements[0].modulePath, className: component.elements[0].className }
  // A secondary element of a package (`c2-table-column` in `@c2n/table`) leads with its own API: the package
  // description is the main element's, and printed in full it pushed the requested tables past the length limit.
  const requested = component.elements.find((element) => element.tag === primary.tag)
  const secondary = !!requested && requested !== component.elements[0]
  out.push(`# ${component.title} (${primary.tag})`)
  if (secondary) {
    // The installed manifest's description when there is one: the tables below come from it too.
    const description = installed?.declared?.get(requested.tag)?.description || requested.description
    if (description) out.push(description)
    const summary = firstSentence(component.description || component.intro || '')
    out.push(summary ? `\nPart of \`${component.package}\`: ${summary}` : `\nPart of \`${component.package}\`.`)
  } else out.push(component.description || component.intro || '')
  out.push('')
  const status = installed?.via
    ? `(installed ${installed.version} through \`${UMBRELLA}\` ${installed.via.version}: import it from \`${component.install.umbrella ?? UMBRELLA}\`, not \`${component.package}\`)`
    : installed
      ? `(installed ${installed.version})`
      : `— not installed. \`${component.install.npm}\`${component.install.umbrella ? ` (it ships in \`${UMBRELLA}\`, the one published component package)` : ''}`
  out.push(`- Package: \`${component.install.umbrella ? UMBRELLA : component.package}\` ${status}`)
  out.push(`- Status: ${component.status} · Category: ${component.category}${component.docsUrl ? ` · Docs: ${component.docsUrl}` : ''}`)
  const modulePath = importPath(primary.modulePath, component.package, installed)
  out.push(`- Register: \`import '${modulePath}'\` · Class: \`import { ${primary.className} } from '${modulePath}'\``)
  if (component.composition.slotted.length && !secondary)
    out.push(`- Children: put ${component.composition.slotted.map((t) => `\`${t}\``).join(', ')} inside it (see the Composition section and get_examples).`)
  if (component.tagPattern)
    out.push(`- Icon set: tags follow \`${component.tagPattern}\`, ${component.icons?.length} icons (use \`search_components\` with the icon name).`)
  const elements = secondary ? [requested, ...component.elements.filter((element) => element !== requested)] : component.elements
  const { summarize, compact, focus, brief } = options
  const text = (value: string | undefined) => (compact ? firstSentence(value ?? '') : (value ?? ''))
  const lead = elements[0]
  for (const element of elements) {
    const api = installed?.elements?.get(element.tag) ?? element
    if (focus && element !== lead) {
      out.push(`\n## ${element.tag}\n`)
      out.push(`${[firstSentence(element.description), `Its API: \`get_component\` with \`tag: "${element.tag}"\`.`].filter(Boolean).join(' ')}`)
      continue
    }
    const heading = component.elements.length > 1 || component.tagPattern ? `\n## ${element.tag}\n` : ''
    out.push(heading)
    // A secondary element's description already leads the output.
    if (element.description && component.elements.length > 1 && !(secondary && element === requested))
      out.push(compact ? firstParagraph(element.description) : element.description)
    if (include.has('attributes') && api.attributes.length) {
      out.push('\n### Attributes\n')
      out.push(
        table(
          ['Name', 'Type', 'Default', 'Description'],
          api.attributes.map((a) => [code(a.name), code(typeText(a.type)), code(a.default), text(a.description)]),
        ),
      )
    }
    if (include.has('slots') && api.slots.length) {
      out.push('\n### Slots\n')
      out.push(
        table(
          ['Slot', 'Description'],
          api.slots.map((s) => [code(s.name || '(default)'), text(s.description)]),
        ),
      )
    }
    if (include.has('events') && api.events.length) {
      out.push('\n### Events\n')
      out.push(
        table(
          ['Event', 'Type', 'Description'],
          api.events.map((e) => [code(e.name), code(typeText(e.type)), text(e.description)]),
        ),
      )
    }
    const script = api.scriptApi ?? []
    const properties = script.filter((m) => m.kind === 'property')
    const methods = script.filter((m) => m.kind === 'method')
    if (include.has('script') && properties.length) {
      out.push('\n### Properties (set from script)\n')
      out.push('No attribute: assign them on the element (`el.renderCell = …`), or bind them as properties in a framework.\n')
      out.push(
        table(
          ['Property', 'Type', 'Description'],
          properties.map((p) => [code(p.name) + (p.readonly ? ' (read-only)' : ''), code(p.type), text(p.description)]),
        ),
      )
    }
    if (include.has('script') && methods.length && brief) {
      out.push(`\n### Methods\n\n${methods.map((m) => `\`${m.name}()\``).join(', ')}.`)
    } else if (include.has('script') && methods.length) {
      out.push('\n### Methods\n')
      out.push(
        table(
          ['Method', 'Signature', 'Description'],
          methods.map((m) => [code(`${m.name}()`), code(m.type), text(m.description)]),
        ),
      )
    }
    if (include.has('parts') && api.cssParts.length && summarize?.has('parts')) {
      out.push(
        brief
          ? `\n### CSS parts\n\n${api.cssParts.length} parts for \`::part()\`.`
          : `\n### CSS parts\n\n${api.cssParts.length} parts for \`::part()\`: ${api.cssParts.map((part) => `\`${part.name}\``).join(', ')}.`,
      )
    } else if (include.has('parts') && api.cssParts.length) {
      out.push('\n### CSS parts\n')
      out.push('Use with `::part(name)` when CSS custom properties do not cover the required change.\n')
      out.push(
        table(
          ['Part', 'Description'],
          api.cssParts.map((part) => [code(part.name), part.description ?? '']),
        ),
      )
    }
    if (include.has('css') && api.cssProperties.length && summarize?.has('css')) {
      const groups = groupCssProperties(api.cssProperties.map((p) => ('part' in p ? p : withParsedName(p))))
      if (brief) out.push(`\n### CSS variables\n\n${api.cssProperties.length} variables (\`--c2-…__<part>--<property>\`).`)
      else
        out.push(
          `\n### CSS variables\n\n${api.cssProperties.length} variables, by part: ${groups.map((group) => `${group.part || '(root)'} (${group.states.reduce((n, state) => n + state.properties.length, 0)})`).join(', ')}.`,
        )
    } else if (include.has('css') && api.cssProperties.length) {
      out.push('\n### CSS variables\n')
      out.push('Set them on the element, a class or any ancestor. `token` = the `--c2-theme--*` token the base theme maps the variable to.\n')
      out.push(renderCssGroups(api.cssProperties.map((p) => ('part' in p ? p : withParsedName(p)))))
    }
  }
  // The composition is the package's main element's: none of it describes a child element.
  if (include.has('composition') && !secondary) {
    const { internal, slotted, usedBy } = component.composition
    if (internal.length || slotted.length || usedBy.length) {
      out.push('\n## Composition\n')
      if (internal.length) out.push(`- Renders internally: ${internal.map((t) => `\`${t}\``).join(', ')} (their variables can be set on this element)`)
      if (slotted.length) out.push(`- Expects slotted: ${slotted.map((t) => `\`${t}\``).join(', ')}`)
      if (usedBy.length) out.push(`- Used by: ${usedBy.map((t) => `\`${t}\``).join(', ')}`)
    }
  }
  // Presets are keyed by the main element's tag: none applies to a child element.
  if (include.has('presets') && component.presets?.items.length && !secondary) {
    out.push('\n## Presets\n')
    out.push(
      component.presets.items
        .map((p) => `- **${p.name}**${p.description ? ` — ${p.description}` : ''} (${Object.keys(p.css ?? {}).length} variables)`)
        .join('\n'),
    )
    out.push('\nUse `get_presets` for the values, `generate_variant` with `preset` to turn one into code.')
  }
  out.push(
    `\nExamples: \`get_examples\` with \`tag: "${primary.tag}"\` (${component.examples.length} available${component.hasGallery ? ', including gallery variants' : ''}).`,
  )
  return out.filter((l) => l !== undefined).join('\n')
}

const SUMMARY_MAX = 200

/** A long element description's first paragraph, capped: its later paragraphs are usage notes. */
function firstParagraph(text: string): string {
  const first = text
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, ' ')
  return first.length > 400 ? `${first.slice(0, 400).replace(/\s+\S*$/, '')}…` : first
}

/**
 * The component's API in one response of at most `COMPONENT_MAX_CHARS`. When the full answer is longer, it is shortened step by
 * step (CSS variables and parts as summaries, then first-sentence descriptions, then the package's other elements as
 * one line each) and ends with what was left out and how to ask for it. Sections asked for by name are never
 * summarized.
 */
export function renderComponentFitted(component: ComponentEntry, options: ComponentRenderOptions & { requested?: Set<ComponentSection> }): string {
  const requested = options.requested ?? new Set<ComponentSection>()
  const summarizable = new Set<ComponentSection>((['css', 'parts'] as ComponentSection[]).filter((section) => !requested.has(section)))
  const levels: Partial<ComponentRenderOptions>[] = [
    {},
    { summarize: summarizable },
    { summarize: summarizable, compact: true },
    { summarize: summarizable, compact: true, focus: true },
    { summarize: summarizable, compact: true, focus: true, brief: true },
  ]
  let text = ''
  for (const [index, level] of levels.entries()) {
    text = renderComponent(component, { ...options, ...level })
    if (text.length <= COMPONENT_MAX_CHARS) {
      if (index === 0) return text
      return `${text}\n\n${fittedNote(component, options, level)}`
    }
  }
  // Still too long: the note goes first, so the cut the server makes at the limit cannot take it away.
  return `${fittedNote(component, options, levels.at(-1)!)}\n\n${text}`
}

function fittedNote(component: ComponentEntry, options: ComponentRenderOptions, level: Partial<ComponentRenderOptions>): string {
  const tag = options.concrete?.tag ?? component.elements[0].tag
  const done: string[] = []
  // Only what the component has: a note about parts it does not have sends an agent after nothing.
  // Read from what was rendered: the installed API when there is one, else the registry.
  const has = (key: 'cssProperties' | 'cssParts') =>
    component.elements.some((element) => ((options.installed?.elements?.get(element.tag) ?? element)[key]?.length ?? 0) > 0)
  if (level.summarize?.has('css') && options.include.has('css') && has('cssProperties')) done.push('CSS variables summarized by part')
  if (level.summarize?.has('parts') && options.include.has('parts') && has('cssParts')) done.push('CSS parts listed by name')
  if (level.compact) done.push('descriptions cut to their first sentence')
  if (level.focus && component.elements.length > 1) done.push("the package's other elements listed by name")
  if (level.brief) done.push('CSS variables and parts counted, methods named')
  // A request that already named its sections is narrowed by element instead: repeating it would return the same.
  const narrowed = options.include.size < COMPONENT_SECTIONS.length
  const next =
    narrowed && component.elements.length > 1
      ? `ask for one element at a time (\`get_component\` with the \`tag\` of each element listed) or for \`format: "json"\``
      : narrowed
        ? `ask for \`format: "json"\``
        : `ask for one section at a time, e.g. \`get_component\` with \`tag: "${tag}"\` and \`include: ["css"]\``
  return `_Shortened to fit one response: ${done.join(', ')}. For the full text ${next}._`
}

function firstSentence(text: string): string {
  const flat = text.trim().replace(/\s+/g, ' ')
  // A sentence ends at `.`, `!` or `?` before a space and a capital, but not after `e.g.` or `i.e.` (`etc.` often ends one).
  const end = /[.!?](?= [A-Z(`*]|$)/g
  for (let match = end.exec(flat); match; match = end.exec(flat)) {
    if (!/\b(?:e\.g|i\.e)\.$/i.test(flat.slice(0, match.index + 1))) return flat.slice(0, match.index + 1)
  }
  // No sentence break found: cap it, so the main element's description never fills the output.
  return flat.length > SUMMARY_MAX ? `${flat.slice(0, SUMMARY_MAX).replace(/\s+\S*$/, '')}…` : flat
}

function withParsedName(p: { name: string; type?: { text?: string } | string; default?: string; description?: string }): CssProperty {
  const match = /^--(c2-[a-z0-9-]+?)(?:__(.+?))?--(-?[a-z-]+)$/.exec(p.name)
  return {
    name: p.name,
    type: typeof p.type === 'string' ? p.type : (p.type?.text ?? ''),
    default: p.default,
    part: match?.[2]?.split('__')[0] ?? '',
    state: match?.[2]?.split('__').slice(1).join('/') || undefined,
    property: match?.[3] ?? p.name,
    description: p.description,
  }
}

export function renderCssGroups(properties: CssProperty[]): string {
  const out: string[] = []
  for (const group of groupCssProperties(properties)) {
    out.push(`#### ${group.part || 'root'}`)
    for (const { state, properties: props } of group.states) {
      if (state) out.push(`*${state}*`)
      out.push(
        props
          .map(
            (p) =>
              `- \`${p.name}\`${p.default ? ` = \`${p.default}\`` : ''}${p.type ? ` (${p.type})` : ''}${p.token ? ` → \`${p.token}\`` : ''}${p.description ? ` — ${p.description}` : ''}`,
          )
          .join('\n'),
      )
    }
  }
  return out.join('\n')
}

export function renderExamples(component: ComponentEntry, examples: Example[], total: number, offset: number): string {
  const out = [`# ${component.title} examples (${offset + 1}–${offset + examples.length} of ${total})`, '']
  for (const ex of examples) {
    out.push(
      `#### ${ex.label}${ex.kind === 'gallery' ? ` (gallery${ex.section ? ` · ${ex.section}` : ''}${ex.isDefault ? ' · default without component overrides' : ''})` : ex.kind === 'usage' ? ' (usage)' : ''}`,
    )
    if (ex.tags?.length) out.push(`Components: ${ex.tags.map((tag) => `\`${tag}\``).join(', ')}`)
    if (ex.description) out.push(`Demonstrates: ${ex.description}`)
    if (ex.useWhen) out.push(`Use when: ${ex.useWhen}`)
    if (ex.accessibility) out.push(`Accessibility: ${ex.accessibility}`)
    if (ex.screenshots) out.push(`Look: [light](${ex.screenshots.light}) · [dark](${ex.screenshots.dark}) · [live](${ex.galleryUrl})`)
    out.push('```html')
    out.push(ex.html.length > 4000 ? `${ex.html.slice(0, 4000)}\n<!-- … truncated -->` : ex.html)
    out.push('```')
    if (ex.css) {
      out.push('```css')
      out.push(ex.css)
      out.push('```')
    }
    out.push('')
  }
  if (offset + examples.length < total) out.push(`More: call again with \`offset: ${offset + examples.length}\`.`)
  return out.join('\n')
}

/**
 * One line per example, no code: what an agent reads to choose a look before fetching the one it wants. Gallery cards
 * are grouped by section, the order the docs site shows them in.
 */
export function renderExampleIndex(component: ComponentEntry, examples: Example[]): string {
  const tag = component.elements[0].tag
  const out = [
    `# ${component.title} looks (${examples.length})`,
    '',
    `Pick by intent, then fetch one with \`get_examples\` \`{ tag: "${tag}", label: "<slug>" }\`, or start a variant from it with \`generate_variant\` \`{ tag: "${tag}", example: "<slug>" }\`. Gallery CSS follows the \`--c2-theme--*\` tokens where a colour matches one; any literal left is the card's own accent, so swap it for the application's tokens.`,
  ]
  let group = ''
  for (const ex of examples) {
    const heading = ex.kind === 'gallery' ? (ex.section ?? 'Gallery') : ex.kind === 'usage' ? 'Usage (docs page)' : 'Preview'
    if (heading !== group) {
      out.push('', `## ${heading}`)
      group = heading
    }
    const details = [ex.description, ex.useWhen ? `Use when: ${ex.useWhen}` : '', ex.screenshots ? `[look](${ex.screenshots.light})` : '']
    out.push(`- **${ex.label}**${ex.slug ? ` \`${ex.slug}\`` : ''}${details.some(Boolean) ? ` — ${details.filter(Boolean).join(' ')}` : ''}`)
  }
  return out.join('\n')
}

export function renderPresets(component: ComponentEntry, names?: string): string {
  if (!component.presets) return `${component.title} has no curated presets. Use \`get_examples\` (gallery variants) instead.`
  const items = names ? component.presets.items.filter((p) => p.name.toLowerCase().includes(names.toLowerCase())) : component.presets.items
  const out = [`# ${component.title} presets`, '', 'Base markup:', '```html', component.presets.html, '```', '']
  for (const preset of items) {
    out.push(`## ${preset.name}${preset.description ? ` — ${preset.description}` : ''}`)
    const css = Object.entries(preset.css ?? {})
    if (css.length) out.push('```css', css.map(([k, v]) => `${k}: ${v};`).join('\n'), '```')
    if (preset.attributes && Object.keys(preset.attributes).length)
      out.push(
        `Attributes: ${Object.entries(preset.attributes)
          .map(([k, v]) => `\`${k}${v ? `="${v}"` : ''}\``)
          .join(', ')}`,
      )
    out.push('')
  }
  return out.join('\n')
}

export function renderTheme(theme: ThemeEntry, registry: Registry, component?: ComponentEntry, umbrella?: InstalledInfo | null): string {
  const out: string[] = []
  if (component) {
    out.push(`# Theme mapping for ${component.title}`, '')
    const rows: string[][] = []
    for (const element of component.elements) for (const p of element.cssProperties) if (p.token) rows.push([code(p.name), code(p.token), code(p.default)])
    out.push(
      rows.length ? table(['Component variable', 'Token', 'Default'], rows) : 'No variable of this component is mapped to a token; set its variables directly.',
    )
    out.push('', 'Variables without a token keep the component default; set them on a class for a variant.')
    return out.join('\n')
  }
  out.push('# @c2n/theme', '')
  out.push(
    `\`${theme.install.npm}\` then \`${theme.install.imports[0]}\` once at the app root (or \`${theme.install.imports[2]}\` alone and bridge your own tokens).`,
  )
  if (umbrella)
    out.push(
      '',
      `This project has \`${UMBRELLA}\` ${umbrella.version}, which includes the theme: \`import '${UMBRELLA}/theme.css'\` (or \`${UMBRELLA}/base.css\`, \`${UMBRELLA}/tokens.css\`) is the same stylesheet.`,
    )
  out.push('', `Dark mode: ${theme.darkMode}`, '')
  out.push('## Tokens', '')
  out.push(
    table(
      ['Token', 'Light', 'Dark', 'Used by', 'Description'],
      theme.tokens.map((t) => [code(t.name), t.light === null ? '*unset*' : code(t.light), t.dark ? code(t.dark) : 'same', String(t.usedBy), t.description]),
    ),
  )
  out.push(
    '',
    '## Map your own tokens',
    '',
    '```css',
    ':root {',
    '  --c2-theme--color-primary: var(--brand-600);',
    '  --c2-theme--color-surface: var(--surface);',
    '  --c2-theme--color-on-surface: var(--text);',
    '  --c2-theme--color-outline: var(--border);',
    '  --c2-theme--radius-md: var(--radius);',
    '  --c2-theme--font-family: var(--font-sans);',
    '}',
    '```',
  )
  out.push(
    '',
    `Component variables always win over the base theme; \`get_theme\` with a \`tag\` lists one component's mapping. ${Object.keys(registry.components).length} components covered.`,
  )
  return out.join('\n')
}

export function elementApiNames(element: ElementEntry): { css: string[]; attributes: string[] } {
  return { css: element.cssProperties.map((p) => p.name), attributes: element.attributes.map((a) => a.name) }
}
