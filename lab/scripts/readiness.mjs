// Writes the "AI readiness" section of a lab build report: how the builder found the components it used, from the
// c2n MCP server's call log (`C2N_MCP_LOG`, recorded while building), and what `validate_markup` says about the build
// now. The section is generated between markers; everything else in the report stays hand-written.
//
//   node lab/scripts/readiness.mjs --arm <spec>/<direction> [--force]         # before building that direction
//   node lab/scripts/readiness.mjs --end <spec>/<direction>                   # when the build is done, before the lab run
//   node lab/scripts/readiness.mjs <spec>/<direction> --log <calls.jsonl> [--since <ISO time>] [--until <ISO time>] [--pid <n>]
//   node lab/scripts/readiness.mjs --disarm <spec>/<direction> [--force]      # after its report
//
// --log keeps the calls made since --arm (or --since) by one MCP server process: when other sessions' servers logged
// too, it lists them and asks for the builder's --pid. Without --log, a report is rewritten from its committed log.
//   node lab/scripts/readiness.mjs --all                                      # every report, from its committed log
//   node lab/scripts/readiness.mjs --check [<spec>/<direction>…]             # exit 1 when a section is stale
//
// The log is kept next to the report as `lab/reports/<spec>/<direction>.calls.jsonl`; `--log` copies one there,
// `--since` keeping only the calls made from the build's start (the log is shared by every session in the repo). A
// report built without a log gets the validation part only and says so.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { outsideApps, sourceFiles } from './lib/build-files.mjs'
import { labMarkdownFiles } from './lib/lab-files.mjs'
import { frontMatter, reportRows } from './lib/markdown.mjs'
import prettier from 'prettier'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const mcp = join(root, 'packages/tools/mcp')
const { validateMarkup } = await import(pathToFileURL(join(mcp, 'src/lib/validate.ts')).href)
const { resolveElement } = await import(pathToFileURL(join(mcp, 'src/registry.ts')).href)
const registryFile = join(mcp, 'data/registry.json')
let cachedRegistry
/** The MCP registry (git-ignored, built by `build:registry`), read on first use so importing this module needs none. */
function registry() {
  if (!cachedRegistry) {
    if (!existsSync(registryFile)) throw new Error('No MCP registry: run `npm run build:registry -w packages/tools/mcp` first.')
    cachedRegistry = JSON.parse(readFileSync(registryFile, 'utf8'))
  }
  return cachedRegistry
}

export { outsideApps }

/** The log `.mcp.json` points the c2n server at, and the build start `--arm` records next to it. */
const LOG = join(root, 'lab/.armed/mcp-calls.jsonl')
/** The search query that marks the builder's server: `c2n-lab <spec>/<direction>`, made right after --arm. */
export const MARKER = 'c2n-lab'
const BUILD_START = join(root, 'lab/.armed/build-start')

/** Arms the log for one build (the server appends only while the file exists) and records when the build started. */
function arm(target, force) {
  // Any spec id and direction the spec declares (checked below): only the shape <spec>/<direction> is required here.
  if (!/^[^/\s]+\/[^/\s]+$/.test(target ?? '')) {
    console.error('--arm takes the <spec>/<direction> about to be built.')
    process.exit(2)
  }
  // A typo here would hold the log under a name no report or marker matches.
  const specs = join(root, 'lab/specs')
  // By its front matter id, as gaps.mjs and the readiness run name specs; the file name is the fallback.
  const [spec, direction] = target.split('/')
  const found = labMarkdownFiles(specs)
    .map((path) => ({ file: basename(path), data: frontMatter(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).data }))
    .filter(({ file, data }) => String(data.id || file.slice(0, -3)) === spec)
  // Two specs with one id make the readiness run skip the lab: refuse here too, before a build is recorded.
  if (found.length > 1) {
    console.error(`Lab spec id ${spec} exists ${found.length} times in lab/specs/.`)
    process.exit(2)
  }
  if (!found.length) {
    console.error(`No lab spec with id ${spec} in lab/specs/.`)
    process.exit(2)
  }
  // The spec lists its directions; one it does not list would hold the log under a name no report will have.
  // `directions: [a, b]` reads as a list, `directions: a` as one string.
  // A spec without a directions list has one, `default`, as gaps.mjs reads it.
  const directions = [].concat(found[0].data.directions ?? ['default']).filter(Boolean)
  if (!directions.includes(direction)) {
    console.error(`Spec ${spec} has no direction ${direction} (it lists ${directions.join(', ')}).`)
    process.exit(2)
  }
  if (existsSync(BUILD_START) && !force) {
    const armed = buildStart()
    console.error(`The log is armed for ${armed.target} since ${armed.time}; --arm ${target} --force if that build was abandoned.`)
    process.exit(1)
  }
  mkdirSync(dirname(LOG), { recursive: true })
  // A forced re-arm keeps the file: another build may still be writing to it, and the start time and the marker
  // already leave out its calls.
  if (!existsSync(LOG)) writeFileSync(LOG, '')
  writeFileSync(BUILD_START, `${JSON.stringify({ target, time: new Date().toISOString() })}\n`)
  console.log(`Call log armed for ${target}: ${relative(root, LOG)} (from ${buildStart().time})`)
  console.log(`Now mark your MCP server: call search_components with the query "${MARKER} ${target}".`)
}

/** What --arm recorded: the report the build is for, and when it started. */
function buildStart(fix = '--arm <spec>/<direction> --force to record the build again') {
  if (!existsSync(BUILD_START)) return undefined
  try {
    return JSON.parse(readFileSync(BUILD_START, 'utf8'))
  } catch {
    console.error(`${relative(root, BUILD_START)} is damaged: ${fix}.`)
    process.exit(2)
  }
}

/** Disarms the log: the server stops appending once the file is gone. */
function disarm(target, force) {
  // --force needs no record: it is how a damaged one is cleared.
  const armed = force ? undefined : buildStart('--disarm --force clears it')
  // Another session's build may hold the log: only the build it was armed for closes it.
  if (!force && armed && armed.target !== target) {
    console.error(`The log is armed for ${armed.target}; --disarm ${armed.target} (or --force if that build was abandoned).`)
    process.exit(1)
  }
  if (!force && !armed && existsSync(LOG)) {
    console.error('The log is armed with no record of which build: --disarm --force if no build is running.')
    process.exit(1)
  }
  rmSync(LOG, { force: true })
  rmSync(BUILD_START, { force: true })
  console.log('Call log disarmed.')
}

export const START = '<!-- ai-readiness:start (generated by lab/scripts/readiness.mjs; do not edit) -->'
export const END = '<!-- ai-readiness:end -->'
// A report names a component by tag (`c2-chip`), by package (`@c2n/chart`), or by an icon's own tag (`c2-feather-x`).
const componentOf = (name) => registry().tagIndex[name] ?? registry().packageIndex[name] ?? resolveElement(registry(), name)?.component.id

/**
 * The analysis, without I/O: the components the build used (report rows plus the tags in its files), and for each
 * how the log shows it was found.
 */
export function analyse({ rows, calls, files }) {
  const used = new Map()
  const add = (tag, where) => {
    const id = componentOf(tag)
    if (!id) return
    const entry = used.get(id) ?? { id, tags: new Set(), requirements: new Set() }
    // Element tags only: a package name (`@c2n/chart`) is how a report spelled it, not what the build used.
    if (tag.startsWith('c2-')) entry.tags.add(tag)
    if (where) entry.requirements.add(where)
    used.set(id, entry)
  }
  const validation = []
  for (const file of files) {
    const result = validateMarkup(registry(), file.source, file.name)
    for (const element of result.elements) add(element.tag)
    for (const f of result.findings) validation.push({ file: file.name, line: f.line, severity: f.severity, rule: f.rule, message: f.message })
  }
  // Only rows the build met with components: a hand-rolled or failed row names the component that fell short. A
  // package name (`@c2n/chart`, several pages) stands for the components of that package the build's files use.
  const usedInFiles = new Set(used.keys())
  for (const [id, row] of rows) {
    if (row.outcome !== 'met' && row.outcome !== 'workaround') continue
    for (const name of row.components) {
      if (!name.startsWith('@c2n/')) add(name, id)
      else
        for (const c of Object.values(registry().components))
          if (c.package === name && usedInFiles.has(c.id)) for (const tag of used.get(c.id).tags) add(tag, id)
    }
  }

  const byTool = {}
  for (const call of calls) byTool[call.tool] = (byTool[call.tool] ?? 0) + 1
  // Any call that found components from words: search_components, search_examples, list_components with a keyword.
  // A call that named its component already is a lookup, not a search: search_examples limited by `tag`, or a
  // list_components keyword that is the component's own tag or id.
  // A keyword names a component when it is its tag, its package or its id (`table`): not any word that resolves.
  // Lowercased, as the tool matches it.
  // Only a tag or a package name: a bare word that happens to be an id ("menu", "table") is how a developer
  // phrases the need, so it stays a search.
  const namesComponent = (keyword, tool) => {
    const kw = keyword.toLowerCase()
    // list_components does not match package names, so `@c2n/…` names a component only for the tools that resolve it.
    return (/^c2-/.test(kw) || (tool !== 'list_components' && kw.startsWith('@c2n/'))) && Boolean(componentOf(kw))
  }
  const namesIt = (c) => (c.tool === 'search_examples' && c.args?.tag) || namesComponent(String(c.args?.query ?? c.args?.keyword ?? '').trim(), c.tool)
  const searches = calls.filter((c) => Array.isArray(c.results) && !namesIt(c))
  const words = (s) => `${s.tool === 'search_components' ? '' : `${s.tool} `}"${s.args.query ?? s.args.keyword}"`
  const lookups = calls.filter((c) => c.tool === 'get_component' && c.component)
  const found = [...used.values()]
    .map((u) => {
      // The search that ranked it best (the earliest of equals), not the first one it happened to appear in.
      let search = -1
      // list_components answers in registry order, not by relevance: a listing never counts as the search that found it.
      const rankIn = (s) => (s.tool !== 'list_components' && s.results.includes(u.id) ? s.results.indexOf(u.id) + 1 : -1)
      searches.forEach((s, i) => {
        const rank = rankIn(s)
        if (rank > 0 && (search < 0 || rank < rankIn(searches[search]))) search = i
      })
      // A child element the author slots into a parent (`c2-list-item` in `c2-select`) is documented by the parent's
      // get_component answer, when the build uses that parent. Only slotted children: an element a component draws
      // itself (`internal`) is not one.
      const parents = Object.values(registry().components)
        .filter((c) => used.has(c.id) && [...u.tags].some((tag) => c.composition.slotted.includes(tag)))
        .map((c) => c.id)
      const lookup = lookups.findIndex((c) => c.component === u.id || parents.includes(c.component))
      return {
        id: u.id,
        tags: u.tags.size ? [...u.tags].sort() : [u.id],
        requirements: [...u.requirements],
        search: search >= 0 ? { query: words(searches[search]), rank: rankIn(searches[search]), index: calls.indexOf(searches[search]) + 1 } : null,
        lookedUp: lookup >= 0,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  const usedIds = new Set(used.keys())
  const missedSearches = searches
    .filter((s) => !s.results.some((id) => usedIds.has(id)))
    // list_components answers in registry order: its first ids are not its best, so it says how many it listed.
    .map((s) => ({
      query: words(s),
      top: s.tool === 'list_components' ? [`${s.results.length} components in registry order`] : [...new Set(s.results)].slice(0, 3),
    }))
  const validateCalls = calls.filter((c) => c.tool === 'validate_markup')
  return {
    calls: calls.length,
    byTool,
    found,
    missedSearches,
    validateCalls: validateCalls.length,
    validateErrors: validateCalls.reduce((n, c) => n + (c.findings ?? []).filter((f) => f.startsWith('error')).length, 0),
    validation,
  }
}

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function section(result, { log }) {
  const lines = [START, '', '## AI readiness', '']
  if (log) {
    lines.push(
      `How the builder found its components, from the c2n MCP call log (\`${log}\`): ${result.calls} call${result.calls === 1 ? '' : 's'} (${Object.entries(
        result.byTool,
      )
        .sort((a, b) => b[1] - a[1])
        .map(([tool, n]) => `${tool} ${n}`)
        .join(', ')}).`,
      '',
      '| Component | Requirements | Best search that returned it | Rank | `get_component` |',
      '| --- | --- | --- | ---: | :-: |',
      ...result.found.map(
        (f) =>
          `| ${f.tags.join(', ')} | ${f.requirements.join(', ') || '—'} | ${f.search ? `${cell(f.search.query)} (call ${f.search.index})` : '**none**'} | ${f.search?.rank ?? '—'} | ${f.lookedUp ? '✓' : '**✗**'} |`,
      ),
      '',
    )
    const unfound = result.found.filter((f) => !f.search)
    if (unfound.length)
      lines.push(
        `No search returned ${unfound.map((f) => `\`${f.id}\``).join(', ')}: the builder knew the name or found it another way (a \`c2n://\` resource read or \`get_examples\` is not recorded as a search). If a requirement needed it, its words are a discovery gap. A \`list_components\` listing never counts as the search that found a component.`,
        '',
      )
    const blind = result.found.filter((f) => !f.lookedUp)
    if (blind.length)
      lines.push(`Used without \`get_component\`: ${blind.map((f) => `\`${f.id}\``).join(', ')} (its API was written from memory or from an example).`, '')
    if (result.missedSearches.length)
      lines.push(
        'Searches that returned none of the components the build used:',
        '',
        ...result.missedSearches.map((s) => `- ${cell(s.query)} → ${s.top.join(', ') || 'nothing'}`),
        '',
      )
    lines.push(
      `\`validate_markup\` while building: ${result.validateCalls} call${result.validateCalls === 1 ? '' : 's'}, ${result.validateErrors} error${result.validateErrors === 1 ? '' : 's'} reported.`,
      '',
    )
  } else {
    lines.push(
      'No MCP call log was recorded for this build (arm it with `node lab/scripts/readiness.mjs --arm <spec>/<direction>` before building), so how each component was found is unknown.',
      '',
    )
  }
  const errors = result.validation.filter((v) => v.severity === 'error')
  lines.push(
    result.validation.length
      ? `\`validate_markup\` on the build now (against the workspace registry, which lab apps import): ${errors.length} error${errors.length === 1 ? '' : 's'}, ${result.validation.length - errors.length} other finding${result.validation.length - errors.length === 1 ? '' : 's'}.`
      : '`validate_markup` on the build now (against the workspace registry, which lab apps import): no findings.',
  )
  if (result.validation.length)
    lines.push(
      '',
      // Severity and rule, not the message: its "did you mean" follows every component change, the finding does not.
      ...result.validation.slice(0, 20).map((v) => `- ${v.file}:${v.line} ${v.severity} ${v.rule}`),
      ...(result.validation.length > 20 ? [`- …and ${result.validation.length - 20} more (run \`validate_markup\` on the build for all of them)`] : []),
    )
  lines.push('', END)
  return lines.join('\n')
}

/** The report with its section replaced, or inserted before "## Friction outside the requirements" (else appended). */
export function withSection(markdown, text) {
  const start = markdown.indexOf(START)
  const end = markdown.indexOf(END)
  // A marker edited away would make every run add another section: stop instead.
  if ((start >= 0 || end >= 0) && !(start >= 0 && end > start && markdown.indexOf(START, start + 1) < 0 && markdown.indexOf(END, end + 1) < 0))
    throw new Error(`the generated AI readiness section's markers are damaged: keep one ${START} followed by one ${END}`)
  if (start >= 0) return markdown.slice(0, start) + text + markdown.slice(end + END.length)
  const anchor = markdown.search(/^## Friction outside the requirements/m)
  if (anchor >= 0) return `${markdown.slice(0, anchor)}${text}\n\n${markdown.slice(anchor)}`
  return `${markdown.trimEnd()}\n\n${text}\n`
}

/** The calls of a log made at or after `since` (an ISO time), so calls another session made earlier are left out. */
export function callsSince(text, since, until) {
  return (
    text
      .split('\n')
      .flatMap((line, i) => {
        if (!line.trim()) return []
        try {
          const call = JSON.parse(line)
          if (!Number.isNaN(Date.parse(call.time))) return [call]
          console.warn(`call log line ${i + 1} has no time; skipped`)
        } catch {
          // A server killed while appending leaves a torn line: skip it, do not lose the build's other calls.
          console.warn(`call log line ${i + 1} is not JSON; skipped`)
        }
        return []
      })
      .filter((call) => (since === undefined || Date.parse(call.time) >= since) && (until === undefined || Date.parse(call.time) <= until))
      // Appended when each call finished: put them back in the order they started.
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  )
}

/** `--since` as a time: any ISO 8601 form (`2026-11-19T10:00:00Z`, with an offset or milliseconds). */
export function parseSince(value, flag = '--since') {
  if (value === undefined) return undefined
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw new Error(`${flag} ${value} is not a date and time`)
  return time
}

async function run(target, { logArg, since, until, pid: pidArg }) {
  let pid = pidArg
  // Written by the caller together with the report, once everything below has worked.
  let newLog
  const [spec, direction] = target.split('/')
  const reportFile = join(root, 'lab/reports', spec, `${direction}.md`)
  if (!existsSync(reportFile)) throw new Error(`No report ${relative(root, reportFile)}`)
  const logFile = join(root, 'lab/reports', spec, `${direction}.calls.jsonl`)
  let calls = existsSync(logFile) ? callsSince(readFileSync(logFile, 'utf8')) : []
  if (logArg) {
    // An empty log (from the build's start) means the server never logged: say so; an earlier build's committed log
    // is never dropped here (the refusal below says how).
    calls = callsSince(readFileSync(resolve(logArg), 'utf8'), since, until)
    // Other sessions' servers write to the same file: keep the builder's process only.
    const servers = new Map()
    for (const call of calls) servers.set(call.pid, (servers.get(call.pid) ?? 0) + 1)
    // The builder marks its own server right after --arm with a search for `c2n-lab <spec>/<direction>`.
    const marker = `${MARKER} ${target}`
    // Trimmed and lowercased: a trailing space or a capital does not unmark the builder's server.
    const queryOf = (call) =>
      String(call.args?.query ?? call.args?.keyword ?? '')
        .trim()
        .toLowerCase()
    const marked = [...new Set(calls.filter((call) => queryOf(call) === marker.toLowerCase()).map((call) => call.pid))]
    if (pid === undefined && marked.length) {
      // Any other server in the build's window may be the builder's own before or after a restart, or another
      // session: ask rather than drop or keep it.
      const others = [...servers.keys()].filter((p) => !marked.includes(p))
      if (others.length)
        throw new Error(
          `${target}: pid ${others.join(', ')} also logged during the build (the marker is pid ${marked.join(', ')}): another session, or the builder's server restarted. Pass --pid ${marked.join(',')} (plus any that are the builder's).`,
        )
      pid = marked
    }
    if (pid !== undefined) {
      const missing = pid.filter((p) => !servers.has(p))
      if (missing.length)
        throw new Error(`${target}: no call in the log comes from pid ${missing.join(', ')} (it has ${[...servers.keys()].join(', ') || 'none'}).`)
      calls = calls.filter((call) => pid.includes(call.pid))
    } else if (servers.size) {
      // Unmarked: even a single process may be another session's (the builder's server may not log at all).
      const list = [...servers].map(([p, n]) => `pid ${p}: ${n} calls from ${calls.find((c) => c.pid === p).time}`).join('; ')
      throw new Error(`${target}: no "${marker}" search marks the builder's server (${list}). Pass its --pid (several, comma-separated, when it restarted).`)
    }
    // Every marker, this target's or a mistyped one, is bookkeeping, not a search.
    // Through whichever tool it was typed: the marker is bookkeeping.
    calls = calls.filter((call) => !queryOf(call).startsWith(`${MARKER} `))
    if (calls.length === 0) {
      // A committed log stays unless the build was really redone without logging: say how to drop it.
      if (existsSync(logFile))
        throw new Error(
          `${target}: the log holds no call from this build, and ${relative(root, logFile)} is from an earlier one. Delete it if this build replaced that one.`,
        )
      console.warn(`${target}: the log holds no call from this build; the report says no log was recorded.`)
    } else newLog = calls
  }
  // LF, as the front matter reader and prettier expect: a CRLF checkout reads the same report.
  // LF for reading, as the front matter reader and prettier expect; the raw text is what --check compares, so a CRLF
  // file shows as stale rather than being rewritten unseen by the next --all.
  const raw = readFileSync(reportFile, 'utf8')
  const markdown = raw.replace(/\r\n/g, '\n')
  // The folder names the spec, as the readiness run's lab requirements read it: a front matter that disagrees is a mistake.
  const declared = frontMatter(markdown).data.spec
  if (declared && declared !== spec) throw new Error(`${target}: the report's front matter says spec ${declared}; its folder says ${spec}.`)
  const build = String(frontMatter(markdown).data.build || `lab/apps/${spec}/${direction}`)
  const buildDir = join(root, build)
  if (outsideApps(relative(join(root, 'lab/apps'), buildDir)))
    throw new Error(`${target}: the build ${build} is not under lab/apps/ (front matter \`build:\`).`)
  if (!existsSync(buildDir)) throw new Error(`${target}: the build ${relative(root, buildDir)} does not exist (front matter \`build:\`).`)
  const files = sourceFiles(buildDir).map((file) => ({ name: relative(buildDir, file).split(sep).join('/'), source: readFileSync(file, 'utf8') }))
  const result = analyse({ rows: reportRows(frontMatter(markdown).body), calls, files })
  const unformatted = withSection(markdown, section(result, { log: calls.length ? relative(root, logFile) : null }))
  // Formatted as `npm run format:check` expects, so a fresh section is not a formatting failure.
  const next = await prettier.format(unformatted, { ...(await prettier.resolveConfig(reportFile)), filepath: reportFile })
  return { reportFile, markdown: raw, next, result, logFile, newLog }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const option = (name) => {
    if (!args.includes(name)) return undefined
    const value = args[args.indexOf(name) + 1]
    if (!value || value.startsWith('--')) {
      console.error(`${name} needs a value.`)
      process.exit(2)
    }
    return value
  }
  const logArg = option('--log')
  // Targets are positional wherever they appear (`--arm x/y --force` and `--arm --force x/y` alike): only the values
  // of --log, --since, --until and --pid are not.
  const named = args.filter((a, i) => !a.startsWith('--') && !['--log', '--since', '--until', '--pid'].includes(args[i - 1]))
  const lifecycle = ['--arm', '--end', '--disarm'].filter((flag) => args.includes(flag))
  if (lifecycle.length > 1) {
    console.error(`${lifecycle.join(' and ')} are separate steps: arm before a build, end it when it is built, disarm after its report.`)
    process.exit(2)
  }
  if (lifecycle.length && named.length > 1) {
    console.error(`${lifecycle[0]} takes one <spec>/<direction>.`)
    process.exit(2)
  }
  if (lifecycle.length && ['--log', '--check', '--since', '--until', '--pid', '--all'].some((flag) => args.includes(flag))) {
    console.error(
      `${lifecycle[0]} is a step of its own: run it without ${['--log', '--check', '--since', '--until', '--pid', '--all'].filter((f) => args.includes(f)).join(', ')}.`,
    )
    process.exit(2)
  }
  // Armed only once every check passed: a refused command leaves no log armed.
  if (args.includes('--arm')) arm(named[0], args.includes('--force'))
  if (args.includes('--end')) {
    // Closes the build's window: calls after it (lab journeys, triage, the report) are not how the build found things.
    const armed = buildStart('--arm <spec>/<direction> --force to record the build again')
    if (!armed || armed.target !== named[0]) {
      console.error(armed ? `The log is armed for ${armed.target}.` : 'The log is not armed.')
      process.exit(2)
    }
    // A second --end would move the end past the lab run and count its calls: only --force does that.
    if (armed.end && !args.includes('--force')) {
      console.error(`The build of ${armed.target} already ended at ${armed.end}; --end ${armed.target} --force to move it.`)
      process.exit(2)
    }
    const end = new Date().toISOString()
    writeFileSync(BUILD_START, `${JSON.stringify({ ...armed, end })}\n`)
    console.log(`Build of ${armed.target} ended at ${end}; the report keeps the calls before it.`)
    process.exit(0)
  }
  if (args.includes('--disarm')) {
    // The target names the build closing the log; --force alone clears it whatever holds it.
    disarm(named[0], args.includes('--force'))
  }
  if (args.includes('--arm') || args.includes('--disarm')) process.exit(0)
  // The target first: every check below is about the one report --log writes.
  if (logArg && check) {
    console.error('--check reads the committed logs; --log is for writing one.')
    process.exit(2)
  }
  if (!logArg && (args.includes('--since') || args.includes('--until') || args.includes('--pid'))) {
    console.error('--since, --until and --pid filter the log --log reads; a committed log is read whole.')
    process.exit(2)
  }
  if (args.includes('--all') && (named.length || logArg)) {
    console.error('--all regenerates every report from its committed log: it takes no report and no --log.')
    process.exit(2)
  }
  const bad = named.filter((t) => !/^[^/\s]+\/[^/\s]+$/.test(t))
  if (bad.length) {
    console.error(`A report is <spec>/<direction>: ${bad.join(', ')}.`)
    process.exit(2)
  }
  if (logArg && named.length !== 1) {
    console.error('--log takes exactly one <spec>/<direction>.')
    process.exit(2)
  }
  // Without --since, the start --arm recorded, which also names the report: a log read for another one would credit
  // that build's calls to this one.
  const armed = logArg ? buildStart() : undefined
  const sinceArg = option('--since')
  if (logArg && !sinceArg && armed && !args.includes(armed.target)) {
    console.error(`The log is armed for ${armed.target}, not this report.`)
    process.exit(2)
  }
  let since
  let until
  try {
    since = parseSince(sinceArg ?? armed?.time)
    // The build ends at --end (before the lab journeys and the report), so triage calls are not build calls.
    // Another build's end does not close this one: only the armed build's own --end, or --until.
    until = parseSince(option('--until') ?? (armed && named.includes(armed.target) ? armed.end : undefined), '--until')
    // Without an end, every call up to now would count, the lab run's and the triage's included.
    if (logArg && since === undefined) throw new Error('--log needs the build start: --arm before the build, or --since <time>.')
    if (logArg && until === undefined) throw new Error('The build has no end: run --end <spec>/<direction> when it is built (or pass --until <time>).')
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  const pidArg = option('--pid')
  // One build can span several processes of its own server (a restart, a reconnect): --pid takes a list.
  const pid = pidArg === undefined ? undefined : pidArg.split(',').map(Number)
  if (pid !== undefined && !pid.every((p) => Number.isInteger(p) && p > 0)) {
    console.error(`--pid ${pidArg} is not a process id.`)
    process.exit(2)
  }
  if (logArg && !existsSync(resolve(logArg))) {
    console.error(`${logArg} does not exist: arm the log (--arm) before the build, and write the report before --disarm.`)
    process.exit(2)
  }
  const targets =
    named.length === 0 || args.includes('--all')
      ? readdirSync(join(root, 'lab/reports'), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()
          .flatMap((name) =>
            readdirSync(join(root, 'lab/reports', name))
              .filter((f) => f.endsWith('.md'))
              .sort()
              .map((f) => `${name}/${f.slice(0, -3)}`),
          )
      : named
  let stale = 0
  let failed = 0
  for (const target of targets) {
    // --check never writes, and only the named target takes the log.
    let ran
    try {
      ran = await run(target, { logArg: named.includes(target) ? logArg : undefined, since, until, pid })
    } catch (error) {
      // A refusal (unmarked servers, damaged markers) is a message, not a crash, and the other reports still run.
      console.error(error.message)
      failed++
      continue
    }
    const { reportFile, markdown, next, result, logFile, newLog } = ran
    const summary = `${target}: ${result.calls ? `${result.calls} calls, ${result.found.filter((f) => !f.search).length} components no search returned` : 'no call log'}, ${result.validation.filter((v) => v.severity === 'error').length} validation errors`
    if (check) {
      if (next !== markdown) {
        stale++
        console.log(`stale: ${summary}`)
      }
    } else {
      if (newLog) writeFileSync(logFile, newLog.map((call) => JSON.stringify(call)).join('\n') + '\n')
      if (next !== markdown) writeFileSync(reportFile, next)
      console.log(summary)
    }
  }
  if (check && stale) {
    console.log('Run `node lab/scripts/readiness.mjs --all` and commit the reports.')
    process.exit(1)
  }
  if (failed) process.exit(2)
}
