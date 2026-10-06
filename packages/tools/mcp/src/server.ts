/** The c2n MCP server: tools and resources over the bundled registry. */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { importPath, installedPackage, umbrellaInstalled, withInstalledApi } from './installed.ts'
import { generateCode, type CodeFormat } from './lib/generate-code.ts'
import { formatFindings, validateMarkup } from './lib/validate.ts'
import { loadRegistry, resolveElement, suggest } from './registry.ts'
import type { GuideTopic, Registry } from './registry-types.ts'
import {
  MAX_CHARS,
  elementApiNames,
  renderComponent,
  renderComponentList,
  renderExampleIndex,
  renderExamples,
  renderPresets,
  renderTheme,
  truncate,
} from './render.ts'
import { searchComponents, searchExamples } from './search.ts'

const GUIDE_TOPICS = ['workflow', 'theming', 'variant-components', 'frameworks'] as const
const readOnly = { readOnlyHint: true, openWorldHint: false } as const

function text(value: string) {
  return { content: [{ type: 'text' as const, text: truncate(value) }] }
}

const JSON_MAX_CHARS = MAX_CHARS * 4

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: truncate(JSON.stringify(value, null, 2), JSON_MAX_CHARS) }] }
}

/**
 * `json()` for a result whose `items` may be long: drops trailing items until the document fits, rather than cutting
 * the text (which leaves JSON no client can parse), and says how many there were.
 */
export function jsonList<T>(key: string, items: T[], rest: Record<string, unknown> = {}, max = JSON_MAX_CHARS) {
  let kept = items
  const render = () =>
    JSON.stringify({ [key]: kept, ...rest, ...(kept.length < items.length ? { truncated: true, total: items.length, shown: kept.length } : {}) }, null, 2)
  let out = render()
  while (out.length > max && kept.length) {
    kept = kept.slice(0, Math.floor((kept.length * max * 0.9) / out.length))
    out = render()
  }
  return { content: [{ type: 'text' as const, text: out }] }
}

function notFound(registry: Registry, tag: string) {
  const candidates = [...Object.keys(registry.tagIndex), ...Object.keys(registry.components)]
  const hints = suggest(candidates, tag)
  return {
    ...text(
      `Unknown component "${tag}".${hints.length ? ` Did you mean ${hints.map((h) => `\`${h}\``).join(', ')}?` : ''} Use \`list_components\` or \`search_components\`.`,
    ),
    isError: true,
  }
}

export function createServer(registry: Registry = loadRegistry()): McpServer {
  const server = new McpServer(
    { name: 'c2n', version: registry.c2nVersion },
    {
      instructions: [
        'c2n web components (Lit custom elements, tag prefix c2-, npm scope @c2n).',
        'In a project that uses them, build every control and widget from a c2-* element rather than a native element or a hand-rolled one (c2-button, not <button>; c2-text-field, c2-select, c2-modal, c2-table, …), even when the request does not mention c2n;',
        'call search_components before concluding no component fits.',
        'Their APIs change between releases, so never write a c2-* tag, attribute, slot, event or --c2-* variable from memory:',
        'call get_component for every component before using it, and use only the names it returns.',
        'Start with list_components or search_components, then get_component for the API and get_examples for markup.',
        'Use the import lines get_component gives: a project that installed @c2n/components imports @c2n/components/<name>, not @c2n/<name>.',
        'get_component also names the child elements a container expects (c2-dashboard holds c2-dash-card, c2-tabs holds c2-tab): build them in.',
        'Call get_theme before writing CSS: apps set ~35 --c2-theme--* tokens once; restyle a component only through the --c2-<component>__<part>--<property> variables get_component lists, set on a class or the element,',
        'never with border, padding, background, color or size rules on the c2-* host, and use only documented ::part() hooks when variables cannot express the change.',
        'For the look, browse the docs gallery before inventing CSS: get_examples with view "index" lists every card of a component (summary, screenshot), search_examples finds a look across components;',
        'adapt the chosen card to the application tokens (its remaining colour literals are accents to swap), and start a variant from it with generate_variant `example`.',
        'When a look repeats, call generate_variant (css | html | lit) instead of repeating inline styles.',
        'Before finishing, call validate_markup on the markup and CSS you wrote and fix what it reports.',
        'get_workflow_guide explains the application workflow, theming, variant components and framework notes.',
      ].join(' '),
    },
  )

  const formatSchema = z.enum(['markdown', 'json']).default('markdown').describe('Output format')
  const tagSchema = z
    .string()
    .min(1)
    .describe('Component tag, id or package: `c2-button`, `button`, `@c2n/button`, `c2-tab`, or a concrete icon tag such as `c2-feather-arrow-right`')

  server.registerTool(
    'list_components',
    {
      title: 'List components',
      description: 'Lists every c2n component (tag, package, category, one-line description, installed version in the current project).',
      inputSchema: {
        category: z
          .enum(registry.categories as [string, ...string[]])
          .optional()
          .describe('Only this category'),
        keyword: z.string().optional().describe('Substring filter on tag, title or description'),
        installedOnly: z.boolean().optional().describe('Only packages installed in the current project'),
        format: formatSchema,
      },
      annotations: readOnly,
    },
    ({ category, keyword, installedOnly, format }) => {
      const needle = keyword?.toLowerCase()
      const components = Object.values(registry.components).filter(
        (c) =>
          (!category || c.category === category) &&
          (!needle || `${c.id} ${c.title} ${c.description} ${c.elements.map((e) => e.tag).join(' ')}`.toLowerCase().includes(needle)) &&
          (!installedOnly || installedPackage(c.package)),
      )
      if (format === 'json')
        return json(
          components.map((c) => ({
            id: c.id,
            tags: c.elements.map((e) => e.tag),
            tagPattern: c.tagPattern,
            package: c.package,
            category: c.category,
            description: c.description,
            installed: installedPackage(c.package)?.version ?? null,
          })),
        )
      return text(renderComponentList(components, installedPackage))
    },
  )

  server.registerTool(
    'get_component',
    {
      title: 'Get component API',
      description:
        'Full API of one component: install/import lines, attributes, slots, events, native CSS parts, CSS variables grouped by semantic target and state (with the theme token each follows), composition and preset names. Examples are served by get_examples.',
      inputSchema: {
        tag: tagSchema,
        include: z
          .array(z.enum(['attributes', 'slots', 'events', 'parts', 'css', 'composition', 'presets']))
          .optional()
          .describe('Sections to include (default: all)'),
        format: formatSchema,
      },
      annotations: readOnly,
    },
    ({ tag, include, format }) => {
      const resolved = resolveElement(registry, tag)
      if (!resolved) return notFound(registry, tag)
      const installed = installedPackage(resolved.component.package)
      if (format === 'json')
        return json({
          ...resolved.component,
          examples: undefined,
          installed: installed?.version ?? null,
          installedVia: installed?.via?.package ?? null,
          resolved: { tag: resolved.tag, modulePath: importPath(resolved.modulePath, resolved.component.package, installed), className: resolved.className },
        })
      return text(
        renderComponent(resolved.component, {
          include: new Set(include ?? ['attributes', 'slots', 'events', 'parts', 'css', 'composition', 'presets']),
          installed,
          concrete: { tag: resolved.tag, modulePath: resolved.modulePath, className: resolved.className },
        }),
      )
    },
  )

  server.registerTool(
    'search_components',
    {
      title: 'Search components',
      description:
        'Free-text search across component names, descriptions, attributes, slots, events, example labels and icon names. Use it to find the component for a UI need ("dropdown", "dialog", "avatar with status", "arrow icon").',
      inputSchema: { query: z.string().min(2).describe('What you are looking for'), limit: z.number().int().min(1).max(25).default(10) },
      annotations: readOnly,
    },
    ({ query, limit }) => {
      const hits = searchComponents(registry, query, limit)
      if (hits.length === 0) return text(`No component matches "${query}". Try \`list_components\`.`)
      return text(
        `${hits.length} result(s) for "${query}"\n\n` +
          hits
            .map(
              (h) =>
                `- **${h.component.title}** ${h.component.tagPattern ? `\`${h.component.tagPattern}\`` : h.component.elements.map((e) => `\`${e.tag}\``).join(', ')} (${h.component.package}) — ${h.component.description}\n  matched: ${h.matches.join(', ')}`,
            )
            .join('\n'),
      )
    },
  )

  server.registerTool(
    'get_examples',
    {
      title: 'Get examples',
      description:
        'Markup examples of a component: usage rows from the docs, styled gallery cards (the looks shown on the docs site, each with a summary of what it changes and light/dark screenshots) and the landing preview. Start with `view: "index"` to see every look on one page, then fetch the chosen card by its slug.',
      inputSchema: {
        tag: tagSchema,
        view: z
          .enum(['full', 'index'])
          .default('full')
          .describe('`index`: one line per example (label, slug, summary, screenshot), no code and no paging; `full`: markup and CSS'),
        kind: z.enum(['usage', 'gallery', 'preview']).optional().describe('Only this kind'),
        label: z.string().optional().describe('Substring filter on the example label, or a gallery slug from the index'),
        section: z.string().optional().describe('Gallery section filter (e.g. "Variants", "Sizes")'),
        query: z.string().optional().describe('Search label, section, description, use case, accessibility note and component tags'),
        limit: z.number().int().min(1).max(20).default(8),
        offset: z.number().int().min(0).default(0),
        format: formatSchema,
      },
      annotations: readOnly,
    },
    ({ tag, view, kind, label, section, query, limit, offset, format }) => {
      const resolved = resolveElement(registry, tag)
      if (!resolved) return notFound(registry, tag)
      const needle = query?.toLowerCase()
      const all = resolved.component.examples.filter((e) => {
        const searchable =
          `${e.label} ${e.section ?? ''} ${e.description ?? ''} ${e.useWhen ?? ''} ${e.accessibility ?? ''} ${(e.tags ?? []).join(' ')}`.toLowerCase()
        return (
          (!kind || e.kind === kind) &&
          (!label || e.slug === label || e.label.toLowerCase().includes(label.toLowerCase())) &&
          (!section || (e.section ?? '').toLowerCase().includes(section.toLowerCase())) &&
          (!needle || searchable.includes(needle))
        )
      })
      if (view === 'index') {
        if (format === 'json')
          return json(
            all.map(({ kind, label, slug, section, description, useWhen, screenshots }) => ({ kind, label, slug, section, description, useWhen, screenshots })),
          )
        return text(all.length ? renderExampleIndex(resolved.component, all) : `No examples match for ${resolved.tag}.`)
      }
      // An exact slug names one card; a label substring may still match several.
      const exact = label ? all.filter((e) => e.slug === label) : []
      const matched = exact.length ? exact : all
      const page = matched.slice(offset, offset + limit)
      if (format === 'json') return json({ total: matched.length, offset, examples: page })
      return text(matched.length ? renderExamples(resolved.component, page, matched.length, offset) : `No examples match for ${resolved.tag}.`)
    },
  )

  server.registerTool(
    'search_examples',
    {
      title: 'Search gallery looks',
      description:
        'Search every component\'s gallery for a look or a use case ("compact", "glass", "pill", "danger", "underline input", "KPI"): returns matching cards across components with their summary and screenshot. Fetch one with get_examples `label: <slug>`.',
      inputSchema: {
        query: z.string().min(2).describe('The look or situation you want'),
        tag: tagSchema.optional().describe('Limit to one component'),
        limit: z.number().int().min(1).max(30).default(12),
      },
      annotations: readOnly,
    },
    ({ query, tag, limit }) => {
      const resolved = tag ? resolveElement(registry, tag) : undefined
      if (tag && !resolved) return notFound(registry, tag)
      const hits = searchExamples(registry, query, limit, resolved?.component)
      if (hits.length === 0) return text(`No gallery card matches "${query}". Try \`get_examples\` with \`view: "index"\` for one component.`)
      return text(
        `${hits.length} look(s) for "${query}"\n\n` +
          hits
            .map(
              ({ component, example }) =>
                `- **${component.title} · ${example.label}**${example.section ? ` (${example.section})` : ''} — ${example.description ?? ''}${example.screenshots ? ` [look](${example.screenshots.light})` : ''}\n  get_examples \`{ tag: "${component.elements[0].tag}", label: "${example.slug}" }\``,
            )
            .join('\n'),
      )
    },
  )

  server.registerTool(
    'get_presets',
    {
      title: 'Get presets',
      description: 'Curated presets of a component ("inspiration" looks): base markup plus each preset as CSS variable values and attributes.',
      inputSchema: { tag: tagSchema, name: z.string().optional().describe('Substring filter on the preset name'), format: formatSchema },
      annotations: readOnly,
    },
    ({ tag, name, format }) => {
      const resolved = resolveElement(registry, tag)
      if (!resolved) return notFound(registry, tag)
      if (format === 'json') return json(resolved.component.presets ?? null)
      return text(renderPresets(resolved.component, name))
    },
  )

  server.registerTool(
    'get_theme',
    {
      title: 'Get theme tokens',
      description:
        "The @c2n/theme design tokens (--c2-theme--*) with light/dark defaults, how to install and map your own tokens, and dark mode. With `tag`: which of that component's variables follow which token.",
      inputSchema: { tag: tagSchema.optional(), format: formatSchema },
      annotations: readOnly,
    },
    ({ tag, format }) => {
      const resolved = tag ? resolveElement(registry, tag) : undefined
      if (tag && !resolved) return notFound(registry, tag)
      if (format === 'json')
        return json(
          resolved
            ? {
                tag: resolved.tag,
                mapping: Object.fromEntries(resolved.component.elements.flatMap((e) => e.cssProperties.filter((p) => p.token).map((p) => [p.name, p.token]))),
              }
            : registry.theme,
        )
      return text(renderTheme(registry.theme, registry, resolved?.component, umbrellaInstalled()))
    },
  )

  server.registerTool(
    'generate_variant',
    {
      title: 'Generate a variant component',
      description:
        'Turns CSS variable / attribute overrides of a component into copy-paste code: a CSS class, HTML + <style>, a Lit subclass registered under your own tag, or JSON. Validates variable and attribute names against the component API. Start from a curated preset with `preset`, or from a gallery card with `example` (its slug or label).',
      inputSchema: {
        tag: tagSchema,
        name: z
          .string()
          .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/, 'kebab-case with at least one hyphen, e.g. app-danger-button')
          .describe('Class / tag name of the variant (kebab-case, must contain a hyphen, not c2-*)'),
        css: z
          .record(z.string(), z.string())
          .optional()
          .describe('Component CSS variables to fix, e.g. {"--c2-button__container--background-color": "var(--c2-theme--color-error)"}'),
        attributes: z.record(z.string(), z.string()).optional().describe('Attributes to fix, e.g. {"running": "true"}'),
        preset: z.string().optional().describe('Name of a curated preset to start from (its values are merged under `css`)'),
        example: z
          .string()
          .optional()
          .describe('Gallery card to start from, by slug or label (get_examples view: index): its themed variables for this component are merged under `css`'),
        html: z.string().optional().describe('Base markup; defaults to the example or preset markup, else `<tag>Label</tag>`'),
        format: z.enum(['css', 'html', 'lit', 'json', 'all']).default('all'),
      },
      annotations: readOnly,
    },
    ({ tag, name, css, attributes, preset, example, html, format }) => {
      const resolved = resolveElement(registry, tag)
      if (!resolved) return notFound(registry, tag)
      if (name.startsWith('c2-')) return { ...text('Variant names must not start with `c2-`; use your own prefix (app-, site-, my-).'), isError: true }
      const presetItem = preset ? resolved.component.presets?.items.find((p) => p.name.toLowerCase() === preset.toLowerCase()) : undefined
      if (preset && !presetItem)
        return {
          ...text(
            `Unknown preset "${preset}" for ${resolved.tag}. Available: ${(resolved.component.presets?.items ?? []).map((p) => p.name).join(', ') || 'none'}.`,
          ),
          isError: true,
        }
      const gallery = resolved.component.examples.filter((e) => e.kind === 'gallery')
      const card = example ? (gallery.find((e) => e.slug === example) ?? gallery.find((e) => e.label.toLowerCase() === example.toLowerCase())) : undefined
      if (example && !card)
        return {
          ...text(`Unknown gallery card "${example}" for ${resolved.tag}. Call get_examples with \`view: "index"\` for the slugs.`),
          isError: true,
        }
      const api = elementApiNames(resolved.element)
      // A card's CSS may style several elements and its own layout; only this element's variables become the variant.
      const cardCss = Object.fromEntries(
        [...(card?.css ?? '').matchAll(/(--c2-[a-z0-9_-]+)\s*:\s*([^;}]+)/g)].filter((m) => api.css.includes(m[1])).map((m) => [m[1], m[2].trim()]),
      )
      const changes = {
        css: { ...cardCss, ...(presetItem?.css ?? {}), ...(css ?? {}) },
        attributes: { ...(presetItem?.attributes ?? {}), ...(attributes ?? {}) },
      }
      const warnings: string[] = []
      for (const variable of Object.keys(changes.css)) {
        if (!api.css.includes(variable) && !variable.startsWith('--c2-theme--')) {
          const hint = suggest(api.css, variable, 2)
          warnings.push(`Unknown variable \`${variable}\`${hint.length ? ` (did you mean ${hint.map((h) => `\`${h}\``).join(', ')}?)` : ''}`)
        }
      }
      for (const attribute of Object.keys(changes.attributes)) {
        if (!api.attributes.includes(attribute) && !attribute.startsWith('data-') && !attribute.startsWith('aria-'))
          warnings.push(`Unknown attribute \`${attribute}\` (attributes: ${api.attributes.join(', ') || 'none'})`)
      }
      // The card's class carried its look; the variant brings its own, so drop it from this element only.
      const cardHtml = card?.html.replace(new RegExp(`(<${resolved.tag}\\b[^>]*?)\\sclass="[^"]*"`), '$1')
      const baseHtml = html ?? cardHtml ?? resolved.component.presets?.html ?? `<${resolved.tag}>Label</${resolved.tag}>`
      const input = {
        tag: resolved.tag,
        html: baseHtml,
        changes,
        name,
        className: resolved.className,
        modulePath: importPath(resolved.modulePath, resolved.component.package, installedPackage(resolved.component.package)),
      }
      const formats: CodeFormat[] = format === 'all' ? ['css', 'html', 'lit'] : [format]
      const out: string[] = []
      if (warnings.length) out.push(`> ${warnings.join('\n> ')}\n`)
      for (const f of formats) {
        out.push(`## ${f === 'lit' ? 'Lit subclass' : f === 'css' ? 'CSS class variant' : f === 'html' ? 'HTML + style' : 'JSON preset'}`)
        out.push(`\`\`\`${f === 'lit' ? 'ts' : f}`)
        out.push(generateCode(f, input))
        out.push('```')
      }
      return text(out.join('\n'))
    },
  )

  server.registerTool(
    'validate_markup',
    {
      title: 'Validate markup',
      description:
        'Checks HTML, JSX, Vue, Svelte, Astro, Angular or Lit markup and CSS you wrote against the installed c2n API: native controls a c2-* element replaces (<button>, <input>, <select>, <textarea>, <dialog>, <details>, <progress>), unknown c2-* tags, attributes, slots, events and --c2-* variables (with "did you mean"), and box styling on a c2-* host. Lists the imports that register the elements used. Call it on every file you write before finishing.',
      inputSchema: {
        code: z.string().min(1).describe('The source to check: a component file, a template, a stylesheet or a snippet'),
        filename: z
          .string()
          .optional()
          .describe(
            'File name, which sets how the source is read (`App.tsx`: JSX props; `styles.css`: a stylesheet). Always pass it; without it the source is read as HTML',
          ),
        format: formatSchema,
      },
      annotations: readOnly,
    },
    ({ code, filename, format }) => {
      // One installed view for both: a tag only the installed version has still gets its import line.
      const installedApi = withInstalledApi(registry)
      const result = validateMarkup(installedApi, code, filename)
      const elements = result.elements.map((e) => {
        const resolved = resolveElement(installedApi, e.tag)
        return {
          ...e,
          modulePath: resolved ? importPath(e.modulePath, resolved.component.package, installedPackage(resolved.component.package)) : e.modulePath,
        }
      })
      if (format === 'json') return jsonList('findings', result.findings, { elements })
      const errors = result.findings.filter((f) => f.severity === 'error').length
      const out = [
        result.findings.length
          ? `${errors} error(s), ${result.findings.length - errors} warning(s)\n\n${formatFindings(filename ?? 'snippet', result.findings)}`
          : 'No problems found.',
      ]
      const imports = [...new Set(elements.map((e) => `import '${e.modulePath}'`))]
      if (imports.length) out.push(`\nThe elements used are registered by:\n\n\`\`\`ts\n${imports.join('\n')}\n\`\`\``)
      return text(out.join('\n'))
    },
  )

  server.registerTool(
    'get_workflow_guide',
    {
      title: 'Get workflow guide',
      description:
        'The c2n application workflow guides: `workflow` (theme once, use tags, name what repeats), `theming`, `variant-components`, `frameworks` (plain HTML, Lit, Astro, React, Vue, SSR).',
      inputSchema: { topic: z.enum(GUIDE_TOPICS).default('workflow') },
      annotations: readOnly,
    },
    ({ topic }) => text(registry.guides[topic as GuideTopic]),
  )

  server.registerResource(
    'components',
    'c2n://components',
    { title: 'c2n components', description: 'All components: id, tags, package, category, description', mimeType: 'application/json' },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            Object.values(registry.components).map((c) => ({
              id: c.id,
              tags: c.elements.map((e) => e.tag),
              tagPattern: c.tagPattern,
              package: c.package,
              category: c.category,
              description: c.description,
            })),
            null,
            2,
          ),
        },
      ],
    }),
  )

  server.registerResource(
    'component',
    new ResourceTemplate('c2n://components/{tag}', {
      list: () => ({ resources: Object.keys(registry.tagIndex).map((tag) => ({ uri: `c2n://components/${tag}`, name: tag, mimeType: 'application/json' })) }),
    }),
    { title: 'c2n component', description: 'Full registry entry of one component (API, composition, presets, examples)', mimeType: 'application/json' },
    (uri, { tag }) => {
      const resolved = resolveElement(registry, String(tag))
      if (!resolved) throw new Error(`Unknown component ${String(tag)}`)
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(resolved.component, null, 2) }] }
    },
  )

  server.registerResource(
    'theme',
    'c2n://theme',
    { title: '@c2n/theme tokens', description: 'Design tokens and the component variable → token mapping', mimeType: 'application/json' },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(registry.theme, null, 2) }],
    }),
  )

  server.registerResource(
    'guide',
    new ResourceTemplate('c2n://guide/{topic}', {
      list: () => ({ resources: GUIDE_TOPICS.map((topic) => ({ uri: `c2n://guide/${topic}`, name: topic, mimeType: 'text/markdown' })) }),
    }),
    { title: 'c2n guide', description: 'Application workflow guides', mimeType: 'text/markdown' },
    (uri, { topic }) => {
      const guide = registry.guides[String(topic) as GuideTopic]
      if (!guide) throw new Error(`Unknown guide ${String(topic)}`)
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: guide }] }
    },
  )

  return server
}
