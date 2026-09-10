/**
 * Theme generator for `@c2n/theme`.
 *
 * Reads the `custom-elements.json` of every `@c2n/*` component package, classifies each documented CSS
 * variable against the `--c2-theme--*` design tokens (`src/tokens.ts`) and writes into `dist/`:
 *
 * - `tokens.css`  the token defaults (light + dark)
 * - `base.css`    `--c2-<component>…: var(--c2-theme--…, <original default>)` for every mapped variable
 * - `theme.css`   tokens.css + base.css
 * - `tokens.json` tokens + the variable → token mapping (consumed by the docs site and the MCP server)
 * - `report.json` coverage per package and the list of unmapped variables
 *
 * Components are never modified: the base theme only sets `:root`/`:host` values, so any component variable
 * set by the consumer still wins.
 *
 * Run with `npm run generate -w packages/tools/theme` (Node >= 22.18 / 24: native type stripping, so keep the
 * generator to erasable TypeScript syntax only). Component packages must be built first.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokens } from '../../src/tokens.ts'
import { classify } from './classify.ts'
import { buildReport, buildTokensJson, formatCss, renderBaseCss, renderTokensCss, type ClassifiedVar } from './emit.ts'
import { discoverPackages, readCssVars } from './manifests.ts'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const distDir = join(packageRoot, 'dist')

async function main(): Promise<void> {
  const packages = discoverPackages()
  if (packages.length === 0) throw new Error('[theme-generator] no @c2n packages with a custom-elements.json found; run the root build first')

  const { vars, unparsed } = readCssVars(packages)
  const byPrefix = new Map<string, typeof vars>()
  for (const v of vars) byPrefix.set(v.prefix, [...(byPrefix.get(v.prefix) ?? []), v])

  const classified: ClassifiedVar[] = vars.map((cssVar) => ({ cssVar, result: classify(cssVar, byPrefix.get(cssVar.prefix) ?? []) }))

  mkdirSync(distDir, { recursive: true })
  const tokensCss = await formatCss(join(distDir, 'tokens.css'), renderTokensCss(tokens))
  const baseCss = await formatCss(join(distDir, 'base.css'), renderBaseCss(classified))
  writeFileSync(join(distDir, 'tokens.css'), tokensCss)
  writeFileSync(join(distDir, 'base.css'), baseCss)
  writeFileSync(join(distDir, 'theme.css'), `${tokensCss}\n${baseCss}`)
  writeFileSync(join(distDir, 'tokens.json'), JSON.stringify(buildTokensJson(tokens, classified), null, 2) + '\n')

  const report = buildReport(classified, unparsed)
  writeFileSync(join(distDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')

  const rows = Object.entries(report.packages).map(([pkg, r]) => ({
    package: pkg,
    total: r.total,
    mapped: r.mapped,
    unmapped: r.unmapped,
    excluded: r.excluded,
    noDefault: r.noDefault,
  }))
  console.table(rows)
  const { total, mapped, unmapped, excluded, noDefault } = report.totals
  console.log(
    `[theme-generator] ${packages.length} packages, ${total} variables: ${mapped} mapped, ${unmapped} unmapped, ${excluded} excluded, ${noDefault} without default`,
  )
  if (unparsed.length) console.warn(`[theme-generator] ${unparsed.length} variable names did not match the grammar:\n  ${unparsed.join('\n  ')}`)
  console.log(`[theme-generator] wrote tokens.css, base.css, theme.css, tokens.json, report.json to ${distDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
