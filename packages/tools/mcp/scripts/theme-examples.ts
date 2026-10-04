/**
 * Applies `themeExampleCss` to the `<style>` block of every live example in the docs (`MdxCodeBlock` and `UsageBlock`
 * fences under `apps/ui/src/content/{components,gallery}`), so a card's greys, tints and deep accent text follow the
 * `--c2-theme--*` tokens and read in both the light and the dark theme. The registry applies the same transform to
 * what it serves; this writes it back into the MDX the site renders.
 *
 *   node scripts/theme-examples.ts           rewrite the MDX files in place
 *   node scripts/theme-examples.ts --check   fail, listing the files, when an example still has literals to theme
 *
 * Greys are themed only inside a block that also paints a tint: elsewhere they were tuned by hand against the
 * audit, and a grey drawn on a colour the component computes (an avatar's auto colour) must not flip.
 *
 * Idempotent: a value that already reads a variable or a `color-mix()` is left alone. Needs the built theme
 * (`packages/tools/theme/dist/tokens.json`). Plain node on Node 24 type stripping: erasable TypeScript only.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { themeExampleCss, type ThemeColor } from './gallery.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const tokensFile = join(repoRoot, 'packages/tools/theme/dist/tokens.json')
if (!existsSync(tokensFile)) throw new Error('packages/tools/theme/dist/tokens.json is missing: run `npm run build -w packages/tools/theme` first')
const { tokens } = JSON.parse(readFileSync(tokensFile, 'utf8')) as { tokens: ThemeColor[] }
const check = process.argv.includes('--check')

const FENCE = /(^```html tag=(?:MdxCodeBlock|UsageBlock)[^\n]*\n)([\s\S]*?)(\n```$)/gm
const STYLE = /(<style>)([\s\S]*?)(<\/style>)/g

const stale: string[] = []
let rewritten = 0
for (const dir of ['components', 'gallery'].map((name) => join(repoRoot, 'apps/ui/src/content', name))) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.mdx'))) {
    const path = join(dir, file)
    const source = readFileSync(path, 'utf8')
    let count = 0
    const next = source.replace(FENCE, (_fence, open: string, body: string, close: string) => {
      const themedBody = body.replace(STYLE, (_style, start: string, css: string, end: string) => {
        const themed = themeExampleCss(css, tokens, { neutrals: 'tinted-blocks' })
        count += themed.themed
        return `${start}${themed.css}${end}`
      })
      return `${open}${themedBody}${close}`
    })
    if (next === source) continue
    rewritten += count
    if (check) stale.push(`${relative(repoRoot, path)} (${count})`)
    else writeFileSync(path, next)
  }
}

if (check && stale.length > 0) {
  console.error(`Examples with colours that do not follow the theme:\n  ${stale.join('\n  ')}`)
  console.error('\nRun `npm run theme:examples -w packages/tools/mcp` and commit the result.')
  process.exit(1)
}
console.log(`[theme-examples] ${check ? 'all examples follow the theme' : `themed ${rewritten} colours`}`)
