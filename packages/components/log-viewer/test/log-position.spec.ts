import { expect, test } from '@playwright/test'
import { LineIndex, textLines } from '../src/log-position'

test('binary lookup handles different heights and exact boundaries', () => {
  const index = new LineIndex()
  ;[20, 100, 40].forEach((height) => index.append(height))
  expect(index.offsets).toEqual([0, 20, 120, 160])
  expect([0, 19, 20, 119, 120, 160].map((offset) => index.at(offset))).toEqual([0, 0, 1, 1, 2, 2])
  expect(new LineIndex().at(0)).toBe(0)
})

test('text layout preserves newlines, empty lines and unicode, and uses measured glyph widths', () => {
  const measure = (text: string) => [...text].reduce((width, glyph) => width + (glyph === 'W' ? 2 : 1), 0)
  expect(textLines('WWii\n\n🙂x', 3, measure, true)).toEqual(['W', 'Wi', 'i', '', '🙂x'])
  expect(textLines('a\r\nb\t\n', 20, measure, false)).toEqual(['a', 'b    ', ''])
  expect(textLines('long', 1, measure, false)).toEqual(['long'])
})
