import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const packageRoots = ['packages/components', 'open-packages']
const componentPackagePattern = /^(packages\/components|open-packages)\/([^/]+)(?:\/|$)/
const explicitTestPattern = /^(packages\/components|open-packages)\/[^/]+\/test(?:\/|$)/

const globalImpactPatterns = [
  /^tests\//,
  /^playwright\.config\.ts$/,
  /^package(?:-lock)?\.json$/,
  /^eslint\.config\.js$/,
  /^tsconfig(?:\.[^/]+)?\.json$/,
  /^\.github\/workflows\/component-tests\.yml$/,
  /^packages\/core\//,
  /^packages\/icons\//,
  /^packages\/tools\/(?:config|sass)\//,
]

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
    .sort()
}

export function hasGlobalTestImpact(changedFiles) {
  return changedFiles.some((file) => globalImpactPatterns.some((pattern) => pattern.test(normalizePath(file))))
}

export function selectComponentTestDirectories(changedFiles, availableDirectories = findComponentTestDirectories()) {
  if (hasGlobalTestImpact(changedFiles)) return [...availableDirectories]

  const available = new Set(availableDirectories)
  const selected = new Set()
  for (const changedFile of changedFiles) {
    const match = normalizePath(changedFile).match(componentPackagePattern)
    if (!match) continue
    const directory = `${match[1]}/${match[2]}/test`
    if (available.has(directory)) selected.add(directory)
  }
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

function parseArguments(args) {
  let base = process.env.COMPONENT_TEST_BASE || ''
  let baseWasProvided = Boolean(base)
  const playwrightArguments = []
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--base') {
      base = args[++index] || ''
      baseWasProvided = true
    } else if (argument.startsWith('--base=')) {
      base = argument.slice('--base='.length)
      baseWasProvided = true
    } else {
      playwrightArguments.push(argument)
    }
  }
  if (!baseWasProvided) base = localDefaultBase()
  return { base, playwrightArguments }
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
  const { base, playwrightArguments } = parseArguments(process.argv.slice(2))
  const explicitTarget = playwrightArguments.some((argument) => explicitTestPattern.test(normalizePath(argument)))
  if (explicitTarget) return runPlaywright([], playwrightArguments)

  const files = /^0+$/.test(base) ? ['playwright.config.ts'] : changedFiles(base)
  const allDirectories = findComponentTestDirectories()
  const directories = selectComponentTestDirectories(files, allDirectories)

  if (directories.length === 0) {
    console.log('No changed component package has a Playwright suite; skipping component tests.')
    return 0
  }

  if (hasGlobalTestImpact(files)) {
    console.log(`Shared test input changed; running all ${directories.length} component suites.`)
  } else {
    console.log(`Running changed component suites:\n${directories.map((directory) => `  - ${directory}`).join('\n')}`)
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
