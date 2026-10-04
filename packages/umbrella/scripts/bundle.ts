/**
 * Builds the published `@c2n/components` from the entries `@c2n/framework-types` writes under `src/`.
 *
 * - `dist/<name>.js`: each entry, with the private workspace component packages it imports inlined. Rollup splits
 *   what two entries share into `dist/chunks/`, so a module (and its `customElements.define`) exists once however
 *   many entries reach it. Everything the package lists as a dependency stays an import.
 * - `dist/<name>.d.ts` and `dist/types/<package>/…`: the declarations of every inlined package, copied with each
 *   `@c2n/<package>` specifier rewritten to the relative path of the copy, so the types need nothing the package
 *   does not install.
 * - `custom-elements.json`: the manifests of the inlined packages merged into one, each module path prefixed with
 *   its package's name.
 *
 * Run after the component packages are built (`npm run build -w packages/umbrella` takes care of the order).
 * Plain node on Node 24 type stripping, so keep this to erasable TypeScript syntax only.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

interface PackageJson {
  name: string
  exports?: Record<string, { types?: string; default?: string } | string>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  customElements?: string
}

interface Manifest {
  schemaVersion?: string
  modules?: { path?: string; [key: string]: unknown }[]
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(packageDir, 'src')
const distDir = join(packageDir, 'dist')
const readJson = <T>(file: string) => JSON.parse(readFileSync(file, 'utf8')) as T

const umbrella = readJson<PackageJson>(join(packageDir, 'package.json'))
const external = Object.keys({ ...umbrella.dependencies, ...umbrella.peerDependencies })
// The workspace packages the entries re-export: the generator lists them as devDependencies.
const inlined = Object.keys(umbrella.devDependencies ?? {}).filter((name) => name.startsWith('@c2n/') && name !== '@c2n/config')

/** The directory of an installed workspace package (`node_modules/@c2n/<name>`, symlinks resolved by Node). */
function packageRoot(name: string): string {
  for (let dir = packageDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    if (dirname(dir) === dir) throw new Error(`${name} is not installed; run npm install`)
  }
}

const roots = new Map(inlined.map((name) => [name, packageRoot(name)]))
const packageJsons = new Map([...roots].map(([name, root]) => [name, readJson<PackageJson>(join(root, 'package.json'))]))

rmSync(distDir, { recursive: true, force: true })

// --- JavaScript ---------------------------------------------------------------------------------------------------

// `src/<name>.js` per package, `src/<name>/<module>.js` per module of a multi-module package.
const sourceFiles = (readdirSync(srcDir, { recursive: true }) as string[]).map((file) => file.split(sep).join('/'))
const entries = sourceFiles.filter((file) => file.endsWith('.js'))
await build({
  configFile: false,
  logLevel: 'warn',
  root: packageDir,
  build: {
    outDir: distDir,
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
    lib: { entry: Object.fromEntries(entries.map((file) => [file.slice(0, -'.js'.length), join(srcDir, file)])), formats: ['es'] },
    rollupOptions: {
      external: (id) => external.some((dependency) => id === dependency || id.startsWith(`${dependency}/`)),
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
})

// --- Declarations -------------------------------------------------------------------------------------------------

/** Where a package's file lands in `dist/types/`. */
const copied = (name: string, file: string) => join(distDir, 'types', name.slice('@c2n/'.length), relative(roots.get(name)!, file))

/** The declaration file a specifier of an inlined package points at, or undefined when it is not inlined. */
function declarationOf(specifier: string): string | undefined {
  const match = /^(@c2n\/[^/]+)(?:\/(.+))?$/.exec(specifier)
  if (!match || !roots.has(match[1])) return undefined
  const [, name, subpath] = match
  const entry = packageJsons.get(name)!.exports?.[subpath ? `./${subpath}` : '.']
  const types = typeof entry === 'string' ? undefined : entry?.types
  if (!types) throw new Error(`${specifier}: ${name} exports no declarations for it`)
  return copied(name, join(roots.get(name)!, types))
}

/** Rewrites every `@c2n/<inlined package>` specifier in `source` (outside comments) to a path relative to `file`. */
function rewrite(source: string, file: string): string {
  return source.replace(/^.*$/gm, (line) => (/^\s*(?:\/\/|\/?\*)/.test(line) ? rewriteComment(line) : rewriteLine(line, file)))
}

/** Usage examples in comments name the published entry: `@c2n/select/react` is `@c2n/components/react` here. */
function rewriteComment(line: string): string {
  return line.replace(/@c2n\/([a-z0-9-]+)(\/(?:react|vue)\b)?(?:\/[\w./-]*)?/g, (whole, name: string, framework?: string) => {
    if (!roots.has(`@c2n/${name}`)) return whole
    return framework ? `@c2n/components${framework}` : `@c2n/components/${name}`
  })
}

function rewriteLine(line: string, file: string): string {
  return line.replace(/(['"])(@c2n\/[^'"]+)\1/g, (whole, quote: string, specifier: string) => {
    const target = declarationOf(specifier)
    if (!target) return whole
    let path = relative(dirname(file), target)
      .split(sep)
      .join('/')
      .replace(/\.d\.ts$/, '.js')
    if (!path.startsWith('.')) path = `./${path}`
    return `${quote}${path}${quote}`
  })
}

function declarationFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? declarationFiles(path) : path.endsWith('.d.ts') ? [path] : []
  })
}

/**
 * `tsc` drops a `/// <reference types="…" />` from the declarations it emits, so a package whose types use a global
 * namespace (`google.maps` from `@types/google.maps`) relies on its own compilation having loaded it. Restore the
 * reference on every copied file of a package that lists such a dependency, for each global it actually names.
 */
function globalTypeReferences(name: string): { types: string; namespace: RegExp }[] {
  return Object.keys(packageJsons.get(name)!.dependencies ?? {})
    .filter((dependency) => dependency.startsWith('@types/'))
    .map((dependency) => dependency.slice('@types/'.length))
    .map((types) => ({ types, namespace: new RegExp(`\\b${types.replace(/\./g, '\\.')}\\b`) }))
}

for (const [name, root] of roots) {
  const files = [...declarationFiles(join(root, 'types')), ...['react.d.ts', 'vue.d.ts'].map((file) => join(root, file)).filter(existsSync)]
  const references = globalTypeReferences(name)
  for (const file of files) {
    const target = copied(name, file)
    const source = rewrite(readFileSync(file, 'utf8'), target)
    const directives = references.filter(({ types, namespace }) => namespace.test(source) && !source.includes(`types="${types}"`))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, directives.map(({ types }) => `/// <reference types="${types}" />\n`).join('') + source)
  }
}

for (const file of sourceFiles.filter((file) => file.endsWith('.d.ts'))) {
  const target = join(distDir, file)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, rewrite(readFileSync(join(srcDir, file), 'utf8'), target))
}

// --- Custom elements manifest --------------------------------------------------------------------------------------

const merged: Manifest = { schemaVersion: '1.0.0', modules: [] }
for (const [name, root] of roots) {
  const manifestFile = join(root, packageJsons.get(name)!.customElements ?? 'custom-elements.json')
  if (!existsSync(manifestFile)) continue
  const manifest = readJson<Manifest>(manifestFile)
  merged.schemaVersion = manifest.schemaVersion ?? merged.schemaVersion
  for (const module of manifest.modules ?? []) merged.modules!.push({ ...module, path: `${name.slice('@c2n/'.length)}/${module.path ?? ''}` })
}
writeFileSync(join(packageDir, 'custom-elements.json'), `${JSON.stringify(merged, null, 2)}\n`)

// A dependency the bundle still imports but the package does not list would install nowhere.
const imported = new Set<string>()
for (const file of readdirSync(distDir, { recursive: true }) as string[]) {
  if (!file.endsWith('.js')) continue
  const source = readFileSync(join(distDir, file), 'utf8')
  const statements = /^\s*(?:import|export)\b[^;'"]*?(?:from\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm
  for (const [, staticSpecifier, dynamicSpecifier] of source.matchAll(statements)) {
    const specifier = staticSpecifier ?? dynamicSpecifier
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue
    imported.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0])
  }
}
const unlisted = [...imported].filter((name) => !external.includes(name))
if (unlisted.length > 0) throw new Error(`dist/ imports packages @c2n/components does not depend on: ${unlisted.join(', ')}`)

console.log(`[@c2n/components] bundled ${entries.length} entries from ${roots.size} packages, ${merged.modules!.length} manifest modules`)
