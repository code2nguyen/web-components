import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const packageRoots = ['packages/components', 'open-packages']
const componentPackagePattern = /^(packages\/components|open-packages)\/([^/]+)(?:\/|$)/
const explicitTestPattern = /^(?:(packages\/components|open-packages)\/[^/]+|packages\/umbrella)\/test(?:\/|$)/
// `@c2n/components` loads every component at once, so a change to any of them (a tag defined twice, a module that
// throws while it is evaluated) can break its barrel without breaking the component's own suite.
const umbrellaTestDirectory = 'packages/umbrella/test'
const umbrellaImpactPattern = /^(?:packages\/components|open-packages|packages\/umbrella)\//

// Inputs every suite reads (the test harness, the Playwright and Vite setup, the Sass and TypeScript toolchain):
// a change to one of them runs everything.
const globalImpactPatterns = [
  /^tests\//,
  /^playwright\.config\.ts$/,
  /^eslint\.config\.js$/,
  /^tsconfig(?:\.[^/]+)?\.json$/,
  /^\.github\/workflows\/component-tests\.yml$/,
  /^scripts\/run-changed-component-tests\.mjs$/,
  /^packages\/tools\/(?:config|sass)\//,
]
// The root manifest and the lockfile only reach the suites through the installed dependencies; `rootManifestImpact`
// tells a dependency change from the bookkeeping a new component adds (a wireit entry, new lockfile entries).
const rootManifestPattern = /^(?:package(?:-lock)?|packages\/core\/package)\.json$/
const corePattern = /^packages\/core\//
const coreSourcePattern = /^packages\/core\/src\/(.+)\.ts$/
const iconPackagePattern = /^packages\/icons\/([^/]+)(?:\/|$)/
const scannedExtensions = /\.(?:ts|tsx|js|mjs|html|scss|css)$/
const skippedDirectories = new Set(['node_modules', 'dist', 'types', '.wireit'])
const specifierPattern = /@c2n\/([a-z0-9-]+)((?:\/[\w.-]+)*)/g
const relativeImportPattern = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g

function normalizePath(path) {
  const normalized = path.replaceAll('\\', '/')
  return normalized.startsWith('/') ? relative(repositoryRoot, normalized).replaceAll('\\', '/') : normalized.replace(/^\.\//, '')
}

export function findComponentTestDirectories(root = repositoryRoot) {
  return packageRoots
    .flatMap((packageRoot) => {
      const absoluteRoot = resolve(root, packageRoot)
      if (!existsSync(absoluteRoot)) return []
      return readdirSync(absoluteRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(resolve(absoluteRoot, entry.name, 'test')))
        .map((entry) => `${packageRoot}/${entry.name}/test`)
    })
    .concat(existsSync(resolve(root, umbrellaTestDirectory)) ? [umbrellaTestDirectory] : [])
    .sort()
}

function walk(directory, visit) {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) walk(join(directory, entry.name), visit)
    } else if (scannedExtensions.test(entry.name)) {
      visit(join(directory, entry.name))
    }
  }
}

function packageName(directory) {
  try {
    return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name
  } catch {
    return undefined
  }
}

/**
 * What each component package imports, for selecting the suites a change reaches:
 * - `packages`: every component package with its npm name and the `@c2n/*` specifiers its sources, tests and harness use;
 * - `iconPackages`: icon directory → npm name;
 * - `coreImports`: each `packages/core/src` file → the core files it imports.
 */
export function buildImportGraph(root = repositoryRoot) {
  const packages = []
  for (const packageRoot of packageRoots) {
    const absoluteRoot = resolve(root, packageRoot)
    if (!existsSync(absoluteRoot)) continue
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const directory = join(absoluteRoot, entry.name)
      const specifiers = new Set()
      walk(directory, (file) => {
        for (const match of readFileSync(file, 'utf8').matchAll(specifierPattern)) specifiers.add(`@c2n/${match[1]}${match[2]}`)
      })
      packages.push({ directory: `${packageRoot}/${entry.name}`, name: packageName(directory), specifiers: [...specifiers] })
    }
  }
  const iconPackages = {}
  const iconsRoot = resolve(root, 'packages/icons')
  if (existsSync(iconsRoot)) {
    for (const entry of readdirSync(iconsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) iconPackages[entry.name] = packageName(join(iconsRoot, entry.name))
    }
  }
  const coreImports = {}
  const coreRoot = resolve(root, 'packages/core/src')
  walk(coreRoot, (file) => {
    const from = relative(coreRoot, file).replaceAll('\\', '/')
    const imports = []
    for (const match of readFileSync(file, 'utf8').matchAll(relativeImportPattern)) {
      imports.push(
        join(dirname(from), match[1])
          .replaceAll('\\', '/')
          .replace(/\.(?:js|ts)$/, ''),
      )
    }
    coreImports[from.replace(/\.ts$/, '')] = imports
  })
  return { packages, iconPackages, coreImports }
}

/** The core modules (`dom-helper`, `contexts/field`) a change to `module` reaches through core's own imports. */
function coreDependents(module, coreImports) {
  const reached = new Set([module])
  let grew = true
  while (grew) {
    grew = false
    for (const [file, imports] of Object.entries(coreImports)) {
      if (!reached.has(file) && imports.some((imported) => reached.has(imported))) {
        reached.add(file)
        grew = true
      }
    }
  }
  return reached
}

/**
 * Whether a change to the root `package.json`, `package-lock.json` or core's `package.json` can reach the suites.
 * The root manifest counts unless only its `wireit` build list changed; the lockfile counts when an installed package
 * (not a workspace or its link) changed or went away, since packages only added for a new component leave the others
 * alone; core's manifest counts unless it only gained exports.
 */
export function rootManifestImpact(file, before, after) {
  if (before === undefined || after === undefined) return true
  let old, current
  try {
    old = JSON.parse(before)
    current = JSON.parse(after)
  } catch {
    return true
  }
  if (file === 'package.json') {
    delete old.wireit
    delete current.wireit
    return JSON.stringify(old) !== JSON.stringify(current)
  }
  if (file === 'packages/core/package.json') {
    // A new module adds an export; the suites only see changed or removed ones.
    const exports = current.exports ?? {}
    const changed = Object.entries(old.exports ?? {}).some(([key, value]) => JSON.stringify(exports[key]) !== JSON.stringify(value))
    delete old.exports
    delete current.exports
    return changed || JSON.stringify(old) !== JSON.stringify(current)
  }
  const installed = (lock) => Object.entries(lock.packages ?? {}).filter(([path, entry]) => path === '' || (path.includes('node_modules/') && !entry.link))
  const next = new Map(installed(current))
  if (JSON.stringify(old.lockfileVersion) !== JSON.stringify(current.lockfileVersion)) return true
  return installed(old).some(([path, entry]) => !next.has(path) || JSON.stringify(next.get(path)) !== JSON.stringify(entry))
}

export function hasGlobalTestImpact(changedFiles, options = {}) {
  return changedFiles.some((file) => {
    const path = normalizePath(file)
    if (globalImpactPatterns.some((pattern) => pattern.test(path))) return true
    if (rootManifestPattern.test(path)) return options.manifestImpact?.[path] ?? true
    // Without an import graph, core and the icon sets are assumed to reach every suite.
    if (!options.graph && (corePattern.test(path) || iconPackagePattern.test(path))) return true
    // Core's own metadata and build config, rather than one of its modules.
    return options.graph !== undefined && corePattern.test(path) && !coreSourcePattern.test(path)
  })
}

/**
 * The suites a change reaches. A component change runs that component's suite and the `@c2n/components` suite (not
 * the components built on it, which would turn a Button change into some forty suites). With `options.graph`, a core
 * module or an icon set runs the components that import it (a core module also counts for every core module that
 * imports it); without a graph, either runs everything.
 */
export function selectComponentTestDirectories(changedFiles, availableDirectories = findComponentTestDirectories(), options = {}) {
  if (hasGlobalTestImpact(changedFiles, options)) return [...availableDirectories]

  const available = new Set(availableDirectories)
  const graph = options.graph
  const changedPackages = new Set()
  const coreModules = new Set()
  const selected = new Set()
  for (const changedFile of changedFiles) {
    const path = normalizePath(changedFile)
    if (umbrellaImpactPattern.test(path) && available.has(umbrellaTestDirectory)) selected.add(umbrellaTestDirectory)
    const component = path.match(componentPackagePattern)
    if (component) {
      changedPackages.add(`${component[1]}/${component[2]}`)
      continue
    }
    const icon = path.match(iconPackagePattern)
    if (icon && graph?.iconPackages[icon[1]]) {
      changedPackages.add({ name: graph.iconPackages[icon[1]] })
      continue
    }
    const core = path.match(coreSourcePattern)
    if (core && graph && !/\.test$/.test(core[1])) for (const module of coreDependents(core[1], graph.coreImports)) coreModules.add(module)
  }

  const reached = new Set()
  const reach = (directory) => reached.add(directory)
  const importers = (name) =>
    (graph?.packages ?? []).filter((entry) => entry.specifiers.some((specifier) => specifier === name || specifier.startsWith(`${name}/`)))
  for (const changed of changedPackages) {
    if (typeof changed === 'string') reach(changed)
    else for (const entry of importers(changed.name)) reach(entry.directory)
  }
  for (const entry of graph?.packages ?? []) {
    if (
      entry.specifiers.some((specifier) => specifier.startsWith('@c2n/core/') && coreModules.has(specifier.slice('@c2n/core/'.length).replace(/\.js$/, '')))
    ) {
      reach(entry.directory)
    }
  }
  for (const directory of reached) {
    if (available.has(`${directory}/test`)) selected.add(`${directory}/test`)
  }
  if (reached.size && available.has(umbrellaTestDirectory)) selected.add(umbrellaTestDirectory)
  return [...selected].sort()
}

function gitFiles(args) {
  const output = execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
  return output.split('\0').filter(Boolean)
}

function gitText(args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function localDefaultBase() {
  try {
    const branch = gitText(['symbolic-ref', '--short', 'HEAD'])
    const defaultBranch = gitText(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    return defaultBranch === `origin/${branch}` ? '' : defaultBranch
  } catch {
    return ''
  }
}

function changedFiles(base) {
  const files = new Set()
  if (base) {
    for (const file of gitFiles(['diff', '--name-only', '-z', '--diff-filter=ACMRD', `${base}...HEAD`])) files.add(file)
  }
  for (const file of gitFiles(['diff', '--name-only', '-z', '--diff-filter=ACMRD', 'HEAD'])) files.add(file)
  for (const file of gitFiles(['ls-files', '--others', '--exclude-standard', '-z'])) files.add(file)
  return [...files]
}

/** The file at `ref`, or undefined where it does not exist. */
function gitShow(ref, file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 << 20 })
  } catch {
    return undefined
  }
}

/** For each changed root manifest, whether the change can reach the suites (compared with the merge base). */
function manifestImpacts(base, files) {
  const impacts = {}
  const changed = files.map(normalizePath).filter((file) => rootManifestPattern.test(file))
  if (!changed.length) return impacts
  let mergeBase
  try {
    mergeBase = base ? gitText(['merge-base', base, 'HEAD']) : 'HEAD'
  } catch {
    return impacts
  }
  for (const file of changed) {
    const current = existsSync(resolve(repositoryRoot, file)) ? readFileSync(resolve(repositoryRoot, file), 'utf8') : undefined
    impacts[file] = rootManifestImpact(file, gitShow(mergeBase, file), current)
  }
  return impacts
}

/** Suites per CI shard: a full run (about 100 suites) spreads over four jobs per browser, a component PR stays in one. */
const SUITES_PER_SHARD = 15
const MAX_SHARDS = 4

export function shardCount(suites) {
  return Math.max(1, Math.min(MAX_SHARDS, Math.ceil(suites / SUITES_PER_SHARD)))
}

function parseArguments(args) {
  let base = process.env.COMPONENT_TEST_BASE || ''
  let baseWasProvided = Boolean(base)
  let plan = false
  let all = false
  const playwrightArguments = []
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--base') {
      base = args[++index] || ''
      baseWasProvided = true
    } else if (argument.startsWith('--base=')) {
      base = argument.slice('--base='.length)
      baseWasProvided = true
    } else if (argument === '--plan') {
      plan = true
    } else if (argument === '--all') {
      all = true
    } else {
      playwrightArguments.push(argument)
    }
  }
  if (!baseWasProvided) base = localDefaultBase()
  return { base, plan, all, playwrightArguments }
}

function runPlaywright(testDirectories, playwrightArguments) {
  const cli = resolve(repositoryRoot, 'node_modules/@playwright/test/cli.js')
  const result = spawnSync(process.execPath, [cli, 'test', ...testDirectories, ...playwrightArguments], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

function main() {
  const { base, plan, all, playwrightArguments } = parseArguments(process.argv.slice(2))
  const explicitTarget = playwrightArguments.some((argument) => explicitTestPattern.test(normalizePath(argument)))
  if (explicitTarget && !plan) return runPlaywright([], playwrightArguments)

  const files = all || /^0+$/.test(base) ? ['playwright.config.ts'] : changedFiles(base)
  const allDirectories = findComponentTestDirectories()
  const options = { graph: buildImportGraph(), manifestImpact: manifestImpacts(base, files) }
  const directories = selectComponentTestDirectories(files, allDirectories, options)
  const everything = hasGlobalTestImpact(files, options)

  if (plan) {
    // `--plan` prints what CI should run: the suites and how many shards to split them over.
    console.log(JSON.stringify({ everything, directories, shards: Array.from({ length: shardCount(directories.length) }, (_, index) => index + 1) }))
    return 0
  }

  if (directories.length === 0) {
    console.log('No changed component package has a Playwright suite; skipping component tests.')
    return 0
  }

  if (everything) {
    console.log(`Shared test input changed; running all ${directories.length} component suites.`)
  } else {
    console.log(`Running the suites the change reaches:\n${directories.map((directory) => `  - ${directory}`).join('\n')}`)
  }
  return runPlaywright(directories, playwrightArguments)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
