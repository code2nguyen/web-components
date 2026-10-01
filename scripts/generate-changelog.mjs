/**
 * Generates the changelog from git history. Two outputs, both committed:
 *
 *   - `CHANGELOG.md`                          — every release, every user-facing change.
 *   - `apps/ui/src/data/changelog.json`       — the same releases as data, which the docs site's /changelog page
 *                                               trims to a short summary.
 *
 * Releases are delimited by the `chore(release): publish v<version>` commits the Release workflow lands on the
 * source branch, not by tags: tags may point at a repaired commit off the branch, and a shallow clone has none.
 * A commit belongs to the first release whose version commit can reach it.
 *
 * Only released history is written, so the output is a pure function of the history and stays stable between
 * releases. The Release workflow runs `npm run changelog -- --next <version>` before committing the version, which
 * files everything since the last release under the version being cut.
 *
 * Commits are read as Conventional Commits (`feat(table): …`). Housekeeping types (chore, ci, test, …) are dropped.
 * Older free-form subjects are kept when they read as a sentence ("Add c2-banner component") and classified by their
 * first word; one-word subjects such as "update" or "wip" are noise and dropped.
 *
 *   node scripts/generate-changelog.mjs [--next <version>] [--date YYYY-MM-DD] [--check]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import * as prettier from 'prettier'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const MARKDOWN_PATH = 'CHANGELOG.md'
const JSON_PATH = 'apps/ui/src/data/changelog.json'
const REPO_URL = 'https://github.com/code2nguyen/web-components'
const RELEASE_SUBJECT = /^chore\(release\): publish v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/

/** Section order and headings. `site` covers the docs site and example apps, which the site itself leaves out. */
export const SECTIONS = [
  { type: 'breaking', title: 'Breaking changes' },
  { type: 'feat', title: 'Features' },
  { type: 'fix', title: 'Fixes' },
  { type: 'perf', title: 'Performance' },
  { type: 'improve', title: 'Improvements' },
  { type: 'site', title: 'Docs site & examples' },
]

const KEPT_TYPES = new Map([
  ['feat', 'feat'],
  ['fix', 'fix'],
  ['perf', 'perf'],
  ['revert', 'improve'],
])
const SITE_SCOPES = new Set(['ui', 'docs', 'demo', 'examples', 'gallery', 'nextjs', 'site'])
// Scopes that only concern the repository's own tooling.
const INTERNAL_SCOPES = new Set(['ci', 'release', 'deps', 'test'])
const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:\s*(?<text>.+)$/
const NOISE = /^(wip|stash|merge|update[ds]?|updating|upate|testing|clean|prepare|tmp|temp)\b/i

/**
 * Turns one commit into a changelog entry, or `null` when it is housekeeping.
 * @param {{ hash: string, subject: string, body?: string }} commit
 */
export function parseCommit({ hash, subject, body = '' }) {
  subject = subject.trim()
  if (RELEASE_SUBJECT.test(subject)) return null
  const breaking = /^BREAKING[ -]CHANGE:/m.test(body)
  const match = CONVENTIONAL.exec(subject)
  let type, scopes, text
  if (match) {
    const kept = KEPT_TYPES.get(match.groups.type)
    if (!kept && !breaking && !match.groups.bang) return null
    type = kept ?? 'improve'
    scopes = (match.groups.scope ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
    text = match.groups.text
    if (match.groups.bang || breaking) type = 'breaking'
  } else {
    // Free-form subject: keep it only when it reads as a sentence that starts with a capital.
    if (NOISE.test(subject) || !/^[A-Z]/.test(subject) || subject.split(/\s+/).length < 3) return null
    type = /^Fix(es|ed)?\b/.test(subject) ? 'fix' : /^(Add|Adds|Added|Introduce|Implement)\b/.test(subject) ? 'feat' : 'improve'
    scopes = [...new Set([...subject.matchAll(/\bc2-([a-z][a-z0-9-]*)/g)].map((m) => m[1]))].slice(0, 2)
    text = subject
  }
  if (type !== 'breaking' && scopes.length > 0) {
    if (scopes.every((scope) => INTERNAL_SCOPES.has(scope))) return null
    if (scopes.every((scope) => SITE_SCOPES.has(scope))) type = 'site'
  }
  text = text.replace(/\s*\(#\d+\)$/, '').replace(/\.$/, '')
  // Capitalise the sentence, but not a leading file or package name (`llms.txt`, `vue.d.ts`).
  if (!/^\S*[./@]/.test(text)) text = text.charAt(0).toUpperCase() + text.slice(1)
  return { type, scopes, text, hash: hash.slice(0, 7) }
}

/**
 * Groups entries into the `SECTIONS` order, dropping duplicates (the same change often lands as a commit and again
 * in a follow-up with the same subject).
 */
export function groupEntries(entries) {
  const seen = new Set()
  const sections = []
  for (const { type, title } of SECTIONS) {
    const items = []
    for (const entry of entries) {
      const key = entry.text.toLowerCase()
      if (entry.type !== type || seen.has(key)) continue
      seen.add(key)
      items.push({ scopes: entry.scopes, text: entry.text, hash: entry.hash })
    }
    if (items.length > 0) sections.push({ type, title, items })
  }
  return sections
}

export function renderMarkdown(releases) {
  const lines = [
    '# Changelog',
    '',
    'All `@c2n/*` packages are versioned together. This file is generated from the commit history by',
    '`npm run changelog` — do not edit it by hand.',
    '',
  ]
  for (const release of releases) {
    lines.push(`## [${release.version}](${REPO_URL}/releases/tag/v${release.version}) — ${release.date}`, '')
    if (release.sections.length === 0) lines.push('_Maintenance release._', '')
    for (const section of release.sections) {
      lines.push(`### ${section.title}`, '')
      for (const item of section.items) {
        const scope = item.scopes.length > 0 ? `**${item.scopes.join(', ')}:** ` : ''
        lines.push(`- ${scope}${item.text} ([${item.hash}](${REPO_URL}/commit/${item.hash}))`)
      }
      lines.push('')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Release commits, newest first, one per version (a re-run of the workflow can record the same version twice). */
function releaseCommits() {
  const out = git(['log', '--format=%H%x1f%s%x1f%cI', '--extended-regexp', '--grep=^chore\\(release\\): publish v'])
  const byVersion = new Map()
  for (const line of out.split('\n').filter(Boolean)) {
    const [hash, subject, date] = line.split('\x1f')
    const version = RELEASE_SUBJECT.exec(subject)?.[1]
    if (version && !byVersion.has(version)) byVersion.set(version, { version, hash, date: date.slice(0, 10) })
  }
  return [...byVersion.values()]
}

function commitsIn(range) {
  const out = git(['log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', ...range])
  return out
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body] = record.split('\x1f')
      return { hash, subject, body }
    })
}

export function buildReleases({ next, date } = {}) {
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error('The changelog needs the full history: run `git fetch --unshallow` (or check out with fetch-depth: 0).')
  }
  const points = releaseCommits()
  if (next) {
    if (points.some((point) => point.version === next)) throw new Error(`v${next} is already released.`)
    points.unshift({ version: next, hash: 'HEAD', date: date ?? new Date().toISOString().slice(0, 10) })
  }
  return points.map((point, index) => {
    // Everything the version commit reaches that no older version commit does.
    const older = points.slice(index + 1).map((p) => `^${p.hash}`)
    const entries = commitsIn([point.hash, ...older])
      .map(parseCommit)
      .filter(Boolean)
    return { version: point.version, date: point.date, sections: groupEntries(entries) }
  })
}

function parseArgs(argv) {
  const args = { check: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--next') args.next = argv[++i]?.replace(/^v/, '')
    else if (argv[i] === '--date') args.date = argv[++i]
    else if (argv[i] === '--check') args.check = true
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const releases = buildReleases(args)
  const outputs = [
    [MARKDOWN_PATH, renderMarkdown(releases)],
    [JSON_PATH, `${JSON.stringify({ repository: REPO_URL, releases }, null, 2)}\n`],
  ]
  let stale = false
  for (const [path, raw] of outputs) {
    const file = join(repoRoot, path)
    // Written already formatted, so `format:check` and the pre-commit hook leave the files alone.
    const content = await prettier.format(raw, { ...(await prettier.resolveConfig(file)), filepath: file })
    let current = ''
    try {
      current = readFileSync(file, 'utf8')
    } catch {
      // Not generated yet.
    }
    if (current === content) continue
    if (args.check) {
      console.error(`${path} is out of date: run \`npm run changelog\`.`)
      stale = true
    } else {
      writeFileSync(file, content)
      console.log(`Wrote ${path}`)
    }
  }
  if (stale) process.exitCode = 1
  else console.log(`Changelog: ${releases.length} releases, latest v${releases[0]?.version ?? '—'}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
