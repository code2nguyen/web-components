#!/usr/bin/env node
// Component lab runner: drives a target app through its journeys as each persona, with the oracles watching, and
// writes the findings to test-results/lab/<target>/. See lab/README.md.
//
//   node lab/scripts/lab.mjs list
//   node lab/scripts/lab.mjs run <target> [--personas mouse,keyboard] [--journeys id,…] [--repeat N]
//                                         [--steps file.json] [--aria] [--no-axe] [--record]
//   node lab/scripts/lab.mjs replay [--targets a,b] [--repeat N]   every target, recorded in lab/runs/ and compared
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERSONAS, personaInitScript } from './lib/personas.mjs'
import { checkAxe, checkOverflow, componentIn, createFocusChecker, watchConsole } from './lib/oracles.mjs'
import { axTree, checkAxTree, formatAxTree } from './lib/ax-tree.mjs'
import { describeStep, locate, runStep } from './lib/steps.mjs'
import { ensureServer } from './lib/server.mjs'
import { buildRecord, comparable, compare, loadRecords, writeRecord } from './lib/record.mjs'

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(LAB, '..')
const TARGETS = join(LAB, 'targets')
const KNOWN = join(LAB, 'known.json')

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = { command, axe: true, aria: false, record: false, mode: command === 'replay' ? 'replay' : 'run' }
  if (command === 'run') options.targetName = rest.shift()
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--personas') options.personas = rest[++i].split(',')
    else if (arg === '--journeys') options.journeys = rest[++i].split(',')
    else if (arg === '--targets') options.targets = rest[++i].split(',')
    else if (arg === '--repeat') {
      options.repeat = Number(rest[++i])
      if (!Number.isInteger(options.repeat) || options.repeat < 1) throw new Error(`--repeat takes a whole number from 1, not "${rest[i]}"`)
    } else if (arg === '--steps') options.steps = rest[++i]
    else if (arg === '--aria') options.aria = true
    else if (arg === '--no-axe') options.axe = false
    else if (arg === '--record') options.record = true
    else throw new Error(`Unknown option ${arg}`)
  }
  // A replay is the lab's regression check: every target, every persona and journey, every oracle, recorded. Options
  // that would make it partial, or that only mean something for one target, belong to `run`.
  if (command === 'replay') {
    const partial = ['personas', 'journeys', 'steps', 'aria'].filter((key) => options[key])
    if (partial.length) throw new Error(`replay runs every persona and journey; --${partial.join(', --')} belong to \`run <target>\``)
    if (options.axe === false) throw new Error('replay runs every oracle; --no-axe belongs to `run <target>`')
    options.record = true
  } else if (options.targets) {
    throw new Error('--targets belongs to `replay`; `run` takes one target')
  }
  options.repeat ??= command === 'replay' ? 2 : 1
  return options
}

function loadTarget(name) {
  const file = join(TARGETS, `${name}.json`)
  if (!existsSync(file)) throw new Error(`No target ${name}. Known: ${listTargets().join(', ')}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function listTargets() {
  return readdirSync(TARGETS)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
}

function loadKnown() {
  return existsSync(KNOWN) ? JSON.parse(readFileSync(KNOWN, 'utf8')) : {}
}

const slug = (text) =>
  String(text)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

async function runJourney(browser, target, persona, personaName, journey, run, out, options) {
  const raw = []
  const tag = `${personaName}-${journey.id}${options.repeat > 1 ? `-r${run}` : ''}`
  const result = { persona: personaName, journey: journey.id, run, status: 'passed', failedStep: null, error: null }
  let currentStep = -1

  const context = await browser.newContext({ ...persona.context, baseURL: target.url })
  await context.addInitScript(personaInitScript(persona))
  const page = await context.newPage()

  const report = (finding) => {
    const entry = { ...finding, persona: personaName, journey: journey.id, run, step: currentStep }
    if (finding.screenshot) {
      const file = `shots/${tag}-${finding.kind}-${raw.length}.png`
      writeFileSync(join(out, file), finding.screenshot)
      entry.screenshot = file
    }
    if (finding.screenshotUnfocused) {
      const file = `shots/${tag}-${finding.kind}-${raw.length}-unfocused.png`
      writeFileSync(join(out, file), finding.screenshotUnfocused)
      entry.screenshotUnfocused = file
    }
    raw.push(entry)
  }
  const detach = watchConsole(page, report)
  const ctx = {
    persona,
    report,
    onTabStop: persona.checkFocus ? createFocusChecker(page, report) : undefined,
    snapshot: async (label) => {
      writeFileSync(join(out, 'snapshots', `${tag}-${slug(label)}.txt`), formatAxTree(await axTree(page)))
    },
  }

  for (const [index, step] of journey.steps.entries()) {
    currentStep = index
    ctx.stepLabel = describeStep(step)
    try {
      await runStep(page, step, ctx)
    } catch (error) {
      result.status = 'failed'
      result.failedStep = index
      result.error = `${describeStep(step)}\n${String(error.message).split('\n').slice(0, 6).join('\n')}`
      let component = null
      const handle = step.click ?? step.fill ?? step.hover ?? Object.values(step.expect ?? {})[0]
      if (handle && typeof handle === 'object') {
        component = await locate(page, handle, 0)
          .then((locator) =>
            locator.evaluate(
              (el) => {
                for (let node = el; node; node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode) {
                  if (node.localName?.startsWith('c2-')) return node.localName
                }
                return null
              },
              null,
              { timeout: 500 },
            ),
          )
          .catch(() => null)
      }
      report({
        kind: 'journey-broken',
        severity: 'error',
        component: component ?? componentIn(error.message),
        rule: `${journey.id}#${index}`,
        message: result.error,
        screenshot: await page.screenshot({ fullPage: false }).catch(() => undefined),
      })
      break
    }
  }

  currentStep = -1
  if (options.axe) await checkAxe(page, report).catch((error) => report({ kind: 'lab-error', severity: 'warn', rule: 'axe', message: error.message }))
  await checkAxTree(page, report).catch((error) => report({ kind: 'lab-error', severity: 'warn', rule: 'ax-tree', message: error.message }))
  await checkOverflow(page, report)
  await page.screenshot({ path: join(out, 'shots', `${tag}-end.png`), fullPage: true }).catch(() => {})
  if (options.aria) {
    const tree = await axTree(page)
      .then(formatAxTree)
      .catch((error) => `# accessibility tree failed: ${error.message}`)
    writeFileSync(join(out, 'snapshots', `${tag}-end.txt`), tree)
    console.log(`\n--- accessibility tree (what a screen reader gets): ${tag} ---\n${tree}`)
  }
  if (ctx.onTabStop) result.focusChecks = ctx.onTabStop.stats
  detach()
  await context.close()
  return { result, raw }
}

/** Merge raw findings that share a key; record where they were seen and whether every repeat saw them. */
function aggregate(targetName, raw, repeat, known) {
  const findings = new Map()
  for (const entry of raw) {
    const key = `${targetName}/${entry.kind}/${entry.component ?? '-'}/${entry.rule ?? '-'}`
    const finding = findings.get(key) ?? {
      key,
      kind: entry.kind,
      severity: entry.severity,
      component: entry.component ?? null,
      rule: entry.rule ?? null,
      message: entry.message,
      details: entry.details,
      screenshot: entry.screenshot,
      seen: {},
    }
    const where = `${entry.persona}/${entry.journey}`
    finding.seen[where] = new Set([...(finding.seen[where] ?? []), entry.run])
    if (!finding.screenshot && entry.screenshot) finding.screenshot = entry.screenshot
    findings.set(key, finding)
  }
  return [...findings.values()].map((finding) => {
    const seen = Object.fromEntries(Object.entries(finding.seen).map(([where, runs]) => [where, runs.size]))
    return {
      ...finding,
      seen,
      reproducible: Object.values(seen).every((count) => count === repeat),
      status: known[finding.key] ? 'known' : 'new',
      knownReason: known[finding.key],
    }
  })
}

function writeReport(out, target, results, findings, options) {
  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => (a.status === b.status ? 0 : a.status === 'new' ? -1 : 1) || order[a.severity] - order[b.severity] || a.key.localeCompare(b.key))
  writeFileSync(join(out, 'findings.json'), JSON.stringify({ target: target.name, repeat: options.repeat, results, findings }, null, 2) + '\n')

  const lines = [
    `# Component lab: ${target.name}`,
    '',
    `${target.title ?? ''}`,
    '',
    '## Journeys',
    '',
    '| Persona | Journey | Run | Result |',
    '| --- | --- | --- | --- |',
  ]
  for (const r of results) lines.push(`| ${r.persona} | ${r.journey} | ${r.run} | ${r.status === 'passed' ? 'passed' : `**failed** at step ${r.failedStep}`} |`)
  const fresh = findings.filter((f) => f.status === 'new')
  lines.push('', `## Findings: ${fresh.length} new, ${findings.length - fresh.length} known`, '')
  for (const f of findings) {
    lines.push(`### ${f.status === 'new' ? '🆕' : '·'} \`${f.key}\``, '')
    lines.push(`- **${f.severity}** ${f.kind} in \`${f.component ?? 'app'}\`${f.reproducible ? '' : ' — **not seen on every repeat (flaky)**'}`)
    lines.push(
      `- Seen: ${Object.entries(f.seen)
        .map(([where, n]) => `${where} ×${n}`)
        .join(', ')}`,
    )
    if (f.knownReason) lines.push(`- Known: ${f.knownReason}`)
    if (f.screenshot) lines.push(`- Screenshot: \`${f.screenshot}\``)
    lines.push('', '```', String(f.message).trim(), '```', '')
  }
  writeFileSync(join(out, 'report.md'), lines.join('\n'))
  return lines.join('\n')
}

async function run(options) {
  const target = loadTarget(options.targetName)
  if (options.steps) {
    const adhoc = JSON.parse(readFileSync(resolve(options.steps), 'utf8'))
    target.journeys = [Array.isArray(adhoc) ? { id: 'adhoc', steps: adhoc } : { id: 'adhoc', ...adhoc }]
  } else if (options.journeys) {
    const unknown = options.journeys.filter((id) => !target.journeys.some((journey) => journey.id === id))
    if (unknown.length) throw new Error(`Unknown journey ${unknown.join(', ')}. Known: ${target.journeys.map((journey) => journey.id).join(', ')}`)
    target.journeys = target.journeys.filter((journey) => options.journeys.includes(journey.id))
  }
  const personaNames = options.personas ?? target.personas ?? Object.keys(PERSONAS)
  for (const name of personaNames) if (!PERSONAS[name]) throw new Error(`Unknown persona ${name}. Known: ${Object.keys(PERSONAS).join(', ')}`)

  const out = join(ROOT, 'test-results', 'lab', target.name)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(join(out, 'shots'), { recursive: true })
  mkdirSync(join(out, 'snapshots'), { recursive: true })

  const startedAt = new Date()
  const server = await ensureServer(target, ROOT)
  const results = []
  const raw = []
  let browser
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
    for (const personaName of personaNames) {
      for (const journey of target.journeys) {
        if (journey.personas && !journey.personas.includes(personaName)) continue
        for (let runIndex = 1; runIndex <= options.repeat; runIndex++) {
          const outcome = await runJourney(browser, target, PERSONAS[personaName], personaName, journey, runIndex, out, options)
          results.push(outcome.result)
          raw.push(...outcome.raw)
          const focus = outcome.result.focusChecks
            ? `, focus compared on ${outcome.result.focusChecks.compared} control(s), skipped ${outcome.result.focusChecks.skipped}`
            : ''
          console.log(
            `${outcome.result.status === 'passed' ? '✓' : '✗'} ${personaName} · ${journey.id}${options.repeat > 1 ? ` · run ${runIndex}` : ''} (${outcome.raw.length} raw finding(s)${focus})`,
          )
        }
      }
    }
  } finally {
    await browser?.close()
    await server.stop()
  }

  const findings = aggregate(target.name, raw, options.repeat, loadKnown())
  console.log('\n' + writeReport(out, target, results, findings, options))
  console.log(`\nWrote ${join('test-results', 'lab', target.name)}/{report.md,findings.json,shots/,snapshots/}`)

  let record = null
  if (options.record && !options.steps) {
    record = buildRecord({ root: ROOT, target, mode: options.mode, options, personas: personaNames, results, findings, startedAt, finishedAt: new Date() })
    record.change = compare(
      loadRecords(ROOT, target.name)
        .filter((previous) => comparable(previous, record))
        .at(-1),
      record,
    )
    const file = writeRecord(ROOT, record)
    console.log(`Recorded ${file}`)
    if (record.change) printChange(record.change)
  }
  // A flaky finding (not seen on every repeat) is reported but does not fail the run: it needs a closer look, not a filing.
  return { code: findings.some((finding) => finding.status === 'new' && finding.reproducible) ? 1 : 0, record }
}

function printChange(change) {
  const line = (label, items) => console.log(`  ${label}: ${items.length ? items.join(', ') : 'none'}`)
  console.log(`Since ${change.previous} (library ${change.previousLibrary.version} @ ${String(change.previousLibrary.commit).slice(0, 8)}):`)
  line('findings that appeared', change.appeared)
  line('findings that are gone', change.gone)
  line('findings not reached (a journey they need failed)', change.unverified)
  line('journeys now passing', change.nowPassing)
  line('journeys now failing', change.nowFailing)
}

/** Every target (or the ones named), recorded and compared with its previous full run, then a summary. */
async function replay(options) {
  const names = options.targets ?? listTargets()
  const unknown = names.filter((name) => !listTargets().includes(name))
  if (unknown.length) throw new Error(`Unknown target ${unknown.join(', ')}. Known: ${listTargets().join(', ')}`)
  const outcomes = []
  for (const name of names) {
    console.log(`\n═══ ${name} ═══`)
    // One target failing to start (a server that does not answer, a broken target file) must not hide the others.
    try {
      outcomes.push({ name, ...(await run({ ...options, targetName: name })) })
    } catch (error) {
      console.error(`${name}: ${error.message}`)
      outcomes.push({ name, code: 1, record: null, error: error.message.split('\n')[0] })
    }
  }

  const library = outcomes.find(({ record }) => record)?.record.library
  const summary = [
    `## Component lab replay`,
    '',
    library
      ? `Library ${library.version} @ \`${String(library.commit).slice(0, 8)}\`${library.dirty ? ' (with local component edits)' : ''}.`
      : 'No target ran.',
    '',
    '| Target | Journeys passed | New | Known | Flaky | Gone since last run | Appeared since last run |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...outcomes.map(({ name, record, error }) => {
      if (!record) return `| ${name} | **error:** ${error} | | | | | |`
      const sum = record.summary
      return `| ${name} | ${sum.passed}/${sum.journeys} | ${sum.findings.new} | ${sum.findings.known} | ${sum.findings.flaky} | ${record.change?.gone.length ?? '–'} | ${record.change?.appeared.length ?? '–'} |`
    }),
  ]
  // A known finding that a full run no longer sees is a component fix to confirm: then drop it from known.json and
  // move its COMPONENT-FEEDBACK.md entry to Fixed. Only a run whose every journey passed on every repeat reached all
  // the states the known findings were seen in; otherwise their absence proves nothing.
  const known = loadKnown()
  const conclusive = ({ record }) => record?.runner.full && record.summary.failed === 0 && record.summary.flakyJourneys === 0
  const stale = outcomes
    .filter(conclusive)
    .flatMap(({ name, record }) => Object.keys(known).filter((key) => key.startsWith(`${name}/`) && !record.findings.some((finding) => finding.key === key)))
  if (stale.length)
    summary.push('', 'Known findings no longer seen (confirm the fix, then remove them from `lab/known.json`):', '', ...stale.map((key) => `- \`${key}\``))
  const skipped = outcomes.filter((outcome) => outcome.record && !conclusive(outcome)).map(({ name }) => name)
  if (skipped.length) summary.push('', `Not checked for fixed findings, since a journey failed: ${skipped.join(', ')}.`)
  const appeared = outcomes.flatMap(({ record }) => record?.change?.appeared ?? [])
  if (appeared.length) summary.push('', 'Findings that appeared since the last run:', '', ...appeared.map((key) => `- \`${key}\``))
  const text = summary.join('\n') + '\n'
  mkdirSync(join(ROOT, 'test-results', 'lab'), { recursive: true })
  writeFileSync(join(ROOT, 'test-results', 'lab', 'replay-summary.md'), text)
  console.log('\n' + text)
  return outcomes.some(({ code }) => code !== 0) ? 1 : 0
}

function list() {
  console.log('Personas:')
  for (const [name, persona] of Object.entries(PERSONAS)) console.log(`  ${name.padEnd(10)} ${persona.description}`)
  console.log('\nTargets:')
  for (const name of listTargets()) {
    const target = loadTarget(name)
    console.log(`  ${name} — ${target.url}`)
    for (const journey of target.journeys) console.log(`    ${journey.id.padEnd(24)} ${journey.title ?? ''}`)
  }
}

const options = parseArgs(process.argv.slice(2))
if (options.command === 'list') list()
else if (options.command === 'run' && options.targetName) process.exitCode = (await run(options)).code
else if (options.command === 'replay') process.exitCode = await replay(options)
else {
  console.error(
    [
      'Usage: node lab/scripts/lab.mjs list',
      '       node lab/scripts/lab.mjs run <target> [--personas a,b] [--journeys id,…] [--repeat N] [--steps file.json] [--aria] [--no-axe] [--record]',
      '       node lab/scripts/lab.mjs replay [--targets a,b] [--repeat N]     every target, recorded in lab/runs/ (repeat defaults to 2)',
    ].join('\n'),
  )
  process.exitCode = 2
}
