/** Compact markdown renderers for tool results. */
import { groupCssProperties } from './lib/group-css.ts'
import type { InstalledInfo } from './installed.ts'
import type { ComponentEntry, CssProperty, ElementEntry, Example, Registry, ThemeEntry } from './registry-types.ts'

export const MAX_CHARS = 12_000

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

export interface ComponentRenderOptions {
  include: Set<'attributes' | 'slots' | 'events' | 'css' | 'composition' | 'presets'>
  installed: InstalledInfo | null
  /** Concrete tag / module when the request named an icon. */
  concrete?: { tag: string; modulePath: string; className: string }
}

export function renderComponent(component: ComponentEntry, options: ComponentRenderOptions): string {
  const { include, installed, concrete } = options
  const out: string[] = []
  const primary = concrete ?? { tag: component.elements[0].tag, modulePath: component.elements[0].modulePath, className: component.elements[0].className }
  out.push(`# ${component.title} (${primary.tag})`)
  out.push(component.description || component.intro || '')
  out.push('')
  out.push(`- Package: \`${component.package}\` ${installed ? `(installed ${installed.version})` : `— not installed. \`${component.install.npm}\``}`)
  out.push(`- Status: ${component.status} · Category: ${component.category} · Docs: ${component.docsUrl}`)
  out.push(`- Register: \`import '${primary.modulePath}'\` · Class: \`import { ${primary.className} } from '${primary.modulePath}'\``)
  if (component.tagPattern)
    out.push(`- Icon set: tags follow \`${component.tagPattern}\`, ${component.icons?.length} icons (use \`search_components\` with the icon name).`)
  for (const element of component.elements) {
    const api = installed?.elements?.get(element.tag) ?? element
    const heading = component.elements.length > 1 || component.tagPattern ? `\n## ${element.tag}\n` : ''
    out.push(heading)
    if (element.description && component.elements.length > 1) out.push(element.description)
    if (include.has('attributes') && api.attributes.length) {
      out.push('\n### Attributes\n')
      out.push(
        table(
          ['Name', 'Type', 'Default', 'Description'],
          api.attributes.map((a) => [code(a.name), code(a.type), code(a.default), a.description ?? '']),
        ),
      )
    }
    if (include.has('slots') && api.slots.length) {
      out.push('\n### Slots\n')
      out.push(
        table(
          ['Slot', 'Description'],
          api.slots.map((s) => [code(s.name || '(default)'), s.description ?? '']),
        ),
      )
    }
    if (include.has('events') && api.events.length) {
      out.push('\n### Events\n')
      out.push(
        table(
          ['Event', 'Type', 'Description'],
          api.events.map((e) => [code(e.name), code(e.type), e.description ?? '']),
        ),
      )
    }
    if (include.has('css') && api.cssProperties.length) {
      out.push('\n### CSS variables\n')
      out.push('Set them on the element, a class or any ancestor. `token` = the `--c2-theme--*` token the base theme maps the variable to.\n')
      out.push(renderCssGroups(api.cssProperties.map((p) => ('part' in p ? p : withParsedName(p)))))
    }
  }
  if (include.has('composition')) {
    const { internal, slotted, usedBy } = component.composition
    if (internal.length || slotted.length || usedBy.length) {
      out.push('\n## Composition\n')
      if (internal.length) out.push(`- Renders internally: ${internal.map((t) => `\`${t}\``).join(', ')} (their variables can be set on this element)`)
      if (slotted.length) out.push(`- Expects slotted: ${slotted.map((t) => `\`${t}\``).join(', ')}`)
      if (usedBy.length) out.push(`- Used by: ${usedBy.map((t) => `\`${t}\``).join(', ')}`)
    }
  }
  if (include.has('presets') && component.presets?.items.length) {
    out.push('\n## Presets\n')
    out.push(
      component.presets.items.map((p) => `- **${p.name}**${p.description ? ` — ${p.description}` : ''} (${Object.keys(p.css).length} variables)`).join('\n'),
    )
    out.push('\nUse `get_presets` for the values, `generate_variant` with `preset` to turn one into code.')
  }
  out.push(
    `\nExamples: \`get_examples\` with \`tag: "${primary.tag}"\` (${component.examples.length} available${component.hasGallery ? ', including gallery variants' : ''}).`,
  )
  return out.filter((l) => l !== undefined).join('\n')
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
    out.push(`#### ${ex.label}${ex.kind === 'gallery' ? ` (gallery${ex.section ? ` · ${ex.section}` : ''})` : ex.kind === 'usage' ? ' (usage)' : ''}`)
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

export function renderPresets(component: ComponentEntry, names?: string): string {
  if (!component.presets) return `${component.title} has no curated presets. Use \`get_examples\` (gallery variants) instead.`
  const items = names ? component.presets.items.filter((p) => p.name.toLowerCase().includes(names.toLowerCase())) : component.presets.items
  const out = [`# ${component.title} presets`, '', 'Base markup:', '```html', component.presets.html, '```', '']
  for (const preset of items) {
    out.push(`## ${preset.name}${preset.description ? ` — ${preset.description}` : ''}`)
    out.push('```css')
    out.push(
      Object.entries(preset.css)
        .map(([k, v]) => `${k}: ${v};`)
        .join('\n'),
    )
    out.push('```')
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

export function renderTheme(theme: ThemeEntry, registry: Registry, component?: ComponentEntry): string {
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
