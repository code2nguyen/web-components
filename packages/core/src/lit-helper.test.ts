import assert from 'node:assert/strict'
import { test } from 'node:test'

import { arrayPropertyConverter, jsonPropertyConverter } from './lit-helper.ts'

test('a list attribute reads as a ;-separated value', () => {
  assert.deepEqual(arrayPropertyConverter.fromAttribute('EUR;USD'), ['EUR', 'USD'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute(''), [])
  assert.deepEqual(arrayPropertyConverter.fromAttribute(null), [])
})

test('a list attribute also reads as a JSON array', () => {
  assert.deepEqual(arrayPropertyConverter.fromAttribute('["EUR","USD"]'), ['EUR', 'USD'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute(' [1, 2] '), ['1', '2'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[]'), [])
  assert.deepEqual(arrayPropertyConverter.fromProperty('["a;b","c"]'), ['a;b', 'c'])
})

test('a value that only looks like JSON is still split on ;', () => {
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[draft];done'), ['[draft]', 'done'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[draft]'), ['[draft]'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[{"a":1}]'), ['[{"a":1}]'])
})

test('a list assigned to the property passes through', () => {
  const list = ['EUR']
  assert.equal(arrayPropertyConverter.fromProperty(list), list)
})

test('a JSON attribute that received a stringified object parses to nothing and warns once', (context) => {
  const warn = context.mock.method(console, 'warn', () => {})
  assert.equal(jsonPropertyConverter.fromAttribute('[object Object]'), undefined)
  assert.equal(jsonPropertyConverter.fromProperty('[object Object]'), '[object Object]')
  assert.equal(warn.mock.callCount(), 1)
  assert.equal(jsonPropertyConverter.fromAttribute('not json'), undefined)
  assert.equal(warn.mock.callCount(), 1)
})
