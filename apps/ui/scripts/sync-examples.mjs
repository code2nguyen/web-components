/**
 * Copies each built example app (`apps/examples/<id>/dist`) into `apps/ui/public/demo/<id>`.
 *
 * Why a copy step rather than pointing Vite's `outDir` straight at `public/`: wireit refuses to track output
 * files outside the package that produced them, so each example builds into its own `dist/` (tracked, cached)
 * and the docs site pulls the results in from there. `public/` is the destination because Astro serves it in
 * dev and copies it verbatim into `dist/` on build — one URL shape for both, and no change to the Pages
 * artifact path in `.github/workflows/deploy.yml`. The `demo/` prefix keeps the running apps clear of the
 * `/examples/<id>` docs routes, which would otherwise be shadowed by a public file of the same name.
 *
 * Runs from `pre{build,dev,start}` in this package, after the root `examples:build`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const uiDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const examplesDir = join(uiDir, '..', 'examples')
const targetRoot = join(uiDir, 'public', 'demo')

if (!existsSync(examplesDir)) {
  console.log('[sync-examples] no apps/examples directory — nothing to do')
  process.exit(0)
}

const ids = readdirSync(examplesDir).filter((id) => statSync(join(examplesDir, id)).isDirectory())

// Drop demos that no longer exist, so a removed example does not linger in the deployed site.
if (existsSync(targetRoot)) {
  for (const stale of readdirSync(targetRoot).filter((id) => !ids.includes(id))) {
    rmSync(join(targetRoot, stale), { recursive: true, force: true })
    console.log(`[sync-examples] removed ${stale}`)
  }
}

mkdirSync(targetRoot, { recursive: true })

let copied = 0
for (const id of ids) {
  const configPath = join(examplesDir, id, 'app.config.json')
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {}
  const outputDir = typeof config.outputDir === 'string' && /^[a-zA-Z0-9_-]+$/.test(config.outputDir) ? config.outputDir : 'dist'
  const from = join(examplesDir, id, outputDir)
  if (!existsSync(from)) {
    console.warn(`[sync-examples] ${id} has no ${outputDir}/ — run \`npm run examples:build\` at the root first`)
    continue
  }
  const to = join(targetRoot, id)
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
  copied++
}

console.log(`[sync-examples] copied ${copied} example${copied === 1 ? '' : 's'} into public/demo/`)
