/**
 * Line diff for `c2-diff-viewer`: Myers' O(ND) algorithm over lines, with the common prefix and suffix trimmed first,
 * then a word diff of each changed line pair. Pure functions, no DOM, so they run on the server and in tests.
 */

/** What happened to a line: kept, added in the modified text, or removed from the original. */
export type DiffLineType = 'equal' | 'insert' | 'delete'

/** A run of a changed line's text: `changed` is true for the words that differ from the line it pairs with. */
export interface DiffSegment {
  text: string
  changed: boolean
}

/** One line of the diff. Numbers are 1-based; a removed line has no `modifiedNumber`, an added one no `originalNumber`. */
export interface DiffLine {
  type: DiffLineType
  text: string
  originalNumber?: number
  modifiedNumber?: number
  /** The line ends its text without a final line break. */
  noNewline?: boolean
  /** Word-level runs, set on a changed line paired with a similar line on the other side. */
  segments?: DiffSegment[]
}

/** Counts of a diff: lines added and lines removed. A changed line counts once in each. */
export interface DiffStats {
  additions: number
  deletions: number
}

/** Past this many edits the middle of the texts is shown as removed then added, so memory stays bounded. */
const MAX_EDITS = 2000

/** A changed line pair whose shared characters are less than this share of both lines (Dice): no word highlights. */
const MIN_WORD_SIMILARITY = 0.4

/** Splits a text into lines. `\r\n` and `\r` count as line breaks; a final break ends the last line, it adds none. */
export function splitLines(text: string): { lines: string[]; finalNewline: boolean } {
  if (text === '') return { lines: [], finalNewline: true }
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const finalNewline = lines[lines.length - 1] === ''
  if (finalNewline) lines.pop()
  return { lines, finalNewline }
}

type Op = 0 | 1 | 2 // equal, delete, insert

/**
 * Shortest edit script between two sequences of ids, as one op per step. Myers' greedy forward pass keeps one
 * snapshot of the diagonal array per edit distance, then walks back from the end.
 */
function myers(a: ArrayLike<number>, b: ArrayLike<number>): Op[] | null {
  const n = a.length
  const m = b.length
  const max = n + m
  if (max === 0) return []
  const offset = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  let found = -1
  for (let d = 0; d <= max && found < 0; d++) {
    if (d > MAX_EDITS) return null
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
    trace.push(v.slice(offset - d, offset + d + 1))
  }
  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const previous = trace[d - 1]
    const at = (k: number) => previous[k + d - 1]
    const k = x - y
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1))
    const previousK = down ? k + 1 : k - 1
    const previousX = at(previousK)
    const previousY = previousX - previousK
    while (x > previousX && y > previousY) {
      ops.push(0)
      x--
      y--
    }
    ops.push(down ? 2 : 1)
    x = previousX
    y = previousY
  }
  while (x > 0 && y > 0) {
    ops.push(0)
    x--
    y--
  }
  return ops.reverse()
}

/** Edit script with the common prefix and suffix trimmed first; falls back to "remove all, add all" past the budget. */
function editScript(a: number[], b: number[]): Op[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const middle = myers(a.slice(start, endA), b.slice(start, endB)) ?? [...Array<Op>(endA - start).fill(1), ...Array<Op>(endB - start).fill(2)]
  return [...Array<Op>(start).fill(0), ...middle, ...Array<Op>(a.length - endA).fill(0)]
}

/** Puts every removal of a change before its additions, keeping their order, the way unified diffs read. */
function groupChanges(ops: Op[]): Op[] {
  const out: Op[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i] === 0) {
      out.push(0)
      i++
      continue
    }
    let deletes = 0
    let inserts = 0
    while (i < ops.length && ops[i] !== 0) {
      if (ops[i] === 1) deletes++
      else inserts++
      i++
    }
    for (let j = 0; j < deletes; j++) out.push(1)
    for (let j = 0; j < inserts; j++) out.push(2)
  }
  return out
}

/** Words, runs of white space and single punctuation marks: what an intra-line highlight marks. */
const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu

function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? []
}

function toIds(tokens: string[], ids: Map<string, number>): number[] {
  return tokens.map((token) => {
    let id = ids.get(token)
    if (id === undefined) {
      id = ids.size
      ids.set(token, id)
    }
    return id
  })
}

function pushSegment(segments: DiffSegment[], text: string, changed: boolean): void {
  const last = segments[segments.length - 1]
  if (last && last.changed === changed) last.text += text
  else segments.push({ text, changed })
}

/**
 * Word diff of a removed line against the added line it pairs with. Returns `null` when the two lines share too
 * little for word highlights to help, so the whole line reads as changed.
 */
export function diffWords(original: string, modified: string): { original: DiffSegment[]; modified: DiffSegment[] } | null {
  const a = tokenize(original)
  const b = tokenize(modified)
  const ids = new Map<string, number>()
  const ops = groupChanges(editScript(toIds(a, ids), toIds(b, ids)))
  const left: DiffSegment[] = []
  const right: DiffSegment[] = []
  let shared = 0
  let i = 0
  let j = 0
  for (const op of ops) {
    if (op === 0) {
      shared += a[i].length
      pushSegment(left, a[i++], false)
      pushSegment(right, b[j++], false)
    } else if (op === 1) pushSegment(left, a[i++], true)
    else pushSegment(right, b[j++], true)
  }
  const total = original.length + modified.length
  if (total === 0 || (2 * shared) / total < MIN_WORD_SIMILARITY) return null
  return { original: bridge(left), modified: bridge(right) }
}

/** Joins two changed runs separated by a single unchanged character (`article.product`), which reads as one change. */
function bridge(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const previous = out[out.length - 1]
    const next = segments[i + 1]
    if (!segment.changed && segment.text.length === 1 && previous?.changed && next?.changed) {
      previous.text += segment.text + next.text
      i++
    } else if (segment.changed && previous?.changed) previous.text += segment.text
    else out.push({ ...segment })
  }
  return out
}

/**
 * Line diff of two texts. Every line of both texts appears once, in reading order: within a change the removed lines
 * come before the added ones, and each removed line is paired with the added line at the same position for word
 * highlights. A last line without a final line break differs from the same text with one, as in `git diff`.
 */
export function diffLines(original: string, modified: string): DiffLine[] {
  const a = splitLines(original)
  const b = splitLines(modified)
  const ids = new Map<string, number>()
  // The last line of a text without a final break gets its own id, so adding the break shows as a change.
  const key = (lines: string[], finalNewline: boolean) => lines.map((line, i) => (i === lines.length - 1 && !finalNewline ? `${line}\n` : line))
  const ops = groupChanges(editScript(toIds(key(a.lines, a.finalNewline), ids), toIds(key(b.lines, b.finalNewline), ids)))
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  const noNewline = (side: typeof a, index: number) => (!side.finalNewline && index === side.lines.length - 1 ? true : undefined)
  for (const op of ops) {
    if (op === 0) {
      lines.push({ type: 'equal', text: a.lines[i], originalNumber: i + 1, modifiedNumber: j + 1, noNewline: noNewline(a, i) })
      i++
      j++
    } else if (op === 1) {
      lines.push({ type: 'delete', text: a.lines[i], originalNumber: i + 1, noNewline: noNewline(a, i) })
      i++
    } else {
      lines.push({ type: 'insert', text: b.lines[j], modifiedNumber: j + 1, noNewline: noNewline(b, j) })
      j++
    }
  }
  for (const line of lines) if (line.noNewline === undefined) delete line.noNewline
  pairWords(lines)
  return lines
}

/** Gives each removed line, and the added line at the same position of its change, word-level segments. */
function pairWords(lines: DiffLine[]): void {
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'delete') {
      i++
      continue
    }
    const deleteStart = i
    while (i < lines.length && lines[i].type === 'delete') i++
    const insertStart = i
    while (i < lines.length && lines[i].type === 'insert') i++
    const pairs = Math.min(insertStart - deleteStart, i - insertStart)
    for (let p = 0; p < pairs; p++) {
      const removed = lines[deleteStart + p]
      const added = lines[insertStart + p]
      if (removed.text === added.text) continue
      const words = diffWords(removed.text, added.text)
      if (!words) continue
      removed.segments = words.original
      added.segments = words.modified
    }
  }
}

/** Lines added and removed in a diff. */
export function diffStats(lines: DiffLine[]): DiffStats {
  let additions = 0
  let deletions = 0
  for (const line of lines) {
    if (line.type === 'insert') additions++
    else if (line.type === 'delete') deletions++
  }
  return { additions, deletions }
}

/** A drawn row: one line, or a run of unchanged lines folded away. */
export type DiffRow = { kind: 'line'; line: DiffLine } | { kind: 'fold'; key: number; lines: DiffLine[] }

/**
 * Folds the unchanged runs of a diff, keeping `context` lines next to each change. A fold always hides at least two
 * lines (one line would take as much room as its fold row). A negative `context` folds nothing; a diff without
 * changes folds everything. `expanded` holds the keys of folds the reader opened.
 */
export function foldLines(lines: DiffLine[], context: number, expanded: ReadonlySet<number> = new Set()): DiffRow[] {
  const rows: DiffRow[] = []
  const keep = Number.isFinite(context) ? Math.floor(context) : -1
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'equal' || keep < 0) {
      rows.push({ kind: 'line', line: lines[i++] })
      continue
    }
    const start = i
    while (i < lines.length && lines[i].type === 'equal') i++
    const run = lines.slice(start, i)
    const before = start > 0 ? keep : 0
    const after = i < lines.length ? keep : 0
    const hidden = run.length - before - after
    const key = run[before]?.originalNumber ?? 0
    if (hidden < 2 || expanded.has(key)) {
      for (const line of run) rows.push({ kind: 'line', line })
      continue
    }
    for (const line of run.slice(0, before)) rows.push({ kind: 'line', line })
    rows.push({ kind: 'fold', key, lines: run.slice(before, before + hidden) })
    for (const line of run.slice(before + hidden)) rows.push({ kind: 'line', line })
  }
  return rows
}
