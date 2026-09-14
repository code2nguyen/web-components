import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

export const prerender = true

function link(root: string, path: string) {
  return `${root}${path}`
}

export const GET: APIRoute = async () => {
  const root = new URL(import.meta.env.BASE_URL, import.meta.env.SITE).href.replace(/\/$/, '')
  const [components, galleries, icons] = await Promise.all([getCollection('components'), getCollection('gallery'), getCollection('icons')])
  const galleryIds = new Set(galleries.map((entry) => entry.id))

  const componentsByCategory = Map.groupBy(
    components.sort((a, b) => a.data.title.localeCompare(b.data.title)),
    (entry) => entry.data.category,
  )

  const componentSections = [...componentsByCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, entries]) => {
      const items = entries.map((entry) => {
        const docs = link(root, `/components/${entry.id}/`)
        const api = link(root, `/components/${entry.id}/api/`)
        const gallery = galleryIds.has(entry.id) ? `; [gallery](${link(root, `/components/${entry.id}/gallery/`)})` : ''
        return `- [${entry.data.title}](${docs}): ${entry.data.description} ([API](${api})${gallery})`
      })
      return `### ${category}\n\n${items.join('\n')}`
    })
    .join('\n\n')

  const iconItems = icons
    .sort((a, b) => a.data.title.localeCompare(b.data.title))
    .map((entry) => `- [${entry.data.title}](${link(root, `/icons/${entry.id}/`)}): ${entry.data.description}`)
    .join('\n')

  const body = `# C2N Web Components

> Framework-agnostic Lit web components published as individual \`@c2n/*\` npm packages. Components use the \`c2-*\` custom-element prefix, work in plain HTML and major frameworks, and expose their visual design through CSS custom properties.

Use this file as a map of the documentation. Component pages contain installation and usage guidance, gallery pages contain complete styled examples, and API pages are generated from each package's custom-elements manifest.

## Start here

- [Documentation home](${link(root, '/')})
- [Component index](${link(root, '/components/')})
- [Icon index](${link(root, '/icons/')})
- [Example applications](${link(root, '/examples/')})
- [GitHub repository](https://github.com/code2nguyen/web-components)

## Core conventions

- Install only the package you need, for example \`npm install @c2n/text-field\`.
- Importing a package registers its custom element, for example \`import '@c2n/text-field'\`.
- Theme components with inheritable CSS variables. Component variables follow \`--c2-<component>__<part>--<property>\`.
- Prefer public properties for non-string values when using a framework.
- Text, selection, toggle, range, and chat form controls participate in \`FormData\`, reset, disabled fieldsets, and constraint validation.

## Guides

- [Application workflow](${link(root, '/guides/application-workflow/')}): Build complete applications with C2N components across supported frameworks.
- [Theming](${link(root, '/guides/theming/')}): Theme individual components or an application through CSS variables and \`@c2n/theme\`.
- [AI tools](${link(root, '/guides/ai-tools/')}): Use the C2N MCP server and component skill with coding agents.

## Components

${componentSections}

## Icon packages

${iconItems}

## Complete examples

- [Plain HTML form](${link(root, '/examples/basic-form-html/')})
- [Angular orders admin](${link(root, '/examples/orders-admin-angular/')})
- [React trading dashboard](${link(root, '/examples/trading-dashboard-react/')})
- [Vue support inbox](${link(root, '/examples/support-inbox-vue/')})
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
