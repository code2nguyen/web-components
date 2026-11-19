// The lab's markdown files (specs, reports) found one way for every reader: gaps.mjs, readiness.mjs and the readiness
// run's lab requirements (packages/tools/mcp/scripts/readiness/lab.ts). Any depth, sorted, README.md and TEMPLATE.md
// left out.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function labMarkdownFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? labMarkdownFiles(path) : name.endsWith('.md') && name !== 'TEMPLATE.md' && name !== 'README.md' ? [path] : []
    })
}
