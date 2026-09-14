/**
 * Rewrites `c2nVersion` in the generated `data/registry.json` to the version in `lerna.json`.
 *
 * `lerna version` writes the new version into `lerna.json` and every `package.json`, then runs the `version`
 * lifecycle script of each package. Rebuilding the whole registry there is too heavy, so the release workflow
 * builds it before versioning and this script stamps the new version in place before regenerating the committed
 * skill catalog and plugin manifests.
 *
 * Run with `npm run version -w packages/tools/mcp` (Node 24 type stripping: erasable TypeScript only).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../../..')

const version: string = JSON.parse(readFileSync(join(repoRoot, 'lerna.json'), 'utf8')).version
const registryFile = join(packageRoot, 'data/registry.json')
const registry = JSON.parse(readFileSync(registryFile, 'utf8')) as { c2nVersion: string }

if (registry.c2nVersion === version) {
  console.log(`[stamp-version] registry already at ${version}`)
} else {
  const previous = registry.c2nVersion
  registry.c2nVersion = version
  writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n')
  console.log(`[stamp-version] registry ${previous} -> ${version}`)
}
