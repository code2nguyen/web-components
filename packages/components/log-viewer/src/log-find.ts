import type { TextLayout } from './log-position.js'
import type { LogPiece } from './log-tokens.js'

/** One occurrence of the find query: the cell it is in, its logical line there and its UTF-16 range on that line. */
export interface FindMatch {
  cell: number
  line: number
  start: number
  end: number
}

export interface FindMark {
  line: number
  start: number
  end: number
  current: boolean
}

export type MarkedPiece = LogPiece & { mark?: 'match' | 'current' }

/** A literal, non-overlapping pattern for the query; null when there is nothing to find. */
export function findPattern(query: string, matchCase: boolean): RegExp | null {
  if (!query) return null
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu')
}

/** Matches in reading order: cell by cell, then line by line. */
export function cellMatches(cells: readonly TextLayout[], pattern: RegExp): FindMatch[] {
  const matches: FindMatch[] = []
  cells.forEach((cell, index) =>
    cell.logicalLines.forEach((text, line) => {
      pattern.lastIndex = 0
      for (let match = pattern.exec(text); match; match = pattern.exec(text))
        matches.push({ cell: index, line, start: match.index, end: match.index + match[0].length })
    }),
  )
  return matches
}

/** The number of matches, without collecting them: this runs over every displayed entry on each query. */
export function countMatches(cells: readonly TextLayout[], pattern: RegExp): number {
  let count = 0
  for (const cell of cells)
    for (const text of cell.logicalLines) {
      pattern.lastIndex = 0
      while (pattern.exec(text)) count++
    }
  return count
}

/** Cuts visual-line pieces at the edges of the marks on their logical line; a piece keeps its token kind. */
export function markPieces(pieces: readonly LogPiece[], marks: readonly FindMark[]): MarkedPiece[] {
  if (!marks.length) return pieces as MarkedPiece[]
  const result: MarkedPiece[] = []
  for (const piece of pieces) {
    if (piece.line === undefined || piece.start === undefined) {
      result.push(piece)
      continue
    }
    const from = piece.start
    const to = from + piece.text.length
    let cursor = from
    for (const mark of marks) {
      if (mark.line !== piece.line) continue
      const start = Math.max(mark.start, cursor)
      const end = Math.min(mark.end, to)
      if (end <= start) continue
      if (start > cursor) result.push({ ...piece, text: piece.text.slice(cursor - from, start - from), start: cursor })
      result.push({ ...piece, text: piece.text.slice(start - from, end - from), start, mark: mark.current ? 'current' : 'match' })
      cursor = end
    }
    if (cursor === from) result.push(piece)
    else if (cursor < to) result.push({ ...piece, text: piece.text.slice(cursor - from), start: cursor })
  }
  return result
}
