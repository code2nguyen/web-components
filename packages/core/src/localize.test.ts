import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addMessages, addTranslations, defineMessages, formatMessage } from './localize.ts'

const catalog = defineMessages('localize-test', {
  close: 'Close',
  done: (closed: number, total: number) => `${closed} of ${total} done`,
  urgent: (count: number) => `${count} urgent`,
  category: (name: string) => name,
})

test('English is the default, and the fallback for a language or a message not given', () => {
  assert.equal(formatMessage(catalog, 'en', 'close'), 'Close')
  assert.equal(formatMessage(catalog, 'de', 'done', 2, 6), '2 of 6 done')
})

test('takes translations as JSON: {n} placeholders, plurals and keyed choices', () => {
  addTranslations({
    fr: {
      'localize-test': {
        close: 'Fermer',
        done: '{0} sur {1} terminées',
        urgent: { one: '{0} urgente', other: '{0} urgentes' },
        category: { food: 'Cuisine', other: '{0}' },
      },
    },
  })
  assert.equal(formatMessage(catalog, 'fr', 'close'), 'Fermer')
  assert.equal(formatMessage(catalog, 'fr', 'done', 2, 6), '2 sur 6 terminées')
  // French puts 0 and 1 in the singular.
  assert.equal(formatMessage(catalog, 'fr', 'urgent', 0), '0 urgente')
  assert.equal(formatMessage(catalog, 'fr', 'urgent', 1), '1 urgente')
  assert.equal(formatMessage(catalog, 'fr', 'urgent', 3), '3 urgentes')
  assert.equal(formatMessage(catalog, 'fr', 'category', 'food'), 'Cuisine')
  assert.equal(formatMessage(catalog, 'fr', 'category', 'travel'), 'travel')
  // A region takes its language's messages.
  assert.equal(formatMessage(catalog, 'fr-CA', 'close'), 'Fermer')
})

test('an exact number wins over the plural category, and a later call overrides one message only', () => {
  addTranslations({ fr: { 'localize-test': { urgent: { '0': 'Rien d’urgent', one: '{0} urgente', other: '{0} urgentes' } } } })
  assert.equal(formatMessage(catalog, 'fr', 'urgent', 0), 'Rien d’urgent')
  addMessages(catalog, 'fr', { close: 'Fermer la fenêtre' })
  assert.equal(formatMessage(catalog, 'fr', 'close'), 'Fermer la fenêtre')
  assert.equal(formatMessage(catalog, 'fr', 'done', 1, 2), '1 sur 2 terminées')
})

test('translations given before the component defines its messages still apply, over what it ships', () => {
  addTranslations({ fr: { 'localize-early': { hello: 'Salut' } } })
  const early = defineMessages('localize-early', { hello: 'Hello', bye: 'Bye' }, { fr: { hello: 'Bonjour', bye: 'Au revoir' } })
  assert.equal(formatMessage(early, 'fr', 'hello'), 'Salut')
  assert.equal(formatMessage(early, 'fr', 'bye'), 'Au revoir')
})
