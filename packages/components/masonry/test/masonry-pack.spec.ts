import { test, expect } from '@playwright/test'
import { packMasonry } from '../src/masonry-pack'
import { rangeForWidth, reconcileSnapshot, resolveColumns, validateSnapshot } from '../src/masonry-model'

test('uses first available rectangle in row-major order', () => {
  const result = packMasonry(
    [
      { id: 'a', columnSpan: 2, rowSpan: 2 },
      { id: 'b', columnSpan: 1, rowSpan: 1 },
      { id: 'c', columnSpan: 2, rowSpan: 1 },
    ],
    3,
  )
  expect(result.placements).toEqual([
    { id: 'a', columnStart: 0, rowStart: 0, columnSpan: 2, rowSpan: 2 },
    { id: 'b', columnStart: 2, rowStart: 0, columnSpan: 1, rowSpan: 1 },
    { id: 'c', columnStart: 0, rowStart: 2, columnSpan: 2, rowSpan: 1 },
  ])
  expect(result.usedRows).toBe(3)
})

test('mixed shapes are deterministic, bounded, and non-overlapping', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), columnSpan: 1 + (i % 3), rowSpan: 1 + (i % 4) }))
  const first = packMasonry(items, 6)
  expect(packMasonry(items, 6)).toEqual(first)
  const cells = new Set<string>()
  for (const placement of first.placements) {
    expect(placement.columnStart + placement.columnSpan).toBeLessThanOrEqual(6)
    for (let row = placement.rowStart; row < placement.rowStart + placement.rowSpan; row++) {
      for (let column = placement.columnStart; column < placement.columnStart + placement.columnSpan; column++) {
        const key = `${column}:${row}`
        expect(cells.has(key)).toBe(false)
        cells.add(key)
      }
    }
  }
  expect(
    packMasonry(
      items.filter((item) => item.id !== '0'),
      6,
    ).placements[0].rowStart,
  ).toBe(0)
  expect(packMasonry([], 6)).toEqual({ placements: [], usedRows: 0 })
})

test('normalizes invalid spans before placement', () => {
  const result = packMasonry([{ id: 'bad', columnSpan: Number.NaN, rowSpan: -4 }], 3)
  expect(result.placements[0]).toMatchObject({ columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1 })
})

test('uses container-width range boundaries and independent column overrides', () => {
  expect(rangeForWidth(599)).toEqual({ range: 'xs', columns: 1 })
  expect(rangeForWidth(600)).toEqual({ range: 'sm', columns: 6 })
  expect(rangeForWidth(959.99)).toEqual({ range: 'sm', columns: 6 })
  expect(rangeForWidth(960)).toEqual({ range: 'md', columns: 9 })
  expect(rangeForWidth(1279.99)).toEqual({ range: 'md', columns: 9 })
  expect(rangeForWidth(1280)).toEqual({ range: 'lg', columns: 12 })
  const spans = { cols: 3, colsXs: 1, colsSm: 4, colsMd: undefined, colsLg: 15 }
  expect(resolveColumns(spans, 'sm', 6)).toBe(4)
  expect(resolveColumns(spans, 'md', 9)).toBe(3)
  expect(resolveColumns(spans, 'lg', 12)).toBe(12)
  expect(spans.colsLg).toBe(15)
})

test('validates complete versioned snapshots atomically', () => {
  const valid = { version: 1, items: [{ id: 'alpha', rows: 2, columns: { xs: 1, sm: 4, md: 5, lg: 6 } }] }
  expect(validateSnapshot(valid)).toBe(true)
  expect(validateSnapshot({ ...valid, items: [{ ...valid.items[0], rows: 0 }] })).toBe(false)
  expect(validateSnapshot({ ...valid, items: [...valid.items, valid.items[0]] })).toBe(false)
  expect(validateSnapshot({ ...valid, items: [{ ...valid.items[0], columns: { ...valid.items[0].columns, sm: 7 } }] })).toBe(false)
  expect(validateSnapshot({ ...valid, items: [{ ...valid.items[0], columns: { ...valid.items[0].columns, xs: 2 } }] })).toBe(false)
})

test('reconciles saved order with added and removed authored tiles', () => {
  const columns = { xs: 1, sm: 2, md: 3, lg: 4 }
  const authored = { version: 1 as const, items: ['a', 'b', 'c'].map((id) => ({ id, rows: 3, columns })) }
  const saved = { version: 1 as const, items: ['b', 'a', 'removed'].map((id) => ({ id, rows: 5, columns })) }
  const result = reconcileSnapshot(authored, saved)
  expect(result.items.map((item) => item.id)).toEqual(['b', 'a', 'c'])
  expect(result.items.map((item) => item.rows)).toEqual([5, 5, 3])
  expect(saved.items.map((item) => item.id)).toEqual(['b', 'a', 'removed'])
})
