import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, expect } from '../../../tests/component-fixture'

// A form-associated custom element is submitted under its `name` *content attribute*, not its property. A framework
// that creates the element on the client (React 19 after a client-side navigation, a row added from state) sets
// `name` as a property, so every form control must reflect it or `new FormData(form)` silently leaves it out.
// Each case creates its element with `document.createElement`, sets `.name` and a value as properties only, appends it
// to a form and reads the form back. A form-associated element added without a case here fails the coverage test.

const require = createRequire(import.meta.url)
const manifest = JSON.parse(readFileSync(require.resolve('@c2n/components/custom-elements.json'), 'utf8')) as {
  modules?: { declarations?: { tagName?: string }[] }[]
}
const tags = (manifest.modules ?? []).flatMap((module) => (module.declarations ?? []).flatMap((declaration) => declaration.tagName ?? []))

/** What `new FormData(form).getAll('field')` holds once each element is set up by `setUp` in the page below. */
const submitted: Record<string, string[]> = {
  'c2-autocomplete': ['cdg'],
  'c2-button-group': ['b'],
  'c2-cascader': ['zhejiang;ningbo'],
  'c2-chat-input': ['Hello'],
  'c2-checkbox': ['yes'],
  'c2-checkbox-group': ['email', 'sms'],
  'c2-code-editor': ['let a = 1'],
  'c2-date-input': ['2026-10-17'],
  'c2-date-selector': ['2026-10-17'],
  'c2-date-time-picker': ['2026-10-17T09:30'],
  'c2-inline-edit': ['Apollo'],
  'c2-json-form': ['{"city":"Paris"}'],
  'c2-key-value-editor': ['API_KEY=secret'],
  'c2-map-chart': ['DEU', 'POL'],
  'c2-mask-input': ['abc'],
  'c2-money-input': ['1250'],
  'c2-notepad': ['Notes'],
  'c2-number-input': ['42'],
  'c2-otp-input': ['1234'],
  'c2-page-editor': ['<p>Page</p>'],
  'c2-password-field': ['hunter2'],
  'c2-phone-input': ['+33612345678'],
  'c2-query-input': ['status:open'],
  'c2-questionnaire': ['{"q1":"yes"}'],
  'c2-radio': ['a'],
  'c2-radio-group': ['a'],
  'c2-rate': ['3'],
  'c2-rich-text-editor': ['Hello **world**'],
  'c2-search-field': ['query'],
  'c2-select': ['eu'],
  'c2-slider': ['30'],
  'c2-switch': ['on'],
  'c2-tag-input': ['red', 'blue'],
  'c2-text-field': ['Ada'],
  'c2-text-field-clear': ['Ada'],
  'c2-textarea': ['Long text'],
  'c2-time-input': ['09:30'],
  'c2-tree-select': ['eu'],
  'c2-upload': ['notes.txt'],
}

// Form-associated elements that reflect `name` but are not an entry of `new FormData(form)` on their own.
const reflectOnly: Record<string, string> = {
  'c2-button': 'a submit button is an entry of the submission it triggers only',
  'c2-split-button': 'its main half is a submit button: an entry of the submission it triggers only',
}

test('every form-associated element has a FormData case', async ({ page, renderScenario }) => {
  await renderScenario('')
  const formAssociated = await page.evaluate(
    (names) => names.filter((name) => (customElements.get(name) as { formAssociated?: boolean } | undefined)?.formAssociated === true),
    tags,
  )
  expect(formAssociated.length).toBeGreaterThan(30)
  expect(formAssociated.filter((tag) => !(tag in submitted) && !(tag in reflectOnly))).toEqual([])
})

test('a client-created control is submitted under the name set as a property', async ({ page, renderScenario }) => {
  await renderScenario('<form></form>')
  const outcome = await page.evaluate(
    async (cases) => {
      type Control = HTMLElement & Record<string, unknown> & { updateComplete?: Promise<unknown> }
      // Values are set as properties only, the way a framework hands them to a client-created element.
      const setUp: Record<string, (element: Control) => void> = {
        'c2-autocomplete': (e) => (e.value = 'cdg'),
        'c2-button-group': (e) => Object.assign(e, { selection: 'single', value: 'b' }),
        'c2-cascader': (e) => (e.value = ['zhejiang', 'ningbo']),
        'c2-chat-input': (e) => (e.value = 'Hello'),
        'c2-checkbox': (e) => Object.assign(e, { value: 'yes', checked: true }),
        'c2-checkbox-group': (e) => (e.value = ['email', 'sms']),
        'c2-code-editor': (e) => (e.value = 'let a = 1'),
        'c2-date-input': (e) => (e.value = '2026-10-17'),
        'c2-date-selector': (e) => (e.from = '2026-10-17'),
        'c2-date-time-picker': (e) => (e.value = '2026-10-17T09:30'),
        'c2-inline-edit': (e) => (e.value = 'Apollo'),
        'c2-json-form': (e) => Object.assign(e, { schema: { type: 'object', properties: { city: { type: 'string' } } }, value: { city: 'Paris' } }),
        'c2-key-value-editor': (e) => (e.entries = [{ key: 'API_KEY', value: 'secret' }]),
        'c2-map-chart': (e) => (e.value = ['DEU', 'POL']),
        'c2-mask-input': (e) => (e.value = 'abc'),
        'c2-money-input': (e) => (e.value = '1250'),
        'c2-notepad': (e) => (e.value = 'Notes'),
        'c2-number-input': (e) => (e.value = '42'),
        'c2-otp-input': (e) => (e.value = '1234'),
        'c2-page-editor': (e) => (e.value = '<p>Page</p>'),
        'c2-password-field': (e) => (e.value = 'hunter2'),
        'c2-phone-input': (e) => (e.value = '+33612345678'),
        'c2-query-input': (e) => (e.value = 'status:open'),
        'c2-questionnaire': (e) => (e.answers = { q1: 'yes' }),
        'c2-radio': (e) => Object.assign(e, { value: 'a', checked: true }),
        'c2-radio-group': (e) => (e.value = 'a'),
        'c2-rate': (e) => (e.value = 3),
        'c2-rich-text-editor': (e) => (e.value = 'Hello **world**'),
        'c2-search-field': (e) => (e.value = 'query'),
        'c2-select': (e) => (e.value = ['eu']),
        'c2-slider': (e) => (e.value = 30),
        'c2-switch': (e) => (e.checked = true),
        'c2-tag-input': (e) => (e.value = ['red', 'blue']),
        'c2-text-field': (e) => (e.value = 'Ada'),
        'c2-text-field-clear': (e) => (e.value = 'Ada'),
        'c2-textarea': (e) => (e.value = 'Long text'),
        'c2-time-input': (e) => (e.value = '09:30'),
        'c2-tree-select': (e) => (e.value = ['eu']),
        'c2-upload': (e) => (e.value = [new File(['hello'], 'notes.txt', { type: 'text/plain' })]),
        'c2-button': (e) => Object.assign(e, { type: 'submit', value: 'go' }),
        'c2-split-button': (e) => Object.assign(e, { type: 'submit', value: 'go' }),
      }
      const form = document.querySelector('form')!
      const results: Record<string, { attribute: string | null; entries: string[] } | { error: string }> = {}
      for (const tag of cases) {
        try {
          form.replaceChildren()
          const element = document.createElement(tag) as Control
          element.name = 'field'
          setUp[tag]?.(element)
          form.append(element)
          await element.updateComplete
          await element.updateComplete
          const entries = new FormData(form).getAll('field').map((entry) => (entry instanceof File ? entry.name : entry))
          results[tag] = { attribute: element.getAttribute('name'), entries }
        } catch (error) {
          results[tag] = { error: String((error as Error).stack ?? error) }
        }
      }
      return results
    },
    [...Object.keys(submitted), ...Object.keys(reflectOnly)],
  )

  for (const [tag, entries] of Object.entries(submitted)) {
    expect.soft(outcome[tag], tag).toEqual({ attribute: 'field', entries })
  }
  for (const tag of Object.keys(reflectOnly)) expect.soft(outcome[tag]?.attribute, tag).toBe('field')
})

test('c2-date-selector reflects end-name and submits the end of the range under it', async ({ page, renderScenario }) => {
  await renderScenario('<form></form>')
  const outcome = await page.evaluate(async () => {
    const element = document.createElement('c2-date-selector') as HTMLElement & Record<string, unknown> & { updateComplete: Promise<unknown> }
    Object.assign(element, { name: 'start', endName: 'end', from: '2026-10-17', to: '2026-10-24' })
    document.querySelector('form')!.append(element)
    await element.updateComplete
    return { attribute: element.getAttribute('end-name'), data: Object.fromEntries(new FormData(document.querySelector('form')!)) }
  })
  expect(outcome).toEqual({ attribute: 'end', data: { start: '2026-10-17', end: '2026-10-24' } })
})
