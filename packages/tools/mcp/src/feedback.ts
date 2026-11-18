/**
 * `report_issue`: drafts a GitHub issue for a problem a developer hit while building with c2n components (a bug, a
 * gap, a workaround they had to write), for the developer to review and submit. Nothing is ever submitted from here:
 * the draft comes back as text and as a link that opens the repository's issue form already filled in.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from './lib/validate.ts'

export const FEEDBACK_REPO = 'code2nguyen/web-components'
export const FEEDBACK_TEMPLATE = 'component-feedback.yml'
export const FEEDBACK_LABEL = 'component-feedback'

export const FEEDBACK_KINDS = ['bug', 'gap', 'papercut', 'docs'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

/** The issue form's dropdown options, which a pre-filled link must match exactly. */
const KIND_OPTIONS: Record<FeedbackKind, string> = {
  bug: 'bug: wrong behaviour',
  gap: 'gap: documented or implied, but not implemented',
  papercut: 'papercut: works, but the common case is hard',
  docs: 'docs: the component is right, the documentation or MCP answer is not',
}

/**
 * GitHub answers a longer issue link with an error page. The text fields are cut to fit, longest first, and the draft
 * says so: the developer pastes the full text from the draft instead.
 */
export const MAX_URL_LENGTH = 7000
const MIN_KEPT = 200
const CUT_NOTE = '\n\n[…cut to fit the link: paste the rest from the draft]'

export interface FeedbackInput {
  /** The element or package: `c2-table`, `table`, `@c2n/table`. */
  component: string
  kind: FeedbackKind
  /** One line: what is wrong, without the component name (it is prefixed). */
  title: string
  building: string
  expected: string
  actual: string
  workaround?: string
  repro?: string
}

export interface FeedbackEnvironment {
  /** The tag the component resolved to (`c2-table`), or the input as given when it did not resolve. */
  tag: string
  /** The installed version of the package the project imports, when it is installed. */
  version?: string
  /** The package that version belongs to: `@c2n/components` or `@c2n/<name>`. */
  versionOf?: string
  /** The c2n version the MCP registry describes. */
  registryVersion: string
  framework?: string
}

export interface FeedbackDraft {
  title: string
  body: string
  url: string
  /** Fields cut to keep `url` under `MAX_URL_LENGTH`. */
  shortened: string[]
}

/** The project's UI framework, read from its `package.json` dependencies: the first match wins (Next.js before React). */
export function detectFramework(root: string): string | undefined {
  const path = join(root, 'package.json')
  if (!existsSync(path)) return undefined
  let deps: Record<string, string>
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, string> | undefined>
    deps = { ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.dependencies }
  } catch {
    return undefined
  }
  const known: [string, string][] = [
    ['next', 'Next.js'],
    ['@sveltejs/kit', 'SvelteKit'],
    ['nuxt', 'Nuxt'],
    ['astro', 'Astro'],
    ['@angular/core', 'Angular'],
    ['react', 'React'],
    ['vue', 'Vue'],
    ['svelte', 'Svelte'],
    ['lit', 'Lit'],
  ]
  for (const [name, label] of known) {
    const range = deps[name]
    if (range) {
      const major = /(\d+)/.exec(range)?.[1]
      return major ? `${label} ${major}` : label
    }
  }
  return undefined
}

/** Whether `a` is an older version than `b` (`1.0.9` < `1.0.27`); pre-release tags are ignored. */
export function olderVersion(a: string, b: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/[-+].*$/, '')
      .split('.')
      .map(Number)
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const [p, q] = [x[i] ?? 0, y[i] ?? 0]
    if (p !== q) return p < q
  }
  return false
}

function section(heading: string, value: string | undefined) {
  return value?.trim() ? `### ${heading}\n\n${value.trim()}\n` : ''
}

function issueTitle(tag: string, title: string) {
  const text = title.trim().replace(/\s+/g, ' ')
  return text.toLowerCase().startsWith(tag.toLowerCase()) ? text : `${tag}: ${text}`
}

/** The issue text and the link that opens the issue form with every field filled in. */
export function buildIssueDraft(input: FeedbackInput, env: FeedbackEnvironment): FeedbackDraft {
  const title = issueTitle(env.tag, input.title)
  const version = env.version ? `${env.version}${env.versionOf ? ` (${env.versionOf})` : ''}` : 'not installed in this project'
  const body = [
    section('Component', `\`${env.tag}\``),
    section('Kind', KIND_OPTIONS[input.kind]),
    section('Version', version),
    section('Framework', env.framework ?? 'not detected'),
    section('What you were building', input.building),
    section('Expected', input.expected),
    section('What happened', input.actual),
    section('Workaround', input.workaround),
    input.repro?.trim() ? `### Minimal reproduction\n\n\`\`\`html\n${input.repro.trim()}\n\`\`\`\n` : '',
    '---\n_Drafted by a coding agent with the c2n MCP server (`report_issue`), reviewed by the developer before submitting._',
  ]
    .filter(Boolean)
    .join('\n')

  // Every field of the form, as the link pre-fills it. The checkbox cannot be pre-filled; the body says it instead.
  const fields: Record<string, string> = {
    component: env.tag,
    kind: KIND_OPTIONS[input.kind],
    version: env.version ?? '',
    framework: env.framework ?? '',
    building: input.building.trim(),
    expected: input.expected.trim(),
    actual: input.actual.trim(),
    workaround: input.workaround?.trim() ?? '',
    repro: input.repro?.trim() ?? '',
  }
  const link = () => {
    const params = new URLSearchParams({ template: FEEDBACK_TEMPLATE, title, labels: FEEDBACK_LABEL })
    for (const [key, value] of Object.entries(fields)) if (value) params.set(key, value)
    return `https://github.com/${FEEDBACK_REPO}/issues/new?${params.toString()}`
  }
  const shortened: string[] = []
  const kept: Record<string, string> = {}
  let url = link()
  const cuttable = ['repro', 'workaround', 'actual', 'expected', 'building']
  while (url.length > MAX_URL_LENGTH) {
    const longest = cuttable
      .filter((key) => (kept[key] ?? fields[key]).length > MIN_KEPT)
      .sort((a, b) => (kept[b] ?? fields[b]).length - (kept[a] ?? fields[a]).length)[0]
    if (!longest) break
    const text = kept[longest] ?? fields[longest]
    // A character encodes to one to nine in the link: cutting by the excess (plus the note) always shortens it, and
    // by half of it at least halves the overshoot when the text encodes long.
    const over = url.length - MAX_URL_LENGTH
    kept[longest] = text.slice(0, Math.max(MIN_KEPT, text.length - Math.max(Math.ceil(over / 3), CUT_NOTE.length) - CUT_NOTE.length)).trimEnd()
    fields[longest] = `${kept[longest]}${CUT_NOTE}`
    if (!shortened.includes(longest)) shortened.push(longest)
    url = link()
  }
  return { title, body, url, shortened }
}

export interface DuplicateIssue {
  number: number
  title: string
  url: string
  state: string
}

/** Where a developer can look for an existing report themselves, when the search below is not available. */
export function issueSearchUrl(tag: string): string {
  const q = `is:issue ${tag}`
  return `https://github.com/${FEEDBACK_REPO}/issues?${new URLSearchParams({ q }).toString()}`
}

/**
 * Open and closed issues that mention the tag, newest first, through GitHub's search API (unauthenticated: a few
 * searches a minute). Resolves to `undefined` when the search could not be made (offline, rate limited), never throws.
 */
export async function findDuplicates(tag: string, title: string, timeoutMs = 4000): Promise<DuplicateIssue[] | undefined> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 4)
  const search = async (q: string) => {
    const response = await fetch(`https://api.github.com/search/issues?${new URLSearchParams({ q, per_page: '5' }).toString()}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'c2n-mcp' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`GitHub search answered ${response.status}`)
    const data = (await response.json()) as { items?: { number: number; title: string; html_url: string; state: string; pull_request?: unknown }[] }
    return (data.items ?? [])
      .filter((item) => !item.pull_request)
      .map((item) => ({ number: item.number, title: item.title, url: item.html_url, state: item.state }))
  }
  try {
    const base = `repo:${FEEDBACK_REPO} is:issue "${tag}"`
    // The tag with the title's words first; the tag alone when that finds nothing.
    const precise = words.length ? await search(`${base} ${words.join(' ')}`) : []
    return precise.length ? precise : await search(base)
  } catch {
    return undefined
  }
}

export interface FeedbackReport {
  draft: FeedbackDraft
  env: FeedbackEnvironment
  /** `undefined`: the search was skipped or failed. */
  duplicates?: DuplicateIssue[]
  /** `validate_markup` findings on the reproduction: an error there may be the cause rather than the component. */
  reproFindings: Finding[]
  /** The component did not resolve to a c2n element. */
  unknownComponent: boolean
}

export function renderFeedbackReport(report: FeedbackReport): string {
  const { draft, env, duplicates, reproFindings } = report
  const out: string[] = []
  if (report.unknownComponent) {
    out.push(`> **Check the component name:** \`${env.tag}\` is not a c2n element or package. Use \`search_components\` to find its tag.\n`)
  }
  const errors = reproFindings.filter((finding) => finding.severity === 'error')
  if (errors.length) {
    out.push(
      `> **Check the reproduction first:** \`validate_markup\` reports ${errors.length} error(s) in it, which may be the cause rather than the component:\n` +
        errors.map((finding) => `> - line ${finding.line}: ${finding.message}`).join('\n') +
        '\n',
    )
  }
  if (env.version && olderVersion(env.version, env.registryVersion)) {
    out.push(
      `> **Newer release available:** the project has ${env.version}; c2n ${env.registryVersion} is out. Check whether the problem still happens there before reporting it.\n`,
    )
  }
  if (duplicates?.length) {
    out.push(
      `**Existing issues that may be the same** (add to one of them instead of opening another):\n\n${duplicates
        .map((issue) => `- #${issue.number} [${issue.state}] ${issue.title}: ${issue.url}`)
        .join('\n')}\n`,
    )
  } else if (duplicates === undefined) {
    out.push(`Existing issues were not searched. Look for one first: ${issueSearchUrl(env.tag)}\n`)
  } else {
    out.push('No existing issue mentions this component with these words.\n')
  }
  out.push(
    '**Show this draft to the developer.** Do not submit it yourself: they open the link, review the form (remove anything private) and submit it.',
    '',
    `Open the pre-filled issue form: ${draft.url}`,
  )
  if (draft.shortened.length) out.push('', `The link cut ${draft.shortened.join(', ')} to fit; the full text is in the draft below.`)
  out.push(
    '',
    `If the developer prefers the GitHub CLI and asks you to, save the body below to a file and run: \`gh issue create --repo ${FEEDBACK_REPO} --label ${FEEDBACK_LABEL} --title ${JSON.stringify(draft.title)} --body-file <file>\``,
    '',
    `## ${draft.title}`,
    '',
    draft.body,
  )
  return out.join('\n')
}
