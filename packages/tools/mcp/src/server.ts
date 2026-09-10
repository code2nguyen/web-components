/** The c2n MCP server: tools and resources over the bundled registry. */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { installedPackage } from './installed.ts'
import { generateCode, type CodeFormat } from './lib/generate-code.ts'
import { loadRegistry, resolveElement, suggest } from './registry.ts'
import type { GuideTopic, Registry } from './registry-types.ts'
import { MAX_CHARS, elementApiNames, renderComponent, renderComponentList, renderExamples, renderPresets, renderTheme, truncate } from './render.ts'
import { searchComponents } from './search.ts'

const GUIDE_TOPICS = ['workflow', 'theming', 'variant-components', 'frameworks'] as const
const readOnly = { readOnlyHint: true, openWorldHint: false } as const

function text(value: string) {
  return { content: [{ type: 'text' as const, text: truncate(value) }] }
}

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: truncate(JSON.stringify(value, null, 2), MAX_CHARS * 4) }] }
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
        'Start with list_components or search_components, then get_component for the API and get_examples for markup.',
        'Call get_theme before writing CSS: apps set ~35 --c2-theme--* tokens once; per-component variables go on a class or the element, never ::part().',
        'When a look repeats, call generate_variant (css | html | lit) instead of repeating inline styles.',
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
        'Full API of one component: install/import lines, attributes, slots, events, CSS variables grouped by part and state (with the theme token each follows), composition and preset names. Examples are served by get_examples.',
      inputSchema: {
        tag: tagSchema,
        include: z
          .array(z.enum(['attributes', 'slots', 'events', 'css', 'composition', 'presets']))
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
          resolved: { tag: resolved.tag, modulePath: resolved.modulePath, className: resolved.className },
        })
      return text(
        renderComponent(resolved.component, {
          include: new Set(include ?? ['attributes', 'slots', 'events', 'css', 'composition', 'presets']),
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
        'Markup examples of a component: usage rows from the docs, styled gallery variants (each with the CSS that produces the look) and the landing preview.',
      inputSchema: {
        tag: tagSchema,
        kind: z.enum(['usage', 'gallery', 'preview']).optional().describe('Only this kind'),
        label: z.string().optional().describe('Substring filter on the example label'),
        section: z.string().optional().describe('Gallery section filter (e.g. "Variants", "Sizes")'),
        limit: z.number().int().min(1).max(20).default(8),
        offset: z.number().int().min(0).default(0),
        format: formatSchema,
      },
      annotations: readOnly,
    },
    ({ tag, kind, label, section, limit, offset, format }) => {
      const resolved = resolveElement(registry, tag)
      if (!resolved) return notFound(registry, tag)
      const all = resolved.component.examples.filter(
        (e) =>
          (!kind || e.kind === kind) &&
          (!label || e.label.toLowerCase().includes(label.toLowerCase())) &&
          (!section || (e.section ?? '').toLowerCase().includes(section.toLowerCase())),
      )
      const page = all.slice(offset, offset + limit)
      if (format === 'json') return json({ total: all.length, offset, examples: page })
      return text(all.length ? renderExamples(resolved.component, page, all.length, offset) : `No examples match for ${resolved.tag}.`)
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
      return text(renderTheme(registry.theme, registry, resolved?.component))
    },
  )

  server.registerTool(
    'generate_variant',
    {
      title: 'Generate a variant component',
      description:
        'Turns CSS variable / attribute overrides of a component into copy-paste code: a CSS class, HTML + <style>, a Lit subclass registered under your own tag, or JSON. Validates variable and attribute names against the component API. Start from a preset with `preset`.',
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
        html: z.string().optional().describe('Base markup; defaults to the preset markup or `<tag>Label</tag>`'),
        format: z.enum(['css', 'html', 'lit', 'json', 'all']).default('all'),
      },
      annotations: readOnly,
    },
    ({ tag, name, css, attributes, preset, html, format }) => {
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
      const changes = { css: { ...(presetItem?.css ?? {}), ...(css ?? {}) }, attributes: { ...(presetItem?.attributes ?? {}), ...(attributes ?? {}) } }
      const api = elementApiNames(resolved.element)
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
      const baseHtml = html ?? resolved.component.presets?.html ?? `<${resolved.tag}>Label</${resolved.tag}>`
      const input = { tag: resolved.tag, html: baseHtml, changes, name, className: resolved.className, modulePath: resolved.modulePath }
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
