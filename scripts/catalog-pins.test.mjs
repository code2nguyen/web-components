// Published packages cannot use `catalog:` (`lerna publish` rewrites `workspace:*`, not `catalog:`), so they write the
// toolchain versions out. This keeps those copies equal to the catalog in pnpm-workspace.yaml, so a catalog bump that
// misses one fails here instead of leaving two versions of TypeScript or Vite in the build.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { readWorkspace, workspacePackages } from '@c2n/config/workspace.js'

const catalog = readWorkspace().catalog ?? {}

test('the catalog is read', () => {
  assert.ok(catalog.typescript, 'pnpm-workspace.yaml has no catalog entry for typescript')
})

test('published packages pin the catalog versions of the toolchain', () => {
  const mismatches = []
  for (const { name, dir } of workspacePackages()) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [dependency, spec] of Object.entries(manifest[field] ?? {})) {
        if (!(dependency in catalog)) continue
        if (manifest.private === true || manifest.private === 'true') continue
        if (spec !== catalog[dependency]) mismatches.push(`${name} ${field}.${dependency}: ${spec} (catalog: ${catalog[dependency]})`)
      }
    }
  }
  assert.deepEqual(mismatches, [])
})
