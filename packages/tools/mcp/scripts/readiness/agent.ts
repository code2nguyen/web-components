/**
 * Agent run of the AI readiness benchmark: `pnpm --dir packages/tools/mcp run readiness:agent [options]`.
 *
 * For each requirement of `tasks.json`, starts Claude Code headless (`claude -p`) in an empty directory with the c2n
 * MCP server as its only MCP server and no project instructions, asks it to build the requirement, and grades what it
 * wrote: did it pick an expected component, does `validate_markup` find no error, and does it use the attributes and
 * slots the task needs. Results go to `packages/tools/mcp/readiness/agent.json` (committed), which `pnpm run readiness` folds into the
 * report.
 *
 * Opt-in and not part of CI: it calls a model (costs money and takes minutes) and its result varies between runs.
 *
 *   --tasks a,b,c     only these task ids (default: the `agentSet` of tasks.json)
 *   --all             every task
 *   --limit <n>       only the first n tasks
 *   --model <id>      model passed to `claude --model`
 *   --concurrency <n> parallel sessions (default 3)
 *   --claude <path>   the Claude Code binary (default `claude`)
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRegistry } from '../../src/registry.ts'
import { validateMarkup } from '../../src/lib/validate.ts'
import type { Registry } from '../../src/registry-types.ts'
import type { AgentReport, AgentTaskResult } from './agent-types.ts'
import type { Task } from './score.ts'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '../..')
/** Committed beside the readiness baseline, so a run is kept in the repository. */
const outDir = join(packageRoot, 'readiness')

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export function prompt(task: Task): string {
  return [
    'You are building a web page with the c2n web components (the `c2-*` custom elements of the npm package `@c2n/components`).',
    `Requirement: ${task.requirement}`,
    'Write the result to index.html in the current directory: the markup, a <script type="module"> with the imports it needs, and any <style>.',
    'Do not ask questions; make reasonable choices and finish by writing the file.',
  ].join('\n')
}

/** Grades the code an agent wrote for a task. */
export function grade(registry: Registry, task: Task, code: string, file = 'index.html'): Omit<AgentTaskResult, 'id' | 'requirement' | 'tools' | 'costUsd'> {
  const notes: string[] = []
  const tags = [...new Set([...code.matchAll(/<(c2-[a-z0-9-]+)/g)].map((m) => m[1]))]
  const found = (task.tags ?? []).some((t) => tags.includes(t))
  if (!found) notes.push(`used ${tags.slice(0, 5).join(', ') || 'no c2 tag'}, expected ${(task.tags ?? []).join(' or ')}`)
  const errors = validateMarkup(registry, code, file).findings.filter((f) => f.severity === 'error')
  const valid = code.trim() !== '' && errors.length === 0
  for (const e of errors.slice(0, 3)) notes.push(`line ${e.line}: ${e.message.split('. ')[0]}`)
  const missing = (task.attributes ?? []).filter((a) =>
    a.startsWith('slot:') ? !new RegExp(`slot=["']${a.slice(5)}["']`).test(code) : !new RegExp(`<c2-[^>]*\\s${a}(?=[\\s=>/])`).test(code),
  )
  if (missing.length) notes.push(`missing ${missing.join(', ')}`)
  return { found, valid, correct: found && valid && missing.length === 0, tags, notes }
}

interface Session {
  code: string
  file: string
  tools: string[]
  costUsd?: number
  error?: string
}

function runClaude(task: Task, claude: string, model: string | undefined): Promise<Session> {
  const dir = mkdtempSync(join(tmpdir(), `c2n-readiness-${task.id}-`))
  const config = join(dir, '.mcp-config.json')
  writeFileSync(config, JSON.stringify({ mcpServers: { c2n: { type: 'stdio', command: process.execPath, args: [join(packageRoot, 'src/cli.ts')] } } }))
  const args = [
    '-p',
    prompt(task),
    '--mcp-config',
    config,
    '--strict-mcp-config',
    '--allowedTools',
    'mcp__c2n__*,Write,Edit,Read',
    '--output-format',
    'stream-json',
    '--verbose',
  ]
  if (model) args.push('--model', model)
  return new Promise((done) => {
    const child = spawn(claude, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    const tools: string[] = []
    let costUsd: number | undefined
    let buffer = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), 6 * 60_000)
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        try {
          const event = JSON.parse(line) as { type: string; message?: { content?: { type: string; name?: string }[] }; total_cost_usd?: number }
          if (event.type === 'assistant') for (const part of event.message?.content ?? []) if (part.type === 'tool_use' && part.name) tools.push(part.name)
          if (event.type === 'result') costUsd = event.total_cost_usd
        } catch {
          // A partial or non-JSON line: ignore.
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('close', (status) => {
      clearTimeout(timer)
      const written = readdirSync(dir).filter((f) => /\.(html?|tsx|jsx|vue|svelte|astro)$/.test(f))
      const file = written.includes('index.html') ? 'index.html' : written[0]
      const code = file ? readFileSync(join(dir, file), 'utf8') : ''
      rmSync(dir, { recursive: true, force: true })
      done({ code, file: file ?? 'index.html', tools, costUsd, error: status === 0 ? undefined : stderr.trim().split('\n').at(-1) || `exit ${status}` })
    })
  })
}

async function main() {
  const registry = loadRegistry()
  const file = JSON.parse(readFileSync(join(here, 'tasks.json'), 'utf8')) as { tasks: Task[]; agentSet?: string[] }
  let tasks = file.tasks
  // The fixed subset by default, so two runs measure the same thing; `--all` for every task.
  const only = option('tasks')?.split(',') ?? (process.argv.includes('--all') ? undefined : file.agentSet)
  if (only) tasks = tasks.filter((t) => only.includes(t.id))
  const limit = Number(option('limit') ?? 0)
  if (limit) tasks = tasks.slice(0, limit)
  const model = option('model')
  const claude = option('claude') ?? 'claude'
  const concurrency = Number(option('concurrency') ?? 3)

  const results: AgentTaskResult[] = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++
      const task = tasks[index]
      const session = await runClaude(task, claude, model)
      const graded = grade(registry, task, session.code, session.file)
      if (session.error) graded.notes.unshift(`session: ${session.error}`)
      if (!session.code) graded.notes.unshift('wrote no file')
      if (!session.tools.some((t) => t.startsWith('mcp__c2n__'))) graded.notes.push('no c2n tool called')
      results[index] = {
        id: task.id,
        requirement: task.requirement,
        ...graded,
        tools: session.tools.filter((t) => t.startsWith('mcp__c2n__')).map((t) => t.slice(10)),
        costUsd: session.costUsd,
      }
      const mark = (ok: boolean) => (ok ? '✓' : '✗')
      console.log(`${mark(graded.correct)} ${task.id.padEnd(20)} found ${mark(graded.found)} valid ${mark(graded.valid)}  ${graded.notes.join('; ')}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))

  const score = Math.round((results.reduce((s, r) => s + (r.found ? 40 : 0) + (r.valid ? 30 : 0) + (r.correct ? 30 : 0), 0) / (results.length || 1)) * 10) / 10
  const report: AgentReport = { date: new Date().toISOString().slice(0, 10), model, score, passed: results.filter((r) => r.correct).length, tasks: results }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'agent.json'), JSON.stringify(report, null, 2) + '\n')
  const cost = results.reduce((s, r) => s + (r.costUsd ?? 0), 0)
  console.log(
    `\nAgent score ${score}/100 — ${report.passed}/${results.length} correct${cost ? `, $${cost.toFixed(2)}` : ''}. Wrote ${join(outDir, 'agent.json')}`,
  )
}

// Run as a script: paths compared as paths (a URL would percent-encode a space), and a missing registry said out loud.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(packageRoot, 'data/registry.json'))) {
    console.error('No data/registry.json: run `pnpm --dir packages/tools/mcp run build:registry` first.')
    process.exit(1)
  }
  await main()
}
