/**
 * Builds `data/registry.json` for `@c2n/mcp` from the repository sources:
 *
 * - every `custom-elements.json` of `packages/components/*`, `packages/icons/*`, `open-packages/*` that is in the
 *   root wireit build list (tags, attributes, slots, events, CSS variables, composition)
 * - the docs pages `apps/ui/src/content/{components,icons,oepn-components}/*.mdx` (title, description, category,
 *   the UsageBlock rows) and `apps/ui/src/content/gallery/*.mdx` (styled variants)
 * - `apps/ui/src/data/component-presets.ts` and `component-previews.ts`
 * - `@c2n/theme` `dist/tokens.json` (tokens + variable → token mapping)
 * - the skill's reference guides (embedded so `npx @c2n/mcp` works offline)
 *
 * Run with `npm run build:registry -w packages/tools/mcp` (Node 24 type stripping: erasable TypeScript only).
 * The output is committed; no timestamp is written so CI can diff it for freshness.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseCssVarName } from '../src/lib/css-var-name.ts'
import type { ComponentEntry, CssProperty, ElementEntry, Example, GuideTopic, Preset, Registry, ThemeEntry, ThemeToken } from '../src/registry-types.ts'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../../..')
const uiRoot = join(repoRoot, 'apps/ui/src')
const outFile = join(packageRoot, 'data/registry.json')
const DOCS_BASE = 'https://code2nguyen.github.io/web-components'
const CATEGORIES = ['Inputs', 'Buttons', 'Navigation', 'Layout', 'Data display', 'Feedback', 'Chat', 'Icons']
const GUIDES: GuideTopic[] = ['workflow', 'theming', 'variant-components', 'frameworks']

interface Manifest {
  modules?: {
    path: string
    declarations?: {
      kind: string
      name: string
      description?: string
      tagName?: string
      customElement?: boolean
      attributes?: { name: string; type?: { text?: string }; default?: string; description?: string }[]
      slots?: { name?: string; description?: string }[]
      events?: { name: string; type?: { text?: string }; description?: string }[]
      cssProperties?: { name?: string; type?: { text?: string }; default?: string; description?: string }[]
      internalComponents?: string[]
      slotComponents?: string[]
    }[]
  }[]
}

interface PackageJson {
  name: string
  main?: string
  exports?: Record<string, unknown>
  customElements?: string
}

interface DocPage {
  id: string
  section: 'components' | 'icons' | 'open'
  frontmatter: Record<string, string>
  body: string
}

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T
}

function listDirs(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(dir, d.name))
    : []
}

/** Frontmatter is flat `key: 'value'` lines; no YAML library needed. */
function parseFrontmatter(source: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  if (!match) return { frontmatter: {}, body: source }
  const frontmatter: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    frontmatter[kv[1]] = kv[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return { frontmatter, body: source.slice(match[0].length) }
}

function parseFenceMeta(meta: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const m of meta.matchAll(/([^=,;\s]+)=([^,;]+)/g)) result[m[1]] = m[2].trim()
  return result
}

interface Fence {
  lang: string
  meta: Record<string, string>
  body: string
  /** Nearest `## Heading` above the fence. */
  section?: string
}

function readFences(body: string): Fence[] {
  const fences: Fence[] = []
  const lines = body.split('\n')
  let section: string | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const heading = /^##\s+(.+)$/.exec(line)
    if (heading) section = heading[1].trim()
    const open = /^```([a-z]+)\s+(.*)$/.exec(line)
    if (!open) continue
    const bodyLines: string[] = []
    let j = i + 1
    while (j < lines.length && lines[j] !== '```') bodyLines.push(lines[j++])
    fences.push({ lang: open[1], meta: parseFenceMeta(open[2]), body: bodyLines.join('\n').trim(), section })
    i = j
  }
  return fences
}

function splitStyle(html: string): { css?: string; html: string } {
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)
  if (!style) return { html: html.trim() }
  return { css: dedent(style[1]), html: html.replace(style[0], '').trim() }
}

function dedent(text: string): string {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n')
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length))
  return lines.map((l) => l.slice(indent)).join('\n')
}

/** Splits a UsageBlock body into its `<div data-label="…">…</div>` rows (rows may contain nested divs). */
function usageRows(html: string): { label: string; html: string }[] {
  const rows: { label: string; html: string }[] = []
  const open = /<div data-label="([^"]+)">/g
  let match: RegExpExecArray | null
  while ((match = open.exec(html))) {
    let depth = 1
    let cursor = match.index + match[0].length
    const tokens = /<div\b|<\/div>/g
    tokens.lastIndex = cursor
    let token: RegExpExecArray | null
    let end = html.length
    while ((token = tokens.exec(html))) {
      depth += token[0] === '</div>' ? -1 : 1
      if (depth === 0) {
        end = token.index
        cursor = token.index + token[0].length
        break
      }
    }
    rows.push({ label: match[1], html: dedent(html.slice(match.index + match[0].length, end)) })
    open.lastIndex = cursor
  }
  return rows
}

/** `@c2n/tabs` + `src/tab.ts` → `@c2n/tabs/tab.js`; `@c2n/feather-icons` + `src/icons/x.ts` → `@c2n/feather-icons/icons/x.js`. */
function modulePathFor(pkg: PackageJson, modulePath: string): string {
  const rel = modulePath.replace(/^src\//, '').replace(/\.ts$/, '')
  const exportsMap = pkg.exports ?? {}
  const mainTarget = typeof exportsMap['.'] === 'object' && exportsMap['.'] ? (exportsMap['.'] as { default?: string }).default : pkg.main
  if (mainTarget && mainTarget.replace(/^\.\//, '').replace(/\.js$/, '') === `dist/${rel}`) return pkg.name
  for (const key of Object.keys(exportsMap)) {
    if (key === '.' || key.endsWith('.json')) continue
    const pattern = new RegExp('^' + key.replace(/^\.\//, '').replace(/\./g, '\\.').replace(/\*/g, '(.+)') + '$')
    if (pattern.test(`${rel}.js`)) return `${pkg.name}/${rel}.js`
  }
  return pkg.name
}

// ---------------------------------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------------------------------

const rootPackage = readJson<{ wireit: { build: { dependencies: string[] } } }>(join(repoRoot, 'package.json'))
const buildList = new Set(rootPackage.wireit.build.dependencies.map((d) => d.replace(/^\.\//, '').replace(/:build$/, '')))
const c2nVersion = readJson<{ version: string }>(join(repoRoot, 'lerna.json')).version

const docPages: DocPage[] = []
for (const [dir, section] of [
  ['components', 'components'],
  ['icons', 'icons'],
  ['oepn-components', 'open'],
] as const) {
  const base = join(uiRoot, 'content', dir)
  if (!existsSync(base)) continue
  for (const file of readdirSync(base)
    .filter((f) => f.endsWith('.mdx'))
    .sort()) {
    const { frontmatter, body } = parseFrontmatter(readFileSync(join(base, file), 'utf8'))
    docPages.push({ id: basename(file, '.mdx'), section, frontmatter, body })
  }
}
const galleryDir = join(uiRoot, 'content/gallery')
const galleryPages = new Map<string, DocPage>()
for (const file of existsSync(galleryDir) ? readdirSync(galleryDir).filter((f) => f.endsWith('.mdx')) : []) {
  const { frontmatter, body } = parseFrontmatter(readFileSync(join(galleryDir, file), 'utf8'))
  galleryPages.set(basename(file, '.mdx'), { id: basename(file, '.mdx'), section: 'components', frontmatter, body })
}

const { componentPresets } = (await import(pathToFileURL(join(uiRoot, 'data/component-presets.ts')).href)) as {
  componentPresets: Record<string, { html: string; presets: Preset[] }>
}
const { componentPreviews } = (await import(pathToFileURL(join(uiRoot, 'data/component-previews.ts')).href)) as { componentPreviews: Record<string, string> }

const themeTokensFile = join(repoRoot, 'packages/tools/theme/dist/tokens.json')
const themeData = existsSync(themeTokensFile)
  ? readJson<{ tokens: Omit<ThemeToken, 'usedBy'>[]; mapping: Record<string, string> }>(themeTokensFile)
  : (console.warn('[build-registry] packages/tools/theme/dist/tokens.json missing (build @c2n/theme first); theme mapping left empty'),
    { tokens: [], mapping: {} })

const guides = Object.fromEntries(
  GUIDES.map((topic) => [topic, readFileSync(join(repoRoot, 'packages/tools/skill/skills/c2n-components/references', `${topic}.md`), 'utf8')]),
) as Record<GuideTopic, string>

// ---------------------------------------------------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------------------------------------------------

const components: Record<string, ComponentEntry> = {}
const tagIndex: Record<string, string> = {}
const packageIndex: Record<string, string> = {}
const problems: string[] = []

const packageDirs = [
  ...listDirs(join(repoRoot, 'packages/components')),
  ...listDirs(join(repoRoot, 'packages/icons')),
  ...listDirs(join(repoRoot, 'open-packages')),
]

for (const dir of packageDirs.sort()) {
  const relDir = dir.slice(repoRoot.length + 1)
  if (!buildList.has(relDir)) continue
  const pkgJsonFile = join(dir, 'package.json')
  if (!existsSync(pkgJsonFile)) continue
  const pkg = readJson<PackageJson>(pkgJsonFile)
  const manifestFile = join(dir, pkg.customElements ?? 'custom-elements.json')
  if (!existsSync(manifestFile)) {
    problems.push(`${pkg.name}: no custom-elements.json (build the package)`)
    continue
  }
  const manifest = readJson<Manifest>(manifestFile)
  const shortName = pkg.name.replace(/^@c2n\//, '')
  const doc = docPages.find((d) => (d.frontmatter.package ?? `@c2n/${d.id}`) === pkg.name)
  const id = doc?.id ?? shortName

  const elements: ElementEntry[] = []
  const internal = new Set<string>()
  const slotted = new Set<string>()
  for (const mod of manifest.modules ?? []) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue
      decl.internalComponents?.forEach((t) => internal.add(t))
      decl.slotComponents?.forEach((t) => slotted.add(t))
      const cssProperties: CssProperty[] = []
      for (const prop of decl.cssProperties ?? []) {
        if (!prop.name) continue
        const parsed = parseCssVarName(prop.name)
        cssProperties.push({
          name: prop.name,
          type: prop.type?.text ?? '',
          default: prop.default?.trim() || undefined,
          part: parsed?.parts.join('/') ?? '',
          state: parsed?.states.join('/') || undefined,
          property: parsed?.property ?? prop.name,
          token: themeData.mapping[prop.name],
          description: prop.description?.trim() || undefined,
        })
      }
      elements.push({
        tag: decl.tagName,
        className: decl.name,
        modulePath: modulePathFor(pkg, mod.path),
        description: decl.description?.trim() ?? '',
        attributes: (decl.attributes ?? []).map((a) => ({
          name: a.name,
          type: a.type?.text ?? '',
          default: a.default,
          description: a.description?.trim() || undefined,
        })),
        slots: (decl.slots ?? []).map((s) => ({ name: s.name ?? '', description: s.description?.trim() || undefined })),
        events: (decl.events ?? []).map((e) => ({ name: e.name, type: e.type?.text, description: e.description?.trim() || undefined })),
        cssProperties,
      })
    }
  }
  if (elements.length === 0) {
    problems.push(`${pkg.name}: manifest has no custom element`)
    continue
  }

  // Icon sets: hundreds of identical elements collapse into one entry with a tag pattern.
  let tagPattern: string | undefined
  let icons: string[] | undefined
  if (elements.length > 20) {
    const prefix = elements[0].tag.replace(/[a-z0-9]+$/, '')
    const common = elements.every((e) => e.tag.startsWith(prefix))
    if (common) {
      icons = elements.map((e) => e.tag.slice(prefix.length)).sort()
      tagPattern = `${prefix}{name}`
      const sample = elements.find((e) => e.tag === `${prefix}${icons[0]}`) ?? elements[0]
      elements.splice(0, elements.length, {
        ...sample,
        tag: tagPattern,
        className: sample.className.replace(
          new RegExp(
            icons[0]
              .split('-')
              .map((p) => p[0].toUpperCase() + p.slice(1))
              .join(''),
          ),
          '{Name}',
        ),
        modulePath: sample.modulePath.replace(icons[0], '{name}'),
      })
    }
  }

  const examples: Example[] = []
  if (doc) {
    for (const fence of readFences(doc.body)) {
      if (fence.meta.tag === 'UsageBlock') {
        const { css, html } = splitStyle(fence.body)
        for (const row of usageRows(html)) examples.push({ kind: 'usage', label: row.label, html: row.html, css })
      }
    }
  }
  const gallery = galleryPages.get(id)
  if (gallery) {
    for (const fence of readFences(gallery.body)) {
      if (fence.meta.tag !== 'MdxCodeBlock') continue
      const { css, html } = splitStyle(fence.body)
      examples.push({ kind: 'gallery', label: fence.meta.label ?? 'Example', section: fence.section, html, css })
    }
  }
  if (componentPreviews[id]) examples.push({ kind: 'preview', label: 'Preview', html: componentPreviews[id] })

  const presetGroup = componentPresets[elements[0].tag]
  const category = doc?.section === 'icons' ? 'Icons' : (doc?.frontmatter.category ?? 'Layout')
  const intro = doc?.body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('import ') && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('<'))
  const firstTag = elements[0].tag
  const entry: ComponentEntry = {
    id,
    package: pkg.name,
    title: doc?.frontmatter.title ?? shortName,
    description: doc?.frontmatter.description ?? '',
    intro,
    category,
    status: doc ? 'stable' : 'undocumented',
    docsUrl: `${DOCS_BASE}/${doc?.section === 'icons' ? 'icons' : 'components'}/${id}`,
    elements,
    tagPattern,
    icons,
    composition: { internal: [...internal].sort(), slotted: [...slotted].sort(), usedBy: [] },
    install: {
      npm: `npm install ${pkg.name} @c2n/theme`,
      import: tagPattern ? `import '${elements[0].modulePath}'` : `import '${pkg.name}'`,
      importClass: `import { ${elements[0].className} } from '${elements[0].modulePath}'`,
    },
    presets: presetGroup ? { html: presetGroup.html, items: presetGroup.presets } : undefined,
    examples,
    hasGallery: !!gallery,
  }
  components[id] = entry
  packageIndex[pkg.name] = id
  for (const element of elements) if (!element.tag.includes('{')) tagIndex[element.tag] = id
  if (firstTag && !tagIndex[firstTag] && !tagPattern) tagIndex[firstTag] = id
}

// Inverse composition graph.
for (const entry of Object.values(components)) {
  for (const tag of [...entry.composition.internal, ...entry.composition.slotted]) {
    const target = components[tagIndex[tag] ?? '']
    if (target && !target.composition.usedBy.includes(entry.elements[0].tag)) target.composition.usedBy.push(entry.elements[0].tag)
  }
}

// Drift guards.
for (const doc of docPages) {
  const pkgName = doc.frontmatter.package ?? `@c2n/${doc.id}`
  if (!packageIndex[pkgName]) problems.push(`docs page ${doc.section}/${doc.id}.mdx: no built package ${pkgName}`)
}
for (const tag of Object.keys(componentPresets)) if (!tagIndex[tag]) problems.push(`component-presets.ts: unknown tag ${tag}`)

// ---------------------------------------------------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------------------------------------------------

const usedBy = new Map<string, number>()
for (const token of Object.values(themeData.mapping)) usedBy.set(token, (usedBy.get(token) ?? 0) + 1)
const theme: ThemeEntry = {
  package: '@c2n/theme',
  install: { npm: 'npm install @c2n/theme', imports: ["import '@c2n/theme/theme.css'", "import '@c2n/theme/tokens.css'", "import '@c2n/theme/base.css'"] },
  tokens: themeData.tokens.map((t) => ({ ...t, usedBy: usedBy.get(t.name) ?? 0 })),
  mapping: themeData.mapping,
  darkMode:
    "Dark values apply under [data-theme='dark'] or .c2-dark, and under prefers-color-scheme: dark when no data-theme is set; data-theme='light' / .c2-light opts a subtree out.",
}

const registry: Registry = {
  schemaVersion: 1,
  c2nVersion,
  categories: CATEGORIES,
  components: Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b))),
  tagIndex: Object.fromEntries(Object.entries(tagIndex).sort(([a], [b]) => a.localeCompare(b))),
  packageIndex: Object.fromEntries(Object.entries(packageIndex).sort(([a], [b]) => a.localeCompare(b))),
  theme,
  guides,
}

if (problems.length) {
  console.error(`[build-registry] ${problems.length} problem(s):\n  ${problems.join('\n  ')}`)
  process.exitCode = 1
} else {
  writeFileSync(outFile, JSON.stringify(registry, null, 2) + '\n')
  const total = Object.keys(components).length
  const examplesCount = Object.values(components).reduce((n, c) => n + c.examples.length, 0)
  console.log(
    `[build-registry] ${total} components, ${Object.keys(tagIndex).length} tags, ${examplesCount} examples, ${theme.tokens.length} tokens → ${outFile}`,
  )
}
