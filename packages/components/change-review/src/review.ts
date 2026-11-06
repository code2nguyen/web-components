/**
 * The hunks of a change review and the text a set of decisions produces. Pure functions over the line diff of
 * `@c2n/diff-viewer`, with no DOM, so they run on the server and in tests.
 */
import { diffLines, type DiffLine } from '@c2n/diff-viewer'

/** What the reviewer said about a hunk; `null` while it is still open. */
export type ReviewDecision = 'accepted' | 'rejected' | null

/** One run of changed lines and the unchanged lines shown around it. */
export interface ReviewHunk {
  /** 0-based position among the hunks. */
  index: number
  /** Unchanged lines shown before the change. */
  before: DiffLine[]
  /** The removed lines, in order. */
  removed: DiffLine[]
  /** The added lines, in order. */
  added: DiffLine[]
  /** Unchanged lines shown after the change. */
  after: DiffLine[]
  /** First and last line of the change in the original text (1-based), or the line it follows when nothing was removed. */
  originalStart: number
  originalEnd: number
  /** First and last line of the change in the modified text (1-based), or the line it follows when nothing was added. */
  modifiedStart: number
  modifiedEnd: number
}

/** A row of the review: a hunk, or a run of unchanged lines that is not shown. */
export type ReviewRow = { kind: 'hunk'; hunk: ReviewHunk } | { kind: 'gap'; count: number }

/** The review of two texts: its hunks, the rows to draw, and the diff they come from. */
export interface Review {
  hunks: ReviewHunk[]
  rows: ReviewRow[]
  lines: DiffLine[]
}

/**
 * Splits the line diff of `original` and `modified` into hunks: each run of changed lines is one hunk, with up to
 * `context` unchanged lines on each side. Two hunks never share a context line: the lines between them go to the
 * first one's tail, then to the second one's head, and what is left becomes a gap row.
 */
export function reviewHunks(original: string, modified: string, context = 3): Review {
  const lines = diffLines(original, modified)
  const keep = Math.max(0, Math.floor(Number.isFinite(context) ? context : 3))
  const runs: { start: number; end: number }[] = []
  for (let i = 0; i < lines.length;) {
    if (lines[i].type === 'equal') {
      i++
      continue
    }
    const start = i
    while (i < lines.length && lines[i].type !== 'equal') i++
    runs.push({ start, end: i })
  }
  const hunks: ReviewHunk[] = []
  const rows: ReviewRow[] = []
  let cursor = 0
  runs.forEach((run, index) => {
    const nextStart = index + 1 < runs.length ? runs[index + 1].start : lines.length
    const beforeCount = Math.min(keep, run.start - cursor)
    const gap = run.start - cursor - beforeCount
    if (gap > 0) rows.push({ kind: 'gap', count: gap })
    const afterCount = Math.min(keep, nextStart - run.end)
    const change = lines.slice(run.start, run.end)
    const removed = change.filter((line) => line.type === 'delete')
    const added = change.filter((line) => line.type === 'insert')
    const previous = lines[run.start - 1]
    const lastOriginal = previous?.originalNumber ?? 0
    const lastModified = previous?.modifiedNumber ?? 0
    const hunk: ReviewHunk = {
      index,
      before: lines.slice(run.start - beforeCount, run.start),
      removed,
      added,
      after: lines.slice(run.end, run.end + afterCount),
      originalStart: removed[0]?.originalNumber ?? lastOriginal,
      originalEnd: removed[removed.length - 1]?.originalNumber ?? lastOriginal,
      modifiedStart: added[0]?.modifiedNumber ?? lastModified,
      modifiedEnd: added[added.length - 1]?.modifiedNumber ?? lastModified,
    }
    hunks.push(hunk)
    rows.push({ kind: 'hunk', hunk })
    cursor = run.end + afterCount
  })
  if (runs.length && lines.length - cursor > 0) rows.push({ kind: 'gap', count: lines.length - cursor })
  return { hunks, rows, lines }
}

/**
 * The text the decisions produce: unchanged lines as they are, an accepted hunk's added lines, a rejected hunk's
 * removed lines. `undecided` says which side an open hunk keeps. Line breaks come out as `\n`; the text ends with a
 * line break unless its last line had none.
 */
export function applyDecisions(review: Review, decisions: readonly ReviewDecision[], undecided: 'original' | 'modified' = 'original'): string {
  const out: DiffLine[] = []
  let hunk = -1
  let inRun = false
  for (const line of review.lines) {
    if (line.type === 'equal') {
      inRun = false
      out.push(line)
      continue
    }
    if (!inRun) {
      inRun = true
      hunk++
    }
    const decision = decisions[hunk] ?? null
    const takeModified = decision === 'accepted' || (decision === null && undecided === 'modified')
    if ((takeModified && line.type === 'insert') || (!takeModified && line.type === 'delete')) out.push(line)
  }
  if (!out.length) return ''
  return out.map((line) => line.text).join('\n') + (out[out.length - 1].noNewline ? '' : '\n')
}
