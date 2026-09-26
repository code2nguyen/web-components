import { expect, test } from '@playwright/test'
import { entryColumns, matchesFilter, validateEntries, validateFilter } from '../src/log-model'

test('snapshots arbitrary text attributes and rejects invalid batches atomically', () => {
  const input = { message: '<unsafe>', requestId: '42', source: 'api' }
  const entries = validateEntries(input)
  input.requestId = 'changed'
  expect(entries[0].requestId).toBe('42')
  expect(() => validateEntries([{ message: 'okay' }, { message: 'bad', duration: 4 } as never])).toThrow(TypeError)
  expect(() => validateEntries({ level: 'info' } as never)).toThrow(TypeError)
  expect(entryColumns(entries)).toEqual(['source', 'requestId', 'message'])
})

test('attribute OR, attribute AND and full text search use independent snapshots', () => {
  const input = { attributes: { level: ['error', 'warn'], source: 'api' }, search: 'REQUEST' }
  const filter = validateFilter(input)
  input.attributes.level.push('info')
  expect(matchesFilter({ message: 'Request failed', level: 'error', source: 'api' }, filter)).toBe(true)
  expect(matchesFilter({ message: 'Request okay', level: 'info', source: 'api' }, filter)).toBe(false)
  expect(matchesFilter({ message: 'Request failed', level: 'error', source: 'worker' }, filter)).toBe(false)
  expect(matchesFilter({ message: 'okay', requestId: 'Request 42' }, { search: 'request' })).toBe(true)
  expect(matchesFilter({ message: 'x' }, { attributes: { absent: 'x' } })).toBe(false)
  expect(matchesFilter({ message: 'x' }, null)).toBe(true)
  expect(matchesFilter({ message: 'x' }, { attributes: { absent: [''] } })).toBe(false)
  expect(matchesFilter({ message: 'x' }, { attributes: { constructor: ['Object'] } })).toBe(false)
  expect(() => validateFilter({ attributes: { source: [4] } } as never)).toThrow(TypeError)
})
