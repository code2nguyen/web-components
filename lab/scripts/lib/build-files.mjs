// The files of a lab build an agent wrote (lab/apps/<spec>/<direction>/), shared by lab/scripts/readiness.mjs (the
// report's AI readiness section) and packages/tools/mcp/scripts/readiness/lab.ts (the lab requirements), so both read
// a build the same way.
import { existsSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'

const SOURCE = /\.(html?|[cm]?[jt]s|jsx|tsx|vue|svelte|astro|css|scss|sass|less)$/
/** Tooling the builder did not write as the app: config files and tests. */
const TOOLING = /(\.config\.[cm]?[jt]s|\.(test|spec)\.[cm]?[jt]sx?|\.d\.ts|\.min\.js)$/
/** Build output and tests at the app's root, and dependencies anywhere: not what the builder wrote as the app. */
const OUTPUT = /^(dist|build|out|coverage|tests?|\.astro|\.svelte-kit|\.next)([\\/]|$)|(^|[\\/])node_modules([\\/]|$)/

/**
 * Whether a path relative to lab/apps/ leaves it (`..` as a whole segment) or is lab/apps/ itself: both lab readers
 * refuse such a build with this one rule.
 */
export const outsideApps = (rel) => !rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('../') || isAbsolute(rel)

/** The build's own source files, sorted; node_modules and build output are skipped, not read and thrown away. */
export function sourceFiles(dir) {
  if (!existsSync(dir)) return []
  const files = []
  const walk = (folder) => {
    for (const e of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, e.name)
      if (e.isDirectory()) {
        if (!OUTPUT.test(relative(dir, path))) walk(path)
      } else if (e.isFile() && SOURCE.test(e.name) && !TOOLING.test(e.name)) files.push(path)
    }
  }
  walk(dir)
  return files.sort()
}
