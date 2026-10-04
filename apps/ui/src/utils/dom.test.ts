import assert from 'node:assert/strict'
import test from 'node:test'

import { arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { groupByConverter, sortModelConverter } from '@c2n/components/table'

import { getElemenetProperty, isDataAttribute } from './dom.ts'

/** Stands in for a Lit element: just the `elementProperties` map the helpers read off the class. */
function fakeElement(declarations: Record<string, object>, values: Record<string, unknown>): HTMLElement {
  class Fake {
    static elementProperties = new Map(Object.entries(declarations))
  }
  return Object.assign(new Fake(), values) as unknown as HTMLElement
}

const rows = [
  { id: '1', name: 'Ada Lovelace', score: 128000 },
  { id: '2', name: 'Grace Hopper', score: 96500 },
]

const table = fakeElement(
  {
    rows: { converter: jsonPropertyConverter },
    value: { converter: arrayPropertyConverter },
    sortModel: { converter: sortModelConverter, attribute: 'sort' },
    groupBy: { converter: groupByConverter, attribute: 'group-by' },
    rowKey: { type: String, attribute: 'row-key' },
    pageSize: { type: Number, attribute: 'page-size' },
  },
  { rows, value: ['1', '2'], sortModel: [{ field: 'score', direction: 'desc' }], groupBy: [{ field: 'team' }], rowKey: 'id', pageSize: 25 },
)

test('serializes JSON data with its own converter instead of joining records with ";"', () => {
  assert.equal(getElemenetProperty(table, 'rows'), JSON.stringify(rows))
})

test('keeps the list and custom converters of non-data attributes', () => {
  assert.equal(getElemenetProperty(table, 'value'), '1;2')
  assert.equal(getElemenetProperty(table, 'sort'), 'score:desc')
  assert.equal(getElemenetProperty(table, 'row-key'), 'id')
  assert.equal(getElemenetProperty(table, 'page-size'), '25')
})

test('leaves a value with no attribute form absent so the sync never overwrites it', () => {
  assert.equal(getElemenetProperty(table, 'group-by'), undefined)
})

test('flags only JSON-converted attributes as data', () => {
  assert.equal(isDataAttribute(table, 'rows'), true)
  for (const name of ['value', 'sort', 'group-by', 'row-key', 'page-size', 'missing']) assert.equal(isDataAttribute(table, name), false, name)
})
