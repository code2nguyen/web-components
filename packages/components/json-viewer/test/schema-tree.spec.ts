import { test, expect, watch, accessible, clipboard } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const user = {
  title: 'User',
  type: 'object',
  required: ['id', 'email'],
  properties: {
    id: { type: 'string', format: 'uuid', readOnly: true, description: 'Assigned by the server.' },
    email: { type: 'string', format: 'email', maxLength: 120 },
    age: { type: 'integer', minimum: 0, exclusiveMaximum: 150 },
    plan: { type: 'string', enum: ['free', 'pro', 'team'], default: 'free' },
    nickname: { type: ['string', 'null'], deprecated: true },
    address: { $ref: '#/$defs/Address' },
    tags: { type: 'array', items: { type: 'string', pattern: '^[a-z]+$' }, uniqueItems: true },
    friends: { type: 'array', items: { $ref: '#' } },
  },
  $defs: {
    Address: {
      type: 'object',
      required: ['city'],
      properties: { city: { type: 'string', minLength: 1 }, zip: { type: 'string' } },
    },
  },
}

const tree = (attributes = '', schema: unknown = user) => `<c2-schema-tree schema='${JSON.stringify(schema)}' ${attributes}></c2-schema-tree>`

const line = (page: Page, key: string) => page.getByRole('treeitem').filter({ has: page.locator('[part~="key"]', { hasText: new RegExp(`^${key}$`) }) })

test('each property shows its type, marks, constraints, values and description', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await expect(page.getByRole('tree', { name: 'Schema' })).toBeVisible()
  await expect(line(page, 'id').locator('[part="type"]')).toHaveText('string<uuid>')
  await expect(line(page, 'id').locator('[part="required"]')).toHaveText('required')
  await expect(line(page, 'id').locator('[part="mark"]')).toHaveText('read-only')
  await expect(line(page, 'id').locator('[part="description"]')).toHaveText('Assigned by the server.')
  // Two marks side by side are two words in the line's accessible name, not "requiredread-only".
  await expect(line(page, 'id')).toHaveAccessibleName(/required read-only/)
  await expect(line(page, 'email').locator('[part="constraints"]')).toHaveText('≤ 120 chars')
  await expect(line(page, 'age').locator('[part="constraints"]')).toHaveText('≥ 0 · < 150')
  await expect(line(page, 'age').locator('[part="required"]')).toHaveCount(0)
  await expect(line(page, 'plan').locator('[part="enum"]')).toHaveText('"free" | "pro" | "team"')
  await expect(line(page, 'plan').locator('[part="constraints"]')).toHaveText('default "free"')
  await expect(line(page, 'nickname').locator('[part="type"]')).toHaveText('string | null')
  await expect(line(page, 'nickname').locator('[part="mark"]')).toHaveText('deprecated')
  await expect(line(page, 'tags').locator('[part="type"]')).toHaveText('string[]')
  await expect(line(page, 'tags').locator('[part="constraints"]')).toHaveText('unique items · /^[a-z]+$/')
  await accessible(page)
})

test('a $ref opens on the referred schema, and a schema referring to an ancestor stops there', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await expect(line(page, 'address').locator('[part="type"]')).toHaveText('Address')
  await expect(line(page, 'address')).toHaveAttribute('aria-expanded', 'true')
  await expect(line(page, 'city')).toHaveAttribute('aria-level', '2')
  await expect(line(page, 'city').locator('[part="required"]')).toHaveCount(1)
  await expect(line(page, 'zip').locator('[part="required"]')).toHaveCount(0)
  // `friends` is a list of the root itself: it is named and marked, and has no lines of its own.
  await expect(line(page, 'friends').locator('[part="type"]')).toHaveText('object[]')
  await expect(line(page, 'friends').locator('[part="mark"]')).toHaveText('↻ recursive')
  await expect(line(page, 'friends')).not.toHaveAttribute('aria-expanded')
})

test('an array of objects opens on its items’ properties, and allOf is merged', async ({ page, renderScenario }) => {
  await renderScenario(
    tree('', {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/$defs/Line' }, minItems: 1 },
      },
      $defs: {
        Base: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' } } },
        Line: { allOf: [{ $ref: '#/$defs/Base' }, { properties: { qty: { type: 'integer', multipleOf: 1 } } }] },
      },
    }),
  )
  await expect(line(page, 'items').locator('[part="type"]')).toHaveText('Line[]')
  await expect(line(page, 'items').locator('[part="constraints"]')).toHaveText('≥ 1 items')
  await expect(line(page, 'sku')).toHaveAttribute('aria-level', '2')
  await expect(line(page, 'sku').locator('[part="required"]')).toHaveCount(1)
  await expect(line(page, 'qty').locator('[part="constraints"]')).toHaveText('multiple of 1')
})

test('oneOf shows one line per option, opened with the keyboard', async ({ page, renderScenario }) => {
  await renderScenario(
    tree('expand-depth="1"', {
      type: 'object',
      properties: {
        payment: {
          oneOf: [
            { title: 'Card', type: 'object', properties: { number: { type: 'string' } } },
            { type: 'object', properties: { iban: { type: 'string' } } },
          ],
        },
      },
    }),
  )
  await expect(line(page, 'payment').locator('[part="type"]')).toHaveText('one of')
  await line(page, 'payment').focus()
  await page.keyboard.press('ArrowRight')
  await expect(line(page, 'Card')).toBeVisible()
  await expect(line(page, 'Option 2')).toHaveAttribute('aria-level', '2')
  await page.keyboard.press('ArrowRight')
  await expect(line(page, 'Card')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(line(page, 'number')).toBeVisible()
  await expect(line(page, 'iban')).toHaveCount(0)
})

test('pointer shows one schema of an OpenAPI document with its references', async ({ page, renderScenario }) => {
  const openapi = {
    openapi: '3.0.3',
    components: {
      schemas: {
        Order: {
          type: 'object',
          properties: {
            total: { type: 'number', minimum: 0, exclusiveMinimum: true },
            note: { type: 'string', nullable: true },
            customer: { $ref: '#/components/schemas/Customer', description: 'Who placed it.' },
          },
        },
        Customer: { type: 'object', properties: { name: { type: 'string' } } },
      },
    },
  }
  await renderScenario(tree('pointer="/components/schemas/Order"', openapi))
  await expect(line(page, 'total').locator('[part="constraints"]')).toHaveText('> 0')
  await expect(line(page, 'note').locator('[part="type"]')).toHaveText('string | null')
  await expect(line(page, 'customer').locator('[part="type"]')).toHaveText('Customer')
  await expect(line(page, 'customer').locator('[part="description"]')).toHaveText('Who placed it.')
  await expect(line(page, 'name')).toHaveAttribute('aria-level', '2')
  await expect(page.getByRole('treeitem')).toHaveCount(4)
})

test('paths are keyword locations, unique per line, and copy value gives the schema', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await clipboard(page)
  const host = page.locator('c2-schema-tree')
  await watch(host, 'expansion-change')
  await line(page, 'city').focus()
  await page.keyboard.press('p')
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', '$.properties.address["$ref"].properties.city')
  await page.keyboard.press('c')
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', JSON.stringify(user.$defs.Address.properties.city, null, 2))
  await line(page, 'address').click()
  await expect(line(page, 'city')).toHaveCount(0)
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ path: '$.properties.address', segments: ['properties', 'address'], expanded: false }]))
})

test('search and filter find properties by name and by type', async ({ page, renderScenario }) => {
  await renderScenario(tree('search="zip" filter'))
  await expect(page.getByRole('treeitem')).toHaveCount(2)
  await expect(line(page, 'zip').locator('mark')).toHaveText('zip')
  const host = page.locator('c2-schema-tree')
  await host.evaluate((element) => ((element as HTMLElement & { search: string }).search = 'integer'))
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  await expect(line(page, 'age').locator('[part="type"] mark')).toHaveText('integer')
  expect(await host.evaluate((element) => (element as HTMLElement & { searchMatches: string[] }).searchMatches)).toEqual(['$.properties.age'])
})

test('search matches the name and the type a line shows, on branches and options too', async ({ page, renderScenario }) => {
  const schema = {
    type: 'object',
    properties: {
      billing: { $ref: '#/$defs/Address' },
      shipping: { $ref: '#/$defs/Address' },
      method: { oneOf: [{ title: 'Card', type: 'object', properties: { last4: { type: 'string' } } }, { type: 'string' }] },
    },
    $defs: { Address: { type: 'object', properties: { city: { type: 'string' } } } },
  }
  await renderScenario(tree('search="address" filter', schema))
  // A matching branch keeps its own lines under filter.
  await expect(page.getByRole('treeitem')).toHaveCount(4)
  await expect(line(page, 'billing').locator('[part="type"] mark')).toHaveText('Address')
  const host = page.locator('c2-schema-tree')
  await host.evaluate((element) => ((element as HTMLElement & { search: string }).search = 'card'))
  await expect(page.getByRole('treeitem')).toHaveCount(2)
  await expect(line(page, 'Card').locator('[part="key"] mark')).toHaveText('Card')
  // The second option is untitled: its hidden key holds a digit, which must not match.
  await host.evaluate((element) => ((element as HTMLElement & { search: string }).search = '1'))
  await expect(page.getByRole('treeitem')).toHaveCount(0)
  await host.evaluate((element) => ((element as HTMLElement & { search: string }).search = 'city'))
  expect(await host.evaluate((element) => (element as HTMLElement & { searchMatches: string[] }).searchMatches)).toEqual([
    '$.properties.billing["$ref"].properties.city',
    '$.properties.shipping["$ref"].properties.city',
  ])
})

test('sort-keys sorts the properties and keeps the options in order', async ({ page, renderScenario }) => {
  const options = Array.from({ length: 12 }, (_, index) => ({
    title: `T${String(index + 1).padStart(2, '0')}`,
    type: 'object',
    properties: { x: { type: 'string' } },
  }))
  await renderScenario(tree('sort-keys expand-depth="1"', { type: 'object', properties: { b: { type: 'string' }, a: { oneOf: options } } }))
  await expect(page.getByRole('treeitem').locator('[part="key"]')).toHaveText(['a', 'b'])
  await line(page, 'a').click()
  await expect(page.getByRole('treeitem').locator('[part="key"]')).toHaveText(['a', ...options.map((option) => option.title), 'b'])
})

test('a keyword beside a $ref wins over the referred schema, in allOf too', async ({ page, renderScenario }) => {
  await renderScenario(
    tree('', {
      type: 'object',
      properties: {
        home: { $ref: '#/$defs/Place', description: 'Where they live.' },
        work: { allOf: [{ $ref: '#/$defs/Place', description: 'Where they work.' }] },
      },
      $defs: { Place: { type: 'object', description: 'A place.', properties: { city: { type: 'string' } } } },
    }),
  )
  await expect(line(page, 'home').locator('[part="description"]')).toHaveText('Where they live.')
  await expect(line(page, 'work').locator('[part="description"]')).toHaveText('Where they work.')
  await expect(line(page, 'city')).toHaveCount(2)
})

test('the empty slot shows when the schema mode cannot load', async ({ page, renderScenario }) => {
  await page.route('**/schema-model*', (route) => route.abort())
  await renderScenario(`<c2-schema-tree schema='{"type":"string"}'><span slot="empty">Could not read the schema</span></c2-schema-tree>`)
  await expect(page.locator('c2-schema-tree')).toContainText('Could not read the schema')
  await expect(page.getByRole('treeitem')).toHaveCount(0)
})

test('reads its text in the page language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${tree()}</div>`)
  await expect(page.getByRole('tree', { name: 'Schéma' })).toBeVisible()
  await expect(line(page, 'id').locator('[part="required"]')).toHaveText('obligatoire')
  await expect(line(page, 'email').locator('[part="constraints"]')).toHaveText('≤ 120 caractères')
  await expect(line(page, 'plan').locator('[part="constraints"]')).toHaveText('par défaut "free"')
  // A message the app did not translate falls back to English.
  await expect(line(page, 'id').locator('[part="mark"]')).toHaveText('read-only')
})

test('unknown pointer, unresolved references, odd names and a scalar schema', async ({ page, renderScenario }) => {
  await renderScenario(tree('pointer="/nowhere"'))
  await expect(page.locator('c2-schema-tree')).toContainText('No data')
  await renderScenario(
    tree('', {
      properties: {
        // A real `__proto__` key, as JSON.parse reads it: a literal would set the prototype instead.
        ...JSON.parse('{"__proto__":{"type":"boolean"}}'),
        remote: { $ref: 'https://example.com/schemas/remote.json' },
        missing: { $ref: '#/$defs/Missing' },
        free: true,
      },
      additionalProperties: { type: 'number' },
    }),
  )
  await expect(line(page, '__proto__').locator('[part="type"]')).toHaveText('boolean')
  await expect(line(page, 'remote').locator('[part="type"]')).toHaveText('https://example.com/schemas/remote.json')
  await expect(line(page, 'missing').locator('[part="type"]')).toHaveText('#/$defs/Missing')
  await expect(line(page, 'free').locator('[part="type"]')).toHaveText('any')
  await expect(line(page, 'other keys').locator('[part="type"]')).toHaveText('number')
  await renderScenario(tree('', { type: 'string', maxLength: 3 }))
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  await expect(page.locator('c2-schema-tree [part="type"]')).toHaveText('string')
  await expect(page.locator('c2-schema-tree [part~="key"]')).toHaveCount(0)
})

test('a new schema replaces the tree', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await expect(line(page, 'email')).toBeVisible()
  await page.locator('c2-schema-tree').evaluate((element) => {
    ;(element as HTMLElement & { schema: unknown }).schema = { type: 'object', properties: { sku: { type: 'string' } } }
  })
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  await expect(line(page, 'sku')).toBeVisible()
})

test('the schema mode loads only when a schema tree is given a schema', async ({ page, renderScenario }) => {
  const loaded = () => page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('schema-model')))
  await renderScenario(`<c2-json-viewer data='{"a":1}'></c2-json-viewer><c2-schema-tree></c2-schema-tree>`)
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  expect(await loaded()).toBe(false)
  await page.locator('c2-schema-tree').evaluate((element) => ((element as HTMLElement & { schema: unknown }).schema = { type: 'string' }))
  await expect(page.getByRole('treeitem')).toHaveCount(2)
  expect(await loaded()).toBe(true)
})
