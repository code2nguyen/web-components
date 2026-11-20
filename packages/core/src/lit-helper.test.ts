import assert from 'node:assert/strict'
import { test } from 'node:test'

import { arrayPropertyConverter, jsonPropertyConverter, SlotReplayController, type SlotReplayHost } from './lit-helper.ts'

test('a list attribute reads as a ;-separated value', () => {
  assert.deepEqual(arrayPropertyConverter.fromAttribute('EUR;USD'), ['EUR', 'USD'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute(''), [])
  assert.deepEqual(arrayPropertyConverter.fromAttribute(null), [])
})

test('a list attribute also reads as a JSON array', () => {
  assert.deepEqual(arrayPropertyConverter.fromAttribute('["EUR","USD"]'), ['EUR', 'USD'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute(' ["a", "b"] '), ['a', 'b'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[]'), [])
  assert.deepEqual(arrayPropertyConverter.fromProperty('["a;b","c"]'), ['a;b', 'c'])
})

test('a value that only looks like JSON is still split on ;', () => {
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[draft];done'), ['[draft]', 'done'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[draft]'), ['[draft]'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[{"a":1}]'), ['[{"a":1}]'])
  assert.deepEqual(arrayPropertyConverter.fromAttribute('[1.50]'), ['[1.50]'])
})

test('a list reflects as a ;-separated value, or as JSON when an item holds a ;', () => {
  for (const list of [
    ['EUR', 'USD'],
    ['a;b', 'c'],
  ]) {
    assert.deepEqual(arrayPropertyConverter.fromAttribute(arrayPropertyConverter.toAttribute(list)), list)
  }
  assert.equal(arrayPropertyConverter.toAttribute(['EUR', 'USD']), 'EUR;USD')
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

/** A Lit host as far as the controller sees it: controllers, `hasUpdated`, `updateComplete` and a shadow root. */
function fakeHost(shadowRoot: object | null = null) {
  const controllers: { hostUpdated?: () => void }[] = []
  let resolve: (value: boolean) => void = () => {}
  const host = {
    shadowRoot,
    hasUpdated: false,
    updateComplete: new Promise<boolean>((done) => (resolve = done)),
    addController: (controller: { hostUpdated?: () => void }) => controllers.push(controller),
    /** One update: the controllers' `hostUpdated`, then `hasUpdated`, then `updateComplete` resolves. */
    update() {
      for (const controller of controllers) controller.hostUpdated?.()
      host.hasUpdated = true
      resolve(true)
    },
  }
  return host
}

test('a slot replay is server-only by default, and never runs on the server itself', async () => {
  // Node is the server (`isServer`), where no shadow root came from a declarative template.
  const host = fakeHost({})
  let calls = 0
  const replay = new SlotReplayController(host as unknown as SlotReplayHost, () => calls++)
  assert.equal(replay.serverRendered, false)
  assert.equal(replay.hydrating, false)
  host.update()
  await host.updateComplete
  assert.equal(calls, 0)
})

test('a slot replay with `always` runs once, after the first update or from it with `immediate`', async () => {
  const order: string[] = []
  const host = fakeHost()
  new SlotReplayController(host as unknown as SlotReplayHost, () => order.push('deferred'), { always: true })
  new SlotReplayController(host as unknown as SlotReplayHost, () => order.push(`immediate, hasUpdated ${host.hasUpdated}`), { always: true, immediate: true })
  host.update()
  order.push('updated')
  await host.updateComplete
  host.update()
  await host.updateComplete
  assert.deepEqual(order, ['immediate, hasUpdated false', 'updated', 'deferred'])
})
