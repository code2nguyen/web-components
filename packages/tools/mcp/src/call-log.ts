/**
 * Opt-in log of the tool calls an agent makes, for measuring how it found its components (the component lab's AI
 * readiness section). `C2N_MCP_LOG` names the file, and calls are appended only **while that file exists**: creating it
 * arms the log, deleting it disarms it, so a setting left in a project config costs nothing between measurements. Each
 * call is one JSON line: the time it started, the tool, its arguments (search words and options as written; code, CSS
 * and other free text by length only), and for a
 * search the components it returned, so the log says what the agent saw, not only what it asked. The results of
 * search_components, search_examples, list_components and validate_markup are computed again, after the answer is
 * sent, from the registry view each tool used (deterministic over it): only an install finishing between the two
 * could make them differ.
 */
import { closeSync, constants, existsSync, openSync, writeSync } from 'node:fs'
import { extname, resolve, win32 } from 'node:path'
import { validateMarkup } from './lib/validate.ts'
import { installedPackage } from './installed.ts'
import { resolveElement } from './registry.ts'
import type { Registry } from './registry-types.ts'
import { searchComponents, searchExamples } from './search.ts'

/**
 * The arguments logged as written: what an agent asked for (a query, a tag, a file name, an option). Every other string
 * (code, CSS, issue text, a repro), whatever its length, is logged as its length: the log measures discovery and is
 * committed with lab reports, so it keeps what was asked, never the code or text that was written. Search words are
 * kept: they are the measurement.
 */
const VERBATIM = new Set([
  'query',
  'keyword',
  'label',
  'section',
  'topic',
  'include',
  'example',
  'component',
  'preset',
  'tag',
  'filename',
  'format',
  'view',
  'limit',
  'category',
  'kind',
  'mode',
  'output',
  'package',
  'id',
])

/** What the agent wrote, reduced to its size: a string to its length, a list or a record to its number of entries. */
function redacted(value: unknown): unknown {
  if (typeof value === 'string') return `${value.length} characters`
  if (Array.isArray(value)) return `${value.length} entries`
  if (value && typeof value === 'object') return `${Object.keys(value).length} entries`
  return value
}

export interface CallLogEntry {
  time: string
  /** The server process: every session runs its own, so one file shared by several sessions can be told apart. */
  pid: number
  tool: string
  args: Record<string, unknown>
  /** search_components, search_examples, list_components with a keyword: the component ids returned, best first. */
  results?: string[]
  /** Tools that take a `tag`: the component it resolved to. */
  component?: string
  /** validate_markup: what it reported, as severity and rule (`error unknown-attribute`); the messages quote the code. */
  findings?: string[]
}

/** The entry for one call, without side effects (tested on its own). */
export function callLogEntry(registry: Registry, tool: string, args: Record<string, unknown>, time = new Date().toISOString()): CallLogEntry {
  const logged = Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      // A file name by its extension only (what validate_markup reads it as): its folders and its name can name the
      // machine's user, the project or a client.
      (key === 'filename' || key === 'reproFilename') && typeof value === 'string'
        ? `*${extname(win32.basename(value))}`
        : // `name` is a lookup for get_presets, but the app's own element name for generate_variant.
          VERBATIM.has(key) || (key === 'name' && tool === 'get_presets')
          ? value
          : redacted(value),
    ]),
  )
  const entry: CallLogEntry = { time, pid: process.pid, tool, args: logged }
  if (tool === 'validate_markup' && typeof args.code === 'string') {
    const filename = typeof args.filename === 'string' ? args.filename : undefined
    entry.args = { ...logged, code: `${args.code.length} characters` }
    entry.findings = validateMarkup(registry, args.code, filename).findings.map((f) => `${f.severity} ${f.rule}`)
  }
  // Every tool that finds components from words records the components it answered with, best first.
  const limit = typeof args.limit === 'number' ? args.limit : undefined
  if (tool === 'search_components' && typeof args.query === 'string') {
    entry.results = searchComponents(registry, args.query, limit ?? 10).map((hit) => hit.component.id)
  }
  if (tool === 'search_examples' && typeof args.query === 'string') {
    const only = typeof args.tag === 'string' ? resolveElement(registry, args.tag)?.component : undefined
    // A tag that does not resolve is answered "unknown component": no search happened, so no results are logged.
    if (typeof args.tag !== 'string' || only)
      // Components in the order of their first card: the rank is the component's place among those shown.
      entry.results = [...new Set(searchExamples(registry, args.query, limit ?? 12, only).map((hit) => hit.component.id))]
  }
  // An empty keyword is no filter (a plain listing, not a search): no results are logged for it, as the tool decides.
  if (tool === 'list_components' && typeof args.keyword === 'string' && args.keyword) {
    // The same filter as the tool: a substring of the id, title, description or a tag.
    const needle = args.keyword.toLowerCase()
    entry.results = Object.values(registry.components)
      .filter(
        (c) =>
          (!args.category || c.category === args.category) &&
          (args.installedOnly !== true || installedPackage(c.package)) &&
          `${c.id} ${c.title} ${c.description} ${c.elements.map((e) => e.tag).join(' ')}`.toLowerCase().includes(needle),
      )
      .map((c) => c.id)
  }
  const named = typeof args.tag === 'string' ? args.tag : typeof args.component === 'string' ? args.component : undefined
  if (named) entry.component = resolveElement(registry, named)?.component.id
  return entry
}

const pending = new Set<() => void>()

/** Runs a log write after the current answer has been sent: that answer never waits for it, the next call may. */
export function deferLog(write: () => void): void {
  pending.add(write)
  setImmediate(() => {
    if (pending.delete(write)) write()
  })
}

/**
 * Writes the deferred entries now. The process that runs the server calls it when it stops (the `c2n-mcp` CLI does,
 * on exit, stdin close and SIGTERM/SIGINT), so the last call of a session is kept; an embedding app does the same.
 */
export function flushLogs(): void {
  for (const write of pending) write()
  pending.clear()
}

/**
 * Appends the entry for one call to `file` when the file exists (see above). `registry` is read inside the guard, so
 * a failure building it, like any logging failure, never fails the call.
 */
export function logCall(file: string, registry: () => Registry, tool: string, args: Record<string, unknown>, time?: string): void {
  try {
    const path = resolve(file)
    if (!existsSync(path)) return
    // Each entry starts with a newline (readers skip empty lines): one torn by a killed server stays on its own line
    // instead of swallowing the next process's entry.
    const line = `\n${JSON.stringify(callLogEntry(registry(), tool, args, time))}`
    // Opened without O_CREAT: a log disarmed while this entry was being built stays deleted (the open throws).
    const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND)
    try {
      writeSync(fd, line)
    } finally {
      closeSync(fd)
    }
  } catch {
    // The log is a measurement, not part of the answer.
  }
}
