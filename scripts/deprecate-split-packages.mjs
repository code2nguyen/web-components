/**
 * Deprecates the per-component `@c2n/<name>` packages on npm, pointing each one at its `@c2n/components` entry.
 *
 * Up to 0.0.24 every component was published as its own package; since then only `@c2n/components` is, bundling
 * the private workspace packages listed in its devDependencies. The release workflow runs this after publishing.
 * It is idempotent: a package that was never published is skipped, one already carrying the message is left alone.
 *
 *   node scripts/deprecate-split-packages.mjs            # deprecate (needs an npm token with publish rights)
 *   node scripts/deprecate-split-packages.mjs --dry-run  # print what would change
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const dryRun = process.argv.includes('--dry-run')
const umbrella = JSON.parse(readFileSync(new URL('../packages/umbrella/package.json', import.meta.url), 'utf8'))
const bundled = Object.keys(umbrella.devDependencies ?? {}).filter((name) => name.startsWith('@c2n/') && name !== '@c2n/config')

const npm = (...args) => execFileSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

let deprecated = 0
for (const name of bundled) {
  const entry = `@c2n/components/${name.slice('@c2n/'.length)}`
  const message = `${name} is no longer published: install @c2n/components and import '${entry}' instead.`
  let current
  try {
    current = npm('view', name, 'deprecated', '--json')
  } catch {
    continue // never published
  }
  if (current && JSON.parse(current) === message) continue
  console.log(`${dryRun ? '[dry run] ' : ''}deprecate ${name} → ${entry}`)
  if (!dryRun) npm('deprecate', name, message)
  deprecated++
}
console.log(`[deprecate] ${deprecated} of ${bundled.length} bundled packages ${dryRun ? 'would be' : ''} deprecated`.replace('  ', ' '))
