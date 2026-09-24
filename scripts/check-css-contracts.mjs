import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { closestCssVariable, documentedCssVariables, sourceFiles, unknownCssVariables } from './lib/css-contracts.mjs'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const requested = process.argv.slice(2)
const roots = (requested.length > 0 ? requested : ['apps/examples/observability-nextjs']).map((path) => resolve(repoRoot, path))
const documented = documentedCssVariables(repoRoot)
const problems = []

for (const file of sourceFiles(roots)) {
  for (const problem of unknownCssVariables(readFileSync(file, 'utf8'), documented)) {
    const closest = closestCssVariable(problem.name, documented)
    problems.push(`${relative(repoRoot, file)}:${problem.line}: unknown c2n CSS variable ${problem.name}${closest ? `; did you mean ${closest}?` : ''}`)
  }
}

if (problems.length > 0) {
  console.error(`[css-contracts] validation failed:\n  ${problems.join('\n  ')}`)
  process.exitCode = 1
} else {
  console.log(`[css-contracts] ${documented.size} documented variables; ${sourceFiles(roots).length} consumer files valid`)
}
