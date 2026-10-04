import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { EXAMPLE_FRAMEWORK_LABELS, EXAMPLE_FRAMEWORKS } from '../schemas'
import umbrella from '@c2n/components/package.json'

export const prerender = true

/**
 * `/llms.txt` — the documentation map for coding agents (https://llmstxt.org). Generated from the content collections
 * so it lists every component, guide, icon set and example the site does. `/llms-full.txt` carries the skill text.
 */
export const GET: APIRoute = async () => {
  const root = new URL(import.meta.env.BASE_URL, import.meta.env.SITE).href.replace(/\/$/, '')
  const link = (path: string) => `${root}${path}`

  const [components, galleries, icons, guides, examples] = await Promise.all([
    getCollection('components'),
    getCollection('gallery'),
    getCollection('icons'),
    getCollection('guides'),
    getCollection('examples'),
  ])
  const galleryIds = new Set(galleries.map((entry) => entry.id))

  const componentsByCategory = Map.groupBy(
    components.sort((a, b) => a.data.title.localeCompare(b.data.title)),
    (entry) => entry.data.category,
  )

  const componentSections = [...componentsByCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, entries]) => {
      const items = entries.map((entry) => {
        // Every component ships in @c2n/components, under its package's entry; a page documenting one element of a
        // multi-element package (a chart) points at that element's own module when the package publishes it.
        const name = (entry.data.package ?? `@c2n/${entry.id}`).slice('@c2n/'.length)
        const single = `./${name}/${entry.id}`
        const pkg = single in umbrella.exports ? `@c2n/components${single.slice(1)}` : `@c2n/components/${name}`
        const tag = entry.data.tag ?? `c2-${entry.id}`
        const docs = link(`/components/${entry.id}/`)
        const api = link(`/components/${entry.id}/api/`)
        const gallery = galleryIds.has(entry.id) ? `; [gallery](${link(`/components/${entry.id}/gallery/`)})` : ''
        return `- [${entry.data.title}](${docs}): \`${tag}\` from \`${pkg}\`. ${entry.data.description} ([API](${api})${gallery})`
      })
      return `### ${category}\n\n${items.join('\n')}`
    })
    .join('\n\n')

  const guideItems = guides
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title))
    .map((entry) => `- [${entry.data.title}](${link(`/guides/${entry.id}/`)}): ${entry.data.description}`)
    .join('\n')

  const iconItems = icons
    .sort((a, b) => a.data.title.localeCompare(b.data.title))
    .map((entry) => `- [${entry.data.title}](${link(`/icons/${entry.id}/`)}): ${entry.data.description}`)
    .join('\n')

  const frameworkRank = (framework: (typeof EXAMPLE_FRAMEWORKS)[number]) => EXAMPLE_FRAMEWORKS.indexOf(framework)
  const exampleItems = examples
    .sort((a, b) => frameworkRank(a.data.framework) - frameworkRank(b.data.framework) || a.data.order - b.data.order)
    .map((entry) => `- [${entry.data.title} (${EXAMPLE_FRAMEWORK_LABELS[entry.data.framework]})](${link(`/examples/${entry.id}/`)}): ${entry.data.description}`)
    .join('\n')

  const body = `# C2N Web Components

> Framework-agnostic Lit web components published as one npm package, \`@c2n/components\`, with an entry per component. Components use the \`c2-*\` custom-element prefix, work in plain HTML and major frameworks, and expose their visual design through CSS custom properties.

Use this file as a map of the documentation. Component pages contain installation and usage guidance, gallery pages contain complete styled examples, and API pages are generated from each package's custom-elements manifest. [llms-full.txt](${link('/llms-full.txt')}) holds the full text of the c2n agent skill: the application workflow, theming rules, variant patterns, framework notes and a compact component catalog.

## Start here

- [Documentation home](${link('/')})
- [Getting started](${link('/getting-started/')})
- [Component index](${link('/components/')})
- [Icon index](${link('/icons/')})
- [Example applications](${link('/examples/')})
- [Changelog](${link('/changelog/')})
- [GitHub repository](https://github.com/code2nguyen/web-components)

## For coding agents

Exact component facts (attributes, slots, events, CSS parts, CSS variables) come from structured sources, never from memory:

- **MCP server**: \`npx -y @c2n/mcp\` (stdio) exposes \`list_components\`, \`search_components\`, \`get_component\`, \`get_examples\`, \`get_presets\`, \`get_theme\`, \`generate_variant\` and \`get_workflow_guide\` over a bundled registry built from every package.
- **Skill**: \`npm install --save-dev @c2n/skill && npx c2n-skill install\` copies the \`c2n-components\` skill into a project for Claude Code, Codex or Google Antigravity and merges the MCP server into their configuration.
- **Manifests**: \`@c2n/components\` ships one merged \`custom-elements.json\` (\`node_modules/@c2n/components/custom-elements.json\`, also exported as \`@c2n/components/custom-elements.json\`), the same data the API pages render.
- **Framework glue**: \`@c2n/components/react\` (JSX types) and \`@c2n/components/vue\` (Volar types) declare every tag; \`@c2n/angular\` supplies the \`ControlValueAccessor\` pair for form controls; \`@c2n/framework-types\` ships \`html-custom-data.json\` and \`web-types.json\` for editors.
- **Theme**: \`@c2n/theme\` defines the \`--c2-theme--*\` tokens; import \`@c2n/components/theme.css\` once and set tokens instead of per-component variables when a token exists.

## Core conventions

- Install the one component package, \`npm install @c2n/components\`, and import only the components you use.
- Importing a component's entry registers its custom element, for example \`import '@c2n/components/text-field'\`.
- Theme components with inheritable CSS variables. Component variables follow \`--c2-<component>__<part>[__<state>]--<property>\`.
- Prefer public properties for non-string values when using a framework.
- Text, selection, toggle, range, and chat form controls participate in \`FormData\`, reset, disabled fieldsets, and constraint validation.
- \`selection-change\` does not bubble: listen on the element itself. Form controls also fire plain \`input\`/\`change\`.

## Guides

${guideItems}

## Components

${componentSections}

## Icon packages

${iconItems}

## Complete examples

${exampleItems}
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
