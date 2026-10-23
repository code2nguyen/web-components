import { expect, test } from '@playwright/test'
import { cellMatches, countMatches, findPattern, markPieces } from '../src/log-find'
import { textLayout } from '../src/log-position'

const measure = (text: string) => text.length * 8

test('the query is literal, case-insensitive unless asked, and an empty query finds nothing', () => {
  expect(findPattern('', false)).toBeNull()
  const pattern = findPattern('a.b(c', false)!
  expect('A.B(C x axb(c'.match(pattern)).toEqual(['A.B(C'])
  expect('A.B(C a.b(c'.match(findPattern('a.b(c', true)!)).toEqual(['a.b(c'])
})

test('matches are counted and listed in reading order across cells and logical lines', () => {
  const cells = [textLayout('error', 100, measure, false), textLayout('an error\nanother Error, error', 100, measure, false)]
  const pattern = findPattern('error', false)!
  expect(countMatches(cells, pattern)).toBe(4)
  expect(cellMatches(cells, pattern)).toEqual([
    { cell: 0, line: 0, start: 0, end: 5 },
    { cell: 1, line: 0, start: 3, end: 8 },
    { cell: 1, line: 1, start: 8, end: 13 },
    { cell: 1, line: 1, start: 15, end: 20 },
  ])
  // Tabs are expanded before matching, as they are drawn.
  expect(cellMatches([textLayout('a\terror', 100, measure, false)], pattern)).toEqual([{ cell: 0, line: 0, start: 5, end: 10 }])
})

test('marks cut pieces at their edges, keep token kinds and leave line breaks alone', () => {
  const pieces = [
    { text: 'GET ', line: 0, start: 0 },
    { text: '"/a"', kind: 'value' as const, line: 0, start: 4 },
    { text: '\n' },
    { text: 'ERROR', kind: 'error' as const, line: 1, start: 0 },
  ]
  const marked = markPieces(pieces, [
    { line: 0, start: 2, end: 6, current: false },
    { line: 1, start: 0, end: 3, current: true },
  ])
  expect(marked.map((piece) => [piece.text, piece.kind ?? '', piece.mark ?? ''])).toEqual([
    ['GE', '', ''],
    ['T ', '', 'match'],
    ['"/', 'value', 'match'],
    ['a"', 'value', ''],
    ['\n', '', ''],
    ['ERR', 'error', 'current'],
    ['OR', 'error', ''],
  ])
  expect(markPieces(pieces, [])).toBe(pieces)
})
