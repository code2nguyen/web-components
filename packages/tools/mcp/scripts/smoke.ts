/** Spawns the server over stdio and exercises every tool and resource. `npm run smoke -w packages/tools/mcp`. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entry = process.argv[2] ?? join(packageRoot, 'src/cli.ts')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[smoke] ${message}`)
}

function textOf(result: { content?: unknown }): string {
  const content = result.content as { type: string; text?: string }[]
  return content.map((c) => c.text ?? '').join('\n')
}

const client = new Client({ name: 'c2n-smoke', version: '0.0.0' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], cwd: packageRoot }))

const { tools } = await client.listTools()
assert(tools.length === 9, `expected 9 tools, got ${tools.length}: ${tools.map((t) => t.name).join(', ')}`)

const list = textOf(await client.callTool({ name: 'list_components', arguments: {} }))
assert(list.includes('c2-button') && list.includes('@c2n/button'), 'list_components lacks c2-button')

const tab = textOf(await client.callTool({ name: 'get_component', arguments: { tag: 'c2-tab' } }))
assert(tab.includes("import '@c2n/components/tabs'"), 'get_component c2-tab must resolve @c2n/components/tabs')

const chart = textOf(await client.callTool({ name: 'get_component', arguments: { tag: 'c2-line-chart' } }))
assert(chart.includes("import '@c2n/components/chart/line-chart'"), 'get_component c2-line-chart must resolve its own entry')

const icon = textOf(await client.callTool({ name: 'get_component', arguments: { tag: 'c2-feather-arrow-right' } }))
assert(icon.includes('@c2n/feather-icons/icons/arrow-right.js'), 'icon tag must resolve to its module')

const search = textOf(await client.callTool({ name: 'search_components', arguments: { query: 'dropdown select' } }))
assert(search.includes('c2-select'), 'search_components should find c2-select')

const examples = textOf(await client.callTool({ name: 'get_examples', arguments: { tag: 'button', kind: 'gallery', limit: 2 } }))
assert(examples.includes('```html'), 'get_examples should return fenced html')

const index = textOf(await client.callTool({ name: 'get_examples', arguments: { tag: 'c2-button', view: 'index' } }))
assert(index.includes('`variants--soft`') && !index.includes('```html'), 'get_examples index should list slugs without code')
const card = textOf(await client.callTool({ name: 'get_examples', arguments: { tag: 'c2-button', label: 'variants--outline' } }))
assert(card.includes('var(--c2-theme--color-outline') && card.includes('gallery-shots/button/variants--outline.light.png'), 'gallery card should be themed')
const looks = textOf(await client.callTool({ name: 'search_examples', arguments: { query: 'underline' } }))
assert(looks.includes('Text Field'), 'search_examples should find the underline text field')
const fromCard = textOf(
  await client.callTool({ name: 'generate_variant', arguments: { tag: 'c2-button', name: 'app-outline-button', example: 'variants--outline', format: 'css' } }),
)
assert(fromCard.includes('.app-outline-button') && fromCard.includes('--c2-theme--color-outline'), 'generate_variant should start from a gallery card')

const presets = textOf(await client.callTool({ name: 'get_presets', arguments: { tag: 'c2-button' } }))
assert(presets.includes('```css'), 'get_presets should return css blocks')

const theme = textOf(await client.callTool({ name: 'get_theme', arguments: {} }))
assert(theme.includes('--c2-theme--color-primary'), 'get_theme lacks tokens')

const variant = textOf(
  await client.callTool({
    name: 'generate_variant',
    arguments: {
      tag: 'c2-button',
      name: 'app-danger-button',
      css: { '--c2-button__container--background-color': 'var(--c2-theme--color-error)' },
      format: 'lit',
    },
  }),
)
assert(variant.includes('extends Button') && variant.includes("from '@c2n/components/button'"), 'generate_variant lit output is wrong')

const badVariant = textOf(
  await client.callTool({
    name: 'generate_variant',
    arguments: { tag: 'c2-button', name: 'app-x', css: { '--c2-button__container--backgroundcolor': 'red' }, format: 'css' },
  }),
)
assert(badVariant.includes('Unknown variable'), 'generate_variant should warn on unknown variables')

const guide = textOf(await client.callTool({ name: 'get_workflow_guide', arguments: { topic: 'variant-components' } }))
assert(guide.includes('::part'), 'guide text missing')

const { resources } = await client.listResources()
assert(
  resources.some((r) => r.uri === 'c2n://theme'),
  'c2n://theme resource missing',
)
const themeResource = await client.readResource({ uri: 'c2n://theme' })
assert(JSON.parse((themeResource.contents[0] as { text: string }).text).tokens.length > 20, 'theme resource lacks tokens')
const componentResource = await client.readResource({ uri: 'c2n://components/c2-checkbox' })
assert((componentResource.contents[0] as { text: string }).text.includes('"id": "checkbox"'), 'component resource wrong')

await client.close()

// A project that installed only `@c2n/components`, which bundles every component package. The server must read
// their API from the umbrella's merged manifest and hand out umbrella import lines.
const project = mkdtempSync(join(tmpdir(), 'c2n-smoke-'))
try {
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'app', dependencies: { '@c2n/components': '*' } }))
  mkdirSync(join(project, 'node_modules/@c2n'), { recursive: true })
  symlinkSync(resolve(packageRoot, '../../umbrella'), join(project, 'node_modules/@c2n/components'), 'dir')
  const umbrellaClient = new Client({ name: 'c2n-smoke-umbrella', version: '0.0.0' })
  await umbrellaClient.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      cwd: packageRoot,
      env: { ...process.env, C2N_PROJECT_ROOT: project } as Record<string, string>,
    }),
  )
  const column = textOf(await umbrellaClient.callTool({ name: 'get_component', arguments: { tag: 'c2-table-column', include: ['attributes'] } }))
  assert(column.includes("import '@c2n/components/table'") && column.includes('through `@c2n/components`'), 'get_component ignores @c2n/components')
  const installedOnly = textOf(await umbrellaClient.callTool({ name: 'list_components', arguments: { installedOnly: true } }))
  assert(installedOnly.includes('c2-button') && !installedOnly.includes('c2-feather-'), 'list_components installedOnly misreads @c2n/components')
  const umbrellaTheme = textOf(await umbrellaClient.callTool({ name: 'get_theme', arguments: {} }))
  assert(umbrellaTheme.includes('@c2n/components/theme.css'), 'get_theme ignores @c2n/components')
  await umbrellaClient.close()
} finally {
  rmSync(project, { recursive: true, force: true })
}

console.log(`[smoke] ok: ${tools.length} tools, ${resources.length} resources, entry ${entry}`)
