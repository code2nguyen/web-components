import type { APIRoute } from 'astro'
import skill from '../../../../packages/tools/skill/skills/c2n-components/SKILL.md?raw'
import workflow from '../../../../packages/tools/skill/skills/c2n-components/references/workflow.md?raw'
import theming from '../../../../packages/tools/skill/skills/c2n-components/references/theming.md?raw'
import variants from '../../../../packages/tools/skill/skills/c2n-components/references/variant-components.md?raw'
import frameworks from '../../../../packages/tools/skill/skills/c2n-components/references/frameworks.md?raw'
import catalog from '../../../../packages/tools/skill/skills/c2n-components/references/component-catalog.md?raw'

export const prerender = true

/**
 * `/llms-full.txt` — the c2n agent skill as one plain-text document, for agents that can fetch a URL but have neither
 * the MCP server nor `@c2n/skill` installed. The sources are the hand-written skill files under
 * `packages/tools/skill/skills/c2n-components/` plus the generated component catalog; nothing here is authored twice.
 */

/** The skill files link each other as `references/<name>.md`; in one document those become section anchors. */
const references: Record<string, { title: string; body: string }> = {
  'references/workflow.md': { title: 'Application workflow', body: workflow },
  'references/theming.md': { title: 'Theming', body: theming },
  'references/variant-components.md': { title: 'Variant and composed components', body: variants },
  'references/frameworks.md': { title: 'Frameworks', body: frameworks },
  'references/component-catalog.md': { title: 'Component catalog', body: catalog },
}

const stripFrontmatter = (markdown: string) => markdown.replace(/^---\n[\s\S]*?\n---\n/, '')

/** Drop a file's own h1 (the section heading replaces it) and push the remaining headings one level down. */
const nest = (markdown: string) =>
  markdown
    .replace(/^\s*# .*\n+/, '')
    .replace(/^(#{1,5}) /gm, '#$1 ')
    .trim()

const anchor = (title: string) => `#${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

const rewriteLinks = (markdown: string) =>
  Object.entries(references)
    .reduce((text, [path, { title }]) => text.replaceAll(`\`${path}\``, `[${title}](${anchor(title)})`).replaceAll(path, anchor(title)), markdown)
    .replace('The references in `references/` hold the details; read only the one the current step points to.', 'The sections below hold the details.')

export const GET: APIRoute = () => {
  const root = new URL(import.meta.env.BASE_URL, import.meta.env.SITE).href.replace(/\/$/, '')

  const sections = Object.values(references).map(({ title, body }) => `## ${title}\n\n${nest(rewriteLinks(body))}`)

  const text = `# C2N Web Components — agent skill

> The full text of the \`c2n-components\` skill from \`@c2n/skill\`: how to build and theme an application with the \`c2-*\` web components from \`@c2n/*\`. The documentation map is at ${root}/llms.txt; exact component APIs come from the c2n MCP server (\`npx -y @c2n/mcp\`) or an installed package's \`custom-elements.json\`.

## Skill

${nest(rewriteLinks(stripFrontmatter(skill)))}

${sections.join('\n\n')}
`

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
