/**
 * `c2n-mcp validate [paths…]`: the `validate_markup` check over files and directories, for CI and editor hooks.
 * `--hook` reads a Claude Code `PostToolUse` payload from stdin and checks the file the agent just wrote: findings go
 * to stderr with exit code 2, which Claude Code hands back to the agent so it fixes them in the same turn.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { withInstalledApi } from './installed.ts'
import { formatFindings, validateMarkup, type Finding } from './lib/validate.ts'
import { loadRegistry } from './registry.ts'

const EXTENSIONS = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro', '.mdx', '.ts', '.js', '.mjs', '.css', '.scss', '.sass', '.less'])
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.next', '.nuxt', '.svelte-kit', '.astro', '.angular'])

export const VALIDATE_USAGE = `Usage: c2n-mcp validate [paths…] [--strict] [--format json]
       c2n-mcp validate --hook

Checks markup and CSS against the c2n component API (default path: src). Exits 1 on errors, or on warnings too with
--strict. --hook reads a Claude Code PostToolUse payload from stdin and reports the written file's findings to the agent.`

function collect(path: string, files: string[]) {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) if (!SKIPPED_DIRECTORIES.has(name)) collect(join(path, name), files)
  } else if (EXTENSIONS.has(extname(path).toLowerCase())) files.push(path)
}

function check(file: string): Finding[] {
  return validateMarkup(withInstalledApi(loadRegistryOnce()), readFileSync(file, 'utf8'), file).findings
}

let registry: ReturnType<typeof loadRegistry> | undefined
function loadRegistryOnce() {
  registry ??= loadRegistry()
  return registry
}

async function readStdin(): Promise<string> {
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data
}

export async function runValidate(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(VALIDATE_USAGE)
    return 0
  }
  if (args.includes('--hook')) {
    let file: string | undefined
    try {
      const payload = JSON.parse(await readStdin()) as { tool_input?: { file_path?: string; notebook_path?: string } }
      file = payload.tool_input?.file_path
    } catch {
      return 0
    }
    if (!file || !existsSync(file) || !EXTENSIONS.has(extname(file).toLowerCase())) return 0
    const findings = check(file)
    if (findings.length === 0) return 0
    process.stderr.write(
      `c2n validate: ${relative(process.cwd(), file)} has ${findings.length} problem(s) with the c2n components. Fix them (get_component has the API; a deliberate native element gets a c2n-ignore comment):\n${formatFindings(relative(process.cwd(), file), findings)}\n`,
    )
    return 2
  }

  const strict = args.includes('--strict')
  const json = args.includes('--format=json') || args.join(' ').includes('--format json')
  const paths = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--format')
  const files: string[] = []
  for (const path of paths.length ? paths : ['src']) {
    if (!existsSync(path)) {
      console.error(`c2n validate: ${path} does not exist`)
      return 1
    }
    collect(path, files)
  }
  const results = files.map((file) => ({ file, findings: check(file) })).filter((r) => r.findings.length)
  const all = results.flatMap((r) => r.findings)
  const errors = all.filter((f) => f.severity === 'error').length
  if (json) console.log(JSON.stringify(results, null, 2))
  else {
    for (const r of results) console.log(formatFindings(r.file, r.findings))
    console.log(`${files.length} file(s) checked: ${errors} error(s), ${all.length - errors} warning(s).`)
  }
  return errors > 0 || (strict && all.length > 0) ? 1 : 0
}
