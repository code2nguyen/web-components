import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const SOURCE_EXTENSIONS = new Set(['.astro', '.css', '.html', '.md', '.mdx', '.scss', '.ts', '.tsx', '.vue'])
const IGNORED_DIRECTORIES = new Set(['.astro', '.next', 'dist', 'node_modules', 'out', 'playwright-report', 'test-results'])
const VARIABLE = /--c2-[a-z0-9-]+(?:__[a-z0-9-]+)*--[a-z0-9-]+/g

export function documentedCssVariables(repoRoot) {
  const variables = new Set()
  for (const root of ['packages/components', 'packages/icons', 'open-packages']) {
    const directory = join(repoRoot, root)
    if (!existsSync(directory)) continue
    for (const entry of readdirSync(directory)) {
      const manifestPath = join(directory, entry, 'custom-elements.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      for (const module of manifest.modules ?? []) {
        for (const declaration of module.declarations ?? []) {
          for (const property of declaration.cssProperties ?? []) if (property.name) variables.add(property.name)
        }
      }
    }
  }

  const tokenPath = join(repoRoot, 'packages/tools/theme/src/tokens.ts')
  if (existsSync(tokenPath)) {
    const source = readFileSync(tokenPath, 'utf8')
    for (const match of source.matchAll(/token\('([^']+)'/g)) variables.add(`--c2-theme--${match[1]}`)
  }
  return variables
}

export function sourceFiles(paths) {
  const files = []
  const visit = (path) => {
    if (!existsSync(path)) return
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(path.split('/').pop())) return
      for (const entry of readdirSync(path)) visit(join(path, entry))
    } else if (SOURCE_EXTENSIONS.has(extname(path))) files.push(path)
  }
  for (const path of paths) visit(path)
  return files.sort()
}

export function unknownCssVariables(source, documented) {
  const problems = []
  for (const match of source.matchAll(VARIABLE)) {
    if (documented.has(match[0])) continue
    const before = source.slice(0, match.index)
    problems.push({ name: match[0], line: before.split('\n').length })
  }
  return problems
}

export function closestCssVariable(name, documented) {
  const owner = name.match(/^--c2-.+?(?=__|--)/)?.[0]
  const candidates = [...documented].filter((candidate) => candidate.match(/^--c2-.+?(?=__|--)/)?.[0] === owner)
  let closest
  let distance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const next = editDistance(name, candidate)
    if (next < distance) {
      closest = candidate
      distance = next
    }
  }
  return closest
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = row[0]
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const previous = row[rightIndex]
      row[rightIndex] = Math.min(row[rightIndex] + 1, row[rightIndex - 1] + 1, diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1))
      diagonal = previous
    }
  }
  return row[right.length]
}
