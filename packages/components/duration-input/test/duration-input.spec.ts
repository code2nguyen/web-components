import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

type Api = {
  parseDurationText(text: string, options?: Record<string, unknown>): number | null
  formatDurationText(seconds: number, options?: Record<string, unknown>): string
}

// Scenarios that leave a field with Tab put a button after it: Tab from the last control sends focus out of the page,
// and headless Firefox then fires neither change nor focusout, so the field was never left.
const field = (page: Page, selector = 'c2-duration-input') => page.locator(selector)
const input = (locator: Locator) => locator.locator('input')
const preview = (locator: Locator) => locator.locator('.preview')
const message = (locator: Locator) => locator.locator('.supporting-text')
const value = (locator: Locator) => locator.evaluate((element) => (element as HTMLElement & { value: number | null }).value)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]') as unknown[]

test('parseDurationText reads units, fractions, clocks and bare numbers; formatDurationText writes short, long and clock', async ({ page, renderScenario }) => {
  await renderScenario('')
  const results = await page.evaluate(() => {
    const { parseDurationText: parse, formatDurationText: format } = (window as unknown as { durationApi: Api }).durationApi
    return {
      parsed: [
        parse('1h 30m'),
        parse('90m'),
        parse('90'),
        parse('90', { unit: 'h' }),
        parse('1.5h'),
        parse('1,5h'),
        parse('1:30'),
        parse('1:05:30'),
        parse('2 days 4 hours'),
        parse('1h30'),
        parse('1 hour, 30 minutes'),
        parse('1.5d', { dayHours: 8 }),
        parse('1w', { dayHours: 8, weekDays: 5 }),
        parse('2 heures', { words: { h: ['heure', 'heures'] } }),
        parse(''),
        parse('about two hours'),
        parse('1x'),
        parse('1:75'),
        parse('-1h'),
      ],
      written: [
        format(5400),
        format(5400, { format: 'long', locale: 'en' }),
        format(5400, { format: 'clock' }),
        format(3930, { format: 'clock' }),
        format(172800),
        format(172800, { largestUnit: 'h' }),
        format(3930),
        format(3930, { smallestUnit: 'm' }),
        format(43200, { dayHours: 8 }),
        format(0),
        format(0, { format: 'long', locale: 'en' }),
        format(0, { format: 'clock' }),
        format(93600, { format: 'clock' }),
      ],
    }
  })
  expect(results.parsed).toEqual([5400, 5400, 5400, 324000, 5400, 5400, 5400, 3930, 187200, 5400, 5400, 43200, 144000, 7200, null, null, null, null, null])
  expect(results.written).toEqual([
    '1h 30m',
    '1 hour, 30 minutes',
    '1:30',
    '1:05:30',
    '2d',
    '48h',
    '1h 5m 30s',
    '1h 6m',
    '1d 4h',
    '0m',
    '0 minutes',
    '0:00',
    '26:00',
  ])
})

test('typing previews how the text was read; leaving rewrites it, fires change once, and the form gets the seconds', async ({ page, renderScenario }) => {
  await renderScenario(`<form id="form"><c2-duration-input name="estimate" aria-label="Estimate"></c2-duration-input><button>Save</button></form>`)
  await watch(field(page), 'change')
  await expect(input(field(page))).toHaveAttribute('placeholder', 'e.g. 1h 30m')
  await input(field(page)).fill('90m')
  expect(await value(field(page))).toBe(5400)
  await expect(preview(field(page))).toHaveText('= 1 hour, 30 minutes')
  // The preview describes the text field.
  const describedBy = await input(field(page)).getAttribute('aria-describedby')
  expect(describedBy?.split(' ')).toContain('preview')
  await page.keyboard.press('Tab')
  await expect(input(field(page))).toHaveValue('1h 30m')
  await expect(preview(field(page))).toBeHidden()
  expect(await events(field(page))).toHaveLength(1)
  const data = await page.evaluate(() => [...new FormData(document.getElementById('form') as HTMLFormElement).entries()])
  expect(data).toEqual([['estimate', '5400']])
  await accessible(page)
})

test('step rounds on leaving; Arrow Up and Down move along the step grid within min and max', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-duration-input aria-label="Break" step="900" max="5400"></c2-duration-input><button>Next</button>`)
  await watch(field(page), 'input')
  await input(field(page)).fill('1h20')
  await page.keyboard.press('Tab')
  await expect(input(field(page))).toHaveValue('1h 15m')
  expect(await value(field(page))).toBe(4500)
  await input(field(page)).focus()
  await page.keyboard.press('ArrowUp')
  await expect(input(field(page))).toHaveValue('1h 30m')
  // At max, another step stays put and fires nothing.
  const before = (await events(field(page))).length
  await page.keyboard.press('ArrowUp')
  await expect(input(field(page))).toHaveValue('1h 30m')
  expect((await events(field(page))).length).toBe(before)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(input(field(page))).toHaveValue('1h')
  expect(await value(field(page))).toBe(3600)
})

test('rounding on leaving fires input and change, so a binding that listens to input gets the rounded value', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-duration-input id="typed" aria-label="Typed" step="900"></c2-duration-input><c2-duration-input id="given" aria-label="Given" step="900" value="5410"></c2-duration-input><button>Next</button>`,
  )
  // What a v-model or ngModel binding sees: the value at each event.
  await page.evaluate(() =>
    document.querySelectorAll('c2-duration-input').forEach((element) => {
      const seen: string[] = []
      for (const name of ['input', 'change'])
        element.addEventListener(name, () => {
          seen.push(`${name}:${(element as HTMLElement & { value: number | null }).value}`)
          element.setAttribute('data-seen', JSON.stringify(seen))
        })
    }),
  )
  const seen = async (selector: string) => JSON.parse((await page.locator(selector).getAttribute('data-seen')) ?? '[]') as string[]
  await input(field(page, '#typed')).fill('1h 31m')
  await page.keyboard.press('Tab')
  await expect(input(field(page, '#typed'))).toHaveValue('1h 30m')
  const typed = await seen('#typed')
  // The last input carries the rounded value, before the change.
  expect(typed.filter((entry) => entry.startsWith('input:')).at(-1)).toBe('input:5400')
  expect(typed.at(-1)).toBe('change:5400')
  // Left without an edit: the given 5410 rounds to 5400, and both events say so.
  await input(field(page, '#given')).focus()
  await page.keyboard.press('Tab')
  await expect(input(field(page, '#given'))).toHaveValue('1h 30m')
  expect(await seen('#given')).toEqual(['input:5400', 'change:5400'])
})

test('a value given as a property string or an empty string is read as seconds or as no value', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-duration-input aria-label="Estimate" required min="600" value="5400"></c2-duration-input>`)
  const state = () =>
    field(page).evaluate((element) => {
      const control = element as HTMLElement & { value: unknown; min: unknown; validity: ValidityState }
      return { value: control.value, min: control.min, valueMissing: control.validity.valueMissing, rangeUnderflow: control.validity.rangeUnderflow }
    })
  // Angular's writeValue(null) assigns an empty string: no value, so required reports it and no range flag is set.
  await field(page).evaluate((element) => ((element as HTMLElement & { value: unknown }).value = ''))
  await expect(input(field(page))).toHaveValue('')
  expect(await state()).toEqual({ value: null, min: 600, valueMissing: true, rangeUnderflow: false })
  // Svelte 5 or a server renderer hands over strings.
  await field(page).evaluate((element) => Object.assign(element, { value: '5400', min: '' }))
  await expect(input(field(page))).toHaveValue('1h 30m')
  expect(await state()).toEqual({ value: 5400, min: undefined, valueMissing: false, rangeUnderflow: false })
})

test('Arrow keys step by one unit without a step, and never below zero', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-duration-input aria-label="Wait" unit="h"></c2-duration-input>`)
  await input(field(page)).focus()
  await page.keyboard.press('ArrowUp')
  await expect(input(field(page))).toHaveValue('1h')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  // Zero is written in minutes, the smallest unit a person usually types.
  await expect(input(field(page))).toHaveValue('0m')
  expect(await value(field(page))).toBe(0)
  // A bare number is read in `unit`.
  await input(field(page)).fill('3')
  await page.keyboard.press('Tab')
  expect(await value(field(page))).toBe(10800)
})

test('format, largest-unit and day-hours decide how the value is written', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-duration-input id="long" aria-label="Long" format="long" value="5400"></c2-duration-input>
    <c2-duration-input id="clock" aria-label="Clock" format="clock" value="5400"></c2-duration-input>
    <c2-duration-input id="hours" aria-label="Hours" largest-unit="h" value="172800"></c2-duration-input>
    <c2-duration-input id="workday" aria-label="Time spent" day-hours="8"></c2-duration-input>
    <button>Next</button>`)
  await expect(input(field(page, '#long'))).toHaveValue('1 hour, 30 minutes')
  await expect(input(field(page, '#clock'))).toHaveValue('1:30')
  await expect(input(field(page, '#hours'))).toHaveValue('48h')
  await input(field(page, '#workday')).fill('1.5d')
  await expect(preview(field(page, '#workday'))).toHaveText('= 1 day, 4 hours')
  await page.keyboard.press('Tab')
  await expect(input(field(page, '#workday'))).toHaveValue('1d 4h')
  expect(await value(field(page, '#workday'))).toBe(43200)
  // Setting the value from script rewrites the text.
  await field(page, '#long').evaluate((element) => ((element as HTMLElement & { value: number }).value = 60))
  await expect(input(field(page, '#long'))).toHaveValue('1 minute')
})

test('text that cannot be read and a value over max block the submit with their message once the field is left', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form id="form"><c2-duration-input name="break" aria-label="Break" max="3600" required></c2-duration-input><button>Save</button></form>`,
  )
  await page.evaluate(() =>
    document.getElementById('form')!.addEventListener('submit', (event) => (event.preventDefault(), (document.body.dataset.submitted = 'yes'))),
  )
  const validity = () =>
    field(page).evaluate((element) => {
      const state = (element as HTMLElement & { validity: ValidityState }).validity
      return { valid: state.valid, badInput: state.badInput, valueMissing: state.valueMissing, rangeOverflow: state.rangeOverflow }
    })
  expect((await validity()).valueMissing).toBe(true)
  await input(field(page)).fill('about two hours')
  expect(await value(field(page))).toBeNull()
  expect((await validity()).badInput).toBe(true)
  // No message while typing.
  await expect(message(field(page))).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(message(field(page))).toHaveText('Enter a duration like 1h 30m')
  await expect(input(field(page))).toHaveAttribute('aria-invalid', 'true')
  await expect(input(field(page))).toHaveValue('about two hours')
  // The message is linked to the text field.
  expect((await input(field(page)).getAttribute('aria-describedby'))?.split(' ')).toContain('supporting-text')
  await accessible(page)
  await input(field(page)).fill('2h')
  await page.keyboard.press('Tab')
  await expect(message(field(page))).toHaveText('Enter 1h or less')
  expect((await validity()).rangeOverflow).toBe(true)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('body')).not.toHaveAttribute('data-submitted', 'yes')
  await input(field(page)).fill('45m')
  await page.keyboard.press('Tab')
  await expect(message(field(page))).toHaveCount(0)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-submitted', 'yes')
})

test('a failed submit shows the message of a field never visited; reset restores the first value; disabled submits nothing', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<form id="form">
    <c2-duration-input id="a" name="a" aria-label="Estimate" required></c2-duration-input>
    <c2-duration-input id="b" name="b" aria-label="Spent" value="600"></c2-duration-input>
    <c2-duration-input id="c" name="c" aria-label="Off" value="60" disabled></c2-duration-input>
    <button>Save</button></form>`)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(message(field(page, '#a'))).toHaveText('Enter a duration')
  await input(field(page, '#b')).fill('3h')
  await page.keyboard.press('Tab')
  await page.evaluate(() => (document.getElementById('form') as HTMLFormElement).reset())
  await expect(input(field(page, '#b'))).toHaveValue('10m')
  await expect(message(field(page, '#a'))).toHaveCount(0)
  const data = await page.evaluate(() => [...new FormData(document.getElementById('form') as HTMLFormElement).entries()])
  expect(data).toEqual([
    ['a', ''],
    ['b', '600'],
  ])
})

test('a translation reads its own unit words and writes the long format in its language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-duration-input aria-label="Durée" format="long"></c2-duration-input><button>Suivant</button></div>`)
  await expect(input(field(page))).toHaveAttribute('placeholder', 'ex. 1 h 30 min')
  await input(field(page)).fill('2 heures 15 mn')
  expect(await value(field(page))).toBe(8100)
  await page.keyboard.press('Tab')
  // Intl separates the number and the unit with a no-break space.
  await expect(input(field(page))).toHaveValue(/^2\sheures et 15\sminutes$/)
  // The written text reads back to the same value.
  await input(field(page)).focus()
  await page.keyboard.press('Tab')
  expect(await value(field(page))).toBe(8100)
  await input(field(page)).fill('n’importe quoi')
  await page.keyboard.press('Tab')
  await expect(message(field(page))).toHaveText('Saisissez une durée comme 1 h 30 min')
})
