/**
 * The component the plop generator scaffolds (`scripts/generator/files/wc/src`) is the shape every new component
 * starts from, and `packages/components/CLAUDE.md` documents that shape as the convention. This gate keeps the two
 * honest: it renders the templates with plop's own helpers into a throwaway package beside the real ones, then
 *
 * - type-checks it with the shared library config (`noUnusedLocals`, `noImplicitOverride`, …), and its scaffolded
 *   Playwright suite (`files/wc-test`) with the test config;
 * - lints it with the repo's eslint config;
 * - compiles its SCSS through `@c2n/sass`;
 * - rejects the patterns the conventions forbid (`property`/`customElement` from `lit/decorators.js`, a placeholder
 *   default such as `'Example property'`, a string literal rendered in the template);
 * - fails when a code line of the "Skeleton" block in `packages/components/CLAUDE.md` is missing from the rendered
 *   component, so the documented shape and the generated one stay the same.
 *
 * Needs `@c2n/core`'s declarations (`npm run build -w packages/core`, which the root build runs first).
 * Run: `npm run check:component-template`.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodePlop from 'node-plop'
import { compile, NodePackageImporter } from 'sass'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const templateDir = join(root, 'scripts/generator/files/wc/src')
const testTemplateDir = join(root, 'scripts/generator/files/wc-test')
// The name the skeleton in packages/components/CLAUDE.md is written for; no real component has it.
const name = 'Note Panel'
const id = 'note-panel'
const guide = join(root, 'packages/components/CLAUDE.md')
// Beside the real component packages, so `@c2n/*`, `lit` and the shared tsconfig resolve exactly as they do there.
const outDir = join(root, 'packages/components', `.${id}`)

const problems = []
// An interrupted run would otherwise leave a stray package beside the real ones (it is also git-ignored).
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    rmSync(outDir, { recursive: true, force: true })
    process.exit(128 + (signal === 'SIGINT' ? 2 : 15))
  })
const plop = await nodePlop()
rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'src'), { recursive: true })

try {
  const walk = (dir) => readdirSync(dir).flatMap((entry) => (statSync(join(dir, entry)).isDirectory() ? walk(join(dir, entry)) : [join(dir, entry)]))
  for (const [from, to] of [
    [templateDir, 'src'],
    [testTemplateDir, 'test'],
  ])
    for (const file of walk(from)) {
      const target = join(outDir, to, plop.renderString(relative(from, file), { name }).replace(/\.hbs$/, ''))
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, file.endsWith('.hbs') ? plop.renderString(readFileSync(file, 'utf8'), { name }) : readFileSync(file, 'utf8'))
    }
  cpSync(join(root, 'scripts/generator/files/wc/tsconfig.lib.json'), join(outDir, 'tsconfig.json'))
  writeFileSync(join(outDir, 'tsconfig.test.json'), JSON.stringify({ extends: '../../../tests/tsconfig.json', include: ['test/**/*.ts'] }))

  const run = (label, command, args) => {
    try {
      execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })
    } catch (error) {
      problems.push(`${label} failed:\n${String(error.stdout ?? '') + String(error.stderr ?? '')}`.trim())
    }
  }
  run('type-check', join(root, 'node_modules/.bin/tsc'), ['-p', join(outDir, 'tsconfig.json'), '--noEmit'])
  run('test type-check', join(root, 'node_modules/.bin/tsc'), ['-p', join(outDir, 'tsconfig.test.json')])
  run('eslint', join(root, 'node_modules/.bin/eslint'), ['--no-warn-ignored', '--max-warnings=0', join(outDir, 'src'), join(outDir, 'test')])
  if (!readFileSync(join(outDir, 'test/scenarios.html'), 'utf8').startsWith('<!doctype html>'))
    problems.push('test/scenarios.html: does not start with <!doctype html> (quirks mode; an .hbs template formatted by prettier as Handlebars loses it)')

  try {
    compile(join(outDir, 'src', `${id}.scss`), { importers: [new NodePackageImporter(root)], loadPaths: [join(root, 'node_modules')] })
  } catch (error) {
    problems.push(`SCSS failed:\n${error.message}`)
  }

  const source = readFileSync(join(outDir, 'src', `${id}.ts`), 'utf8')
  const forbidden = [
    [/import\s*\{[^}]*\b(property|customElement)\b[^}]*\}\s*from\s*'lit\/decorators\.js'/, '`property`/`customElement` must come from @c2n/core'],
    [/Example property/, "a placeholder default ('Example property') ships as public API"],
    [/html`[^`]*>\s*[A-Za-z][^<$`]*</, 'a string literal is rendered in the template; put it in messages.ts'],
  ]
  for (const [pattern, why] of forbidden) if (pattern.test(source)) problems.push(`${id}.ts: ${why}`)

  const skeleton = /### Skeleton[\s\S]*?```ts\n([\s\S]*?)```/.exec(readFileSync(guide, 'utf8'))?.[1]
  if (!skeleton) problems.push('packages/components/CLAUDE.md: no ```ts block under "### Skeleton"')
  else {
    const rendered = new Set(source.split('\n').map((line) => line.trim()))
    const missing = skeleton
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//') && !rendered.has(line))
    if (missing.length) problems.push(`packages/components/CLAUDE.md "Skeleton" lines the generator does not write:\n  ${missing.join('\n  ')}`)
  }
} finally {
  rmSync(outDir, { recursive: true, force: true })
}

if (problems.length) {
  console.error(`\n[component-template] the scaffolded component breaks the conventions:\n\n${problems.join('\n\n')}`)
  process.exit(1)
}
console.log('[component-template] the scaffolded component type-checks, lints, compiles its SCSS and follows the conventions')
