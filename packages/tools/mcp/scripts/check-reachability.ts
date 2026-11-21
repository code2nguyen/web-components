/**
 * Every component is reachable by a coding agent through this MCP server and the docs site's `/llms.txt`
 * (`packages/components/CLAUDE.md`, "Reachable through MCP and llms.txt"). Both are generated, so this checks their
 * inputs over the built registry (`npm run build:registry` first):
 *
 * - the entry has a docs page (`status: "stable"`) in a collection the site serves (`content/components` or
 *   `content/icons`), which is also what puts it in `/llms.txt`;
 * - its page has a `description` and at least three `intents` (the generator's `TODO:` placeholders are dropped by the
 *   registry build, so they count as missing);
 * - a component (not an icon set) has an `@c2n/components` entry, so the import line both sources print works;
 * - every element of the package resolves by its tag.
 *
 * `KNOWN` holds deliberate, dated exceptions, each with its reason. It is a ratchet: an entry that no longer fails is
 * reported as stale, so the list only shrinks.
 *
 * Kept out of `build-registry.ts` on purpose: a problem there stops the registry being written, and the session-start
 * hook needs the registry for the `c2n` server even while a freshly scaffolded component still has `TODO:` intents.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Registry } from '../src/registry-types.ts'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../../..')
const registryFile = join(packageRoot, 'data/registry.json')
const contentRoot = join(repoRoot, 'apps/ui/src/content')
const MIN_INTENTS = 3

const KNOWN: Record<string, string> = {
  chatbot: 'docs page is apps/ui/src/content/oepn-components/chatbot.mdx, which no content collection loads, and has no description (2026-11-21)',
}

if (!existsSync(registryFile)) {
  console.error(`[reachability] ${registryFile} is missing: run \`npm run build:registry -w packages/tools/mcp\` first`)
  process.exit(1)
}
const registry = JSON.parse(readFileSync(registryFile, 'utf8')) as Registry

const failing = new Map<string, string[]>()
for (const entry of Object.values(registry.components)) {
  const problems: string[] = []
  const isIconSet = entry.category === 'Icons'
  const docsPage = join(contentRoot, isIconSet ? 'icons' : 'components', `${entry.id}.mdx`)
  if (entry.status !== 'stable') problems.push('no docs page: the registry marks it undocumented and /llms.txt does not list it')
  else if (!existsSync(docsPage)) problems.push(`no page at ${docsPage.slice(repoRoot.length + 1)}: not on the docs site or in /llms.txt`)
  if (!entry.description.trim()) problems.push('docs page has no `description`')
  if (entry.intents.length < MIN_INTENTS) problems.push(`${entry.intents.length} intents (at least ${MIN_INTENTS}; \`TODO:\` placeholders do not count)`)
  if (!isIconSet && !entry.install.umbrella) problems.push(`${entry.package} is not in @c2n/components`)
  for (const element of entry.elements)
    if (!element.tag.includes('{') && !registry.tagIndex[element.tag]) problems.push(`${element.tag} does not resolve by tag`)
  if (problems.length) failing.set(entry.id, problems)
}

const errors: string[] = []
for (const [id, problems] of failing) if (!KNOWN[id]) errors.push(`${id}: ${problems.join('; ')}`)
for (const id of Object.keys(KNOWN))
  if (!failing.has(id)) errors.push(`${id}: listed in KNOWN but reachable now (or gone): remove it from scripts/check-reachability.ts`)

if (errors.length) {
  console.error(`\n[reachability] ${errors.length} component(s) an agent cannot fully reach:\n`)
  for (const error of errors) console.error(`  - ${error}`)
  console.error(`\nSee "Reachable through MCP and llms.txt" in packages/components/CLAUDE.md.`)
  process.exit(1)
}
const known = Object.keys(KNOWN).length
console.log(
  `[reachability] ${Object.keys(registry.components).length - known} components reachable through MCP and /llms.txt${known ? `, ${known} known exception(s)` : ''}`,
)
