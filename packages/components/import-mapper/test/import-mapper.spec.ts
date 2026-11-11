import { test, expect, accessible, watch, props } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Field = { key: string; label?: string; required?: boolean; type?: string; aliases?: string[]; options?: string[] }
type Model = typeof import('../src/import-model')
type Mapper = HTMLElement & {
  mapping: (string | null)[]
  missing: string[]
  headers: string[]
  validate(): { valid: boolean; missing: string[]; errors: { row: number; field: string; message: string }[]; checked: number }
  records(): Record<string, string>[]
  autoMatch(): void
  clearMapping(): void
  updateComplete: Promise<boolean>
}
declare global {
  interface Window {
    importModel: Model
    addTranslations: (languages: Record<string, Record<string, Record<string, unknown>>>) => void
    contacts: { csv: string; fields: Field[] }
    requests: { start: number; count: number }[]
    release: () => void
  }
}

const mapper = (page: Page) => page.locator('c2-import-mapper')
const picker = (page: Page, header: string) => mapper(page).locator(`c2-select[aria-label="Import column “${header}” as"]`)
const mapping = (page: Page) => mapper(page).evaluate((element) => (element as Mapper).mapping)
const focusedPicker = (page: Page) => mapper(page).evaluate((element) => element.shadowRoot!.activeElement?.getAttribute('aria-label') ?? null)
const events = async (page: Page) => JSON.parse((await mapper(page).getAttribute('data-events')) ?? '[]') as Record<string, unknown>[]

async function render(page: Page, renderScenario: (html: string) => Promise<void>, attributes = '', inner = '') {
  await renderScenario(`<c2-import-mapper label="Import contacts" ${attributes}>${inner}</c2-import-mapper>`)
  await mapper(page).evaluate(async (element) => {
    Object.assign(element, window.contacts)
    await (element as Mapper).updateComplete
    for (const select of element.shadowRoot!.querySelectorAll('c2-select')) await (select as Mapper).updateComplete
  })
}

test('parseCsv reads quotes, embedded line breaks, other delimiters and a byte-order mark', async ({ page, renderScenario }) => {
  await renderScenario('')
  const out = await page.evaluate(() => {
    const { parseCsv, detectDelimiter } = window.importModel
    return {
      quoted: parseCsv('a,b\n"x, y","say ""hi"""\r\n"two\nlines",\n\n'),
      semicolon: parseCsv('﻿name;amount\nAda;1,5'),
      tab: detectDelimiter('a\tb\tc\n1\t2\t3'),
    }
  })
  expect(out.quoted).toEqual([
    ['a', 'b'],
    ['x, y', 'say "hi"'],
    ['two\nlines', ''],
  ])
  expect(out.semicolon).toEqual([
    ['name', 'amount'],
    ['Ada', '1,5'],
  ])
  expect(out.tab).toBe('\t')
})

test('autoMatch pairs headers with fields by key, label and alias, best first, each field once', async ({ page, renderScenario }) => {
  await renderScenario('')
  const out = await page.evaluate(() => {
    const { autoMatch, matchScore } = window.importModel
    const fields = [
      { key: 'firstName', label: 'First name' },
      { key: 'email', aliases: ['mail'] },
      { key: 'phone', label: 'Phone number' },
    ]
    return {
      mapping: autoMatch(['First Name', 'E-Mail', 'Mail', 'Phone #', 'Notes'], fields),
      kept: autoMatch(['First Name', 'E-Mail'], fields, [null, 'phone']),
      camel: matchScore('firstName', { key: 'first_name' }),
      none: matchScore('Notes', { key: 'email' }),
      // A short name inside another word is not a match.
      chance: [matchScore('Language', { key: 'age' }), matchScore('Syntax', { key: 'tax' }), matchScore('Manager', { key: 'name' })],
      words: matchScore('Full name', { key: 'name' }),
    }
  })
  expect(out.mapping).toEqual(['firstName', 'email', null, 'phone', null])
  expect(out.kept).toEqual(['firstName', 'phone'])
  expect(out.camel).toBe(100)
  expect(out.none).toBe(0)
  expect(out.chance.every((score) => score < 50)).toBe(true)
  expect(out.words).toBeGreaterThanOrEqual(50)
})

test('checkValue applies required, type, options, pattern and the app check', async ({ page, renderScenario }) => {
  await renderScenario('')
  const out = await page.evaluate(() => {
    const { checkValue } = window.importModel
    const kind = (field: Parameters<typeof checkValue>[0], value: string) => checkValue(field, value)?.kind ?? null
    return [
      kind({ key: 'a', required: true }, '  '),
      kind({ key: 'a' }, ''),
      kind({ key: 'a', type: 'number' }, '1,234.50'),
      kind({ key: 'a', type: 'number' }, '12abc'),
      kind({ key: 'a', type: 'number' }, 'e5'),
      kind({ key: 'a', type: 'number' }, '-.5e3'),
      kind({ key: 'a', type: 'date' }, '2024-05-01T99:99'),
      kind({ key: 'a', type: 'date' }, '2024-05-01T23:59:59Z'),
      kind({ key: 'a', type: 'integer' }, '3.5'),
      kind({ key: 'a', type: 'date' }, '2024-02-30'),
      kind({ key: 'a', type: 'date' }, '31/01/2024'),
      kind({ key: 'a', type: 'email' }, 'ada@example'),
      kind({ key: 'a', type: 'url' }, 'ftp://x.org'),
      kind({ key: 'a', type: 'boolean' }, 'Yes'),
      kind({ key: 'a', options: ['Active', 'Archived'] }, 'archived'),
      kind({ key: 'a', options: ['Active'] }, 'gone'),
      kind({ key: 'a', pattern: '[A-Z]{3}' }, 'EURO'),
      checkValue({ key: 'a', validate: (value) => (value === 'x' ? 'No x' : null) }, 'x'),
    ]
  })
  expect(out).toEqual([
    'required',
    null,
    null,
    'number',
    'number',
    null,
    'date',
    null,
    'integer',
    'date',
    null,
    'email',
    'url',
    null,
    null,
    'options',
    'pattern',
    { kind: 'custom', message: 'No x' },
  ])
})

test('matches the headers when a file arrives and lists the required fields', async ({ page, renderScenario }) => {
  await render(page, renderScenario)
  await expect(mapper(page)).toHaveHostAria('role', 'group')
  await expect(mapper(page)).toHaveHostAria('aria-label', 'Import contacts')
  expect(await mapping(page)).toEqual(['name', 'email', 'phone', 'signup', null])
  const columns = mapper(page).locator('[part="column"]')
  await expect(columns).toHaveCount(5)
  await expect(columns.nth(1)).toContainText('E-mail address')
  await expect(columns.nth(1)).toContainText('Auto-matched')
  await expect(columns.nth(1).locator('.sample')).toHaveText(['ada@example.com', 'grace(at)navy.mil', 'alan@example.org'])
  await expect(columns.nth(4)).toContainText('Not imported')
  await expect(mapper(page).locator('[part="summary"]')).toContainText('All required fields are mapped')
  await expect(mapper(page).locator('[part="summary"]')).toContainText('4 of 5 columns mapped')
  await accessible(page)
})

test('a field is picked from the keyboard, moves from the column that had it, and is announced', async ({ page, renderScenario, tab }) => {
  await render(page, renderScenario)
  await watch(mapper(page), 'mapping-change')
  // The pickers' own input and change events do not leave the mapper.
  await page.evaluate(() => {
    ;(window as Window & { formEvents?: number }).formEvents = 0
    for (const type of ['input', 'change']) document.addEventListener(type, () => (window as Window & { formEvents?: number }).formEvents!++)
  })
  await picker(page, 'Phone #').locator('button').first().focus()
  await tab()
  await expect.poll(() => focusedPicker(page)).toBe('Import column “Signed up” as')
  await tab()
  await expect.poll(() => focusedPicker(page)).toBe('Import column “Notes” as')
  // Options: Don't import, Name, Email, Phone, Sign-up date, Status. Open on the selected one and go to Email.
  await page.keyboard.press('ArrowDown')
  await expect(picker(page, 'Notes')).toHaveJSProperty('open', true)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect.poll(() => mapping(page)).toEqual(['name', null, 'phone', 'signup', 'email'])
  expect(await page.evaluate(() => (window as Window & { formEvents?: number }).formEvents)).toBe(0)
  const [event] = await events(page)
  expect(event).toEqual({ mapping: ['name', null, 'phone', 'signup', 'email'], column: 4, field: 'email', missing: [] })
  await expect(mapper(page).locator('[role="status"]')).toHaveText('Column “Notes” imports as Email. Email is no longer imported from “E-mail address”.')
  await expect(mapper(page).locator('[part="column"]').nth(1)).toContainText('Not imported')

  // Leaving the name out makes a required field missing.
  await picker(page, 'Full name').locator('button').first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(picker(page, 'Full name')).toHaveJSProperty('open', true)
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect.poll(() => mapper(page).evaluate((element) => (element as Mapper).missing)).toEqual(['name'])
  await expect(mapper(page).locator('[part="summary"]')).toContainText('1 required field is not mapped: Name')
  await expect(mapper(page).locator('[role="status"]')).toHaveText('Column “Full name” will not be imported.')
})

test('a mapping set with the file wins over matching, and manual leaves columns unmapped', async ({ page, renderScenario }) => {
  await renderScenario('<c2-import-mapper mapping=\'[null, "email"]\'></c2-import-mapper><c2-import-mapper manual></c2-import-mapper>')
  const mappings = await page.locator('c2-import-mapper').evaluateAll(async (elements) => {
    for (const element of elements) {
      Object.assign(element, window.contacts)
      await (element as Mapper).updateComplete
    }
    return elements.map((element) => (element as Mapper).mapping)
  })
  expect(mappings).toEqual([
    [null, 'email', null, null, null],
    [null, null, null, null, null],
  ])
  const after = await page
    .locator('c2-import-mapper')
    .nth(1)
    .evaluate(async (element) => {
      const mapper = element as Mapper
      mapper.autoMatch()
      await mapper.updateComplete
      const matched = mapper.mapping
      mapper.clearMapping()
      return [matched, mapper.mapping]
    })
  expect(after).toEqual([
    ['name', 'email', 'phone', 'signup', null],
    [null, null, null, null, null],
  ])
})

test('the preview marks invalid cells, filters to rows with errors and pages with the keyboard', async ({ page, renderScenario }) => {
  await render(page, renderScenario, 'view="preview"')
  const table = mapper(page).locator('[part="table"]')
  await expect(table.locator('thead th')).toHaveText(['Row', 'Name', 'Email', 'Phone', 'Sign-up date'])
  await expect(table.locator('tbody tr')).toHaveCount(3)
  const graceRow = table.locator('tbody tr').nth(1)
  await expect(graceRow.locator('td').nth(1)).toHaveText(/grace\(at\)navy\.mil\s*Error: Not an email address/)
  await expect(graceRow.locator('td').nth(3)).toContainText('Not a date')
  await expect(mapper(page).locator('[part="preview"] .status')).toHaveText('3 rows, 1 with errors (2 errors)')
  const result = await mapper(page).evaluate((element) => (element as Mapper).validate())
  expect(result.valid).toBe(false)
  expect(result.errors.map((error) => [error.row, error.field, error.message])).toEqual([
    [1, 'email', 'Not an email address'],
    [1, 'signup', 'Not a date'],
  ])
  expect(await mapper(page).evaluate((element) => (element as Mapper).records()[0])).toEqual({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+44 20 7946 0000',
    signup: '2024-03-01',
  })
  await accessible(page)

  await props(mapper(page), { errorsOnly: true })
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table.locator('tbody th')).toHaveText('2')

  await props(mapper(page), { errorsOnly: false, pageSize: 2 })
  await expect(table.locator('tbody th')).toHaveText(['1', '2'])
  const pager = mapper(page).locator('[part="pager"]')
  await expect(pager).toContainText('Rows 1–2 of 3')
  await expect(pager.getByRole('button', { name: 'Previous rows' })).toBeDisabled()
  await pager.getByRole('button', { name: 'Next rows' }).focus()
  await page.keyboard.press('Enter')
  await expect(table.locator('tbody th')).toHaveText(['3'])
  await expect(pager).toContainText('Rows 3–3 of 3')
  await expect(pager.getByRole('button', { name: 'Next rows' })).toBeDisabled()
  await expect(pager.getByRole('button', { name: 'Previous rows' })).toBeFocused()
})

test('a dataSource loads the first rows, then each page, showing the loading state', async ({ page, renderScenario }) => {
  await renderScenario('<c2-import-mapper page-size="5"></c2-import-mapper>')
  await mapper(page).evaluate(async (element) => {
    window.requests = []
    let pending: (() => void)[] = []
    window.release = () => {
      pending.forEach((resolve) => resolve())
      pending = []
    }
    Object.assign(element, {
      fields: [
        { key: 'id', label: 'ID', type: 'integer', required: true },
        { key: 'amount', label: 'Amount', type: 'number' },
      ],
      columns: ['ID', 'Amount'],
      dataSource: {
        getRows(request: { start: number; count: number }) {
          window.requests.push(request)
          const rows = Array.from({ length: request.count }, (_, i) => [String(request.start + i + 1), i === 2 ? 'n/a' : `${(request.start + i) * 10}`])
          return new Promise((resolve) => pending.push(() => resolve({ rows, total: 12 })))
        },
      },
    })
    await (element as Mapper).updateComplete
  })
  await expect(mapper(page).locator('[part="column"]').first()).toContainText('Loading rows…')
  await page.evaluate(() => window.release())
  await expect(mapper(page).locator('[part="column"]').nth(1).locator('.sample')).toHaveText(['0', '10', 'n/a'])

  await props(mapper(page), { view: 'preview' })
  const table = mapper(page).locator('[part="table"]')
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(mapper(page).locator('[part="preview"] .status')).toContainText('checked on the 5 rows loaded')
  await mapper(page).locator('[part="pager"]').getByRole('button', { name: 'Next rows' }).click()
  await expect(mapper(page).locator('[part="state"]')).toHaveText('Loading rows…')
  await page.evaluate(() => window.release())
  await expect(table.locator('tbody th')).toHaveText(['6', '7', '8', '9', '10'])
  await expect(mapper(page).locator('[part="pager"]')).toContainText('Rows 6–10 of 12')
  // Back to a cached page while a newer request is in flight: the cached rows show at once.
  await mapper(page).locator('[part="pager"]').getByRole('button', { name: 'Next rows' }).click()
  await expect(mapper(page).locator('[part="state"]')).toHaveText('Loading rows…')
  await props(mapper(page), { page: 0 })
  await expect(table.locator('tbody th')).toHaveText(['1', '2', '3', '4', '5'])
  await page.evaluate(() => window.release())
  await expect(table.locator('tbody th')).toHaveText(['1', '2', '3', '4', '5'])
  expect(await page.evaluate(() => window.requests)).toEqual([
    { start: 0, count: 5 },
    { start: 5, count: 5 },
    { start: 10, count: 5 },
  ])
})

test('a failing dataSource shows the error slot', async ({ page, renderScenario }) => {
  await renderScenario('<c2-import-mapper><span slot="error">Could not read the file</span></c2-import-mapper>')
  await mapper(page).evaluate(async (element) => {
    Object.assign(element, { columns: ['A'], dataSource: { getRows: () => Promise.reject(new Error('offline')) } })
    await (element as Mapper).updateComplete
  })
  await expect(mapper(page).locator('[part="state"]')).toBeVisible()
  await expect(page.getByText('Could not read the file')).toBeVisible()
})

test('renderers draw the samples and the preview cells; toolbar and footer show only with content', async ({ page, renderScenario }) => {
  await render(page, renderScenario, '', '<button slot="toolbar">Preview</button>')
  await expect(mapper(page).locator('[part="toolbar"]')).toBeVisible()
  await expect(mapper(page).locator('[part="footer"]')).toBeHidden()
  await mapper(page).evaluate(async (element) => {
    Object.assign(element, {
      renderSamples: ({ values }: { values: string[] }) => `${values.length} values`,
      renderCell: ({ value, error }: { value: string; error: string | null }) => (error ? `⚠ ${value}` : value.toUpperCase()),
    })
    await (element as Mapper).updateComplete
  })
  await expect(mapper(page).locator('[part="column"]').first().locator('.samples')).toHaveText('3 values')
  await props(mapper(page), { view: 'preview' })
  const cells = mapper(page).locator('[part="table"] tbody tr').nth(1).locator('td')
  await expect(cells.nth(0).locator('.value')).toHaveText('GRACE HOPPER')
  await expect(cells.nth(1).locator('.value')).toHaveText('⚠ grace(at)navy.mil')
  await expect(cells.nth(1).locator('.error')).toContainText('Not an email address')
})

test('shows the empty state until a file arrives, and nothing to preview while no column is mapped', async ({ page, renderScenario }) => {
  await renderScenario('<c2-import-mapper></c2-import-mapper>')
  await expect(mapper(page).locator('[part="state"]')).toHaveText('No file to map yet. Choose a file to see its columns here.')
  await props(mapper(page), { columns: ['A', ''], rows: [['1', '2']], view: 'preview' })
  await expect(mapper(page).locator('[part="state"]')).toHaveText('Map at least one column to preview the import.')
  await props(mapper(page), { view: 'map' })
  await expect(mapper(page).locator('[part="column"]').nth(1).locator('.header')).toHaveText('Column 2')
})

test('takes record rows and array rows whose first row is the header', async ({ page, renderScenario }) => {
  await renderScenario('<c2-import-mapper></c2-import-mapper>')
  const headers = await mapper(page).evaluate(async (element) => {
    const mapper = element as Mapper
    Object.assign(mapper, { rows: [{ Name: 'Ada', Email: 'ada@example.com' }] })
    await mapper.updateComplete
    const fromRecords = [...mapper.headers]
    Object.assign(mapper, {
      rows: [
        ['Code', 'Price'],
        ['A1', 3],
      ],
    })
    await mapper.updateComplete
    return [fromRecords, [...mapper.headers], mapper.records()]
  })
  expect(headers).toEqual([['Name', 'Email'], ['Code', 'Price'], [{}]])
})

test('draws its text in the nearest language', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-import-mapper></c2-import-mapper></div>')
  await mapper(page).evaluate(async (element) => {
    window.addTranslations({
      fr: { 'import-mapper': { auto: 'Associée', skip: 'Ne pas importer', notImported: 'Non importée', pickerLabel: 'Importer la colonne « {0} » comme' } },
    })
    Object.assign(element, window.contacts)
    await (element as Mapper).updateComplete
  })
  await expect(mapper(page).locator('[part="column"]').first()).toContainText('Associée')
  await expect(mapper(page).locator('[part="column"]').nth(4)).toContainText('Non importée')
  await expect(mapper(page).locator('c2-select[aria-label="Importer la colonne « Notes » comme"]')).toHaveCount(1)
})
