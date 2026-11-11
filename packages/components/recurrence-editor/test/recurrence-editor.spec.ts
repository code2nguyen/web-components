import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

type Rule = Record<string, unknown>
type Api = {
  parseRRule(text: string): Rule | null
  formatRRule(rule: Rule): string
  parseCron(text: string): Rule | null
  formatCron(rule: Rule): string | null
  occurrences(rule: Rule, options: Record<string, unknown>): { year: number; month: number; day: number; hour: number; minute: number }[]
  describeRecurrence(rule: Rule | null, options?: Record<string, unknown>): string
}

const editor = (page: Page) => page.locator('c2-recurrence-editor')
const value = (locator: Locator) => locator.evaluate((element) => (element as HTMLElement & { value: string }).value)
const summary = (locator: Locator) => locator.locator('.summary')
const weekday = (locator: Locator, day: string) => locator.locator(`.weekday[data-day="${day}"]`)
const numberInput = (locator: Locator, part: string) => locator.locator(`c2-number-input[data-part="${part}"] input`)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]') as unknown[]

/** Opens one of the editor's selects and picks an option. */
async function choose(locator: Locator, part: string, option: string) {
  await locator.locator(`c2-select[data-part="${part}"]`).click()
  await locator.locator(`c2-select[data-part="${part}"] c2-list-item[value="${option}"]`).click()
}

test('parseRRule, formatRRule, parseCron, formatCron and occurrences agree on the rules the editor shows', async ({ page, renderScenario }) => {
  await renderScenario('')
  const results = await page.evaluate(() => {
    const api = (window as unknown as { recurrenceApi: Api }).recurrenceApi
    const day = (clock: { year: number; month: number; day: number }) => `${clock.year}-${clock.month}-${clock.day}`
    const rrules = [
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5',
      'RRULE:FREQ=MONTHLY;BYDAY=3TU',
      'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;UNTIL=20270301T000000Z',
      'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1',
      'FREQ=DAILY;BYYEARDAY=4',
      'DTSTART:20261111T090000\nRRULE:FREQ=HOURLY;INTERVAL=6;BYMINUTE=15',
      'FREQ=YEARLY;BYMONTHDAY=15',
      'FREQ=MONTHLY;BYDAY=1FR;BYMONTHDAY=13',
      'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;UNTIL=20270831',
      'FREQ=HOURLY;BYHOUR=9;BYMINUTE=0',
    ]
    return {
      rrules: rrules.map((text) => {
        const rule = api.parseRRule(text)!
        return [api.formatRRule(rule), api.formatCron(rule), api.occurrences(rule, { start: '2026-11-11T09:00', limit: 3 }).map(day)]
      }),
      crons: ['*/15 * * * *', '30 9 * * 1-5', '0 9 1 */3 *', '0 0 25 12 *', '@weekly', '0 9 * * MON,FRI', '5 */4 * * *', '1 2 3 4 5', '0 */5 * * *'].map(
        (text) => {
          const rule = api.parseCron(text)
          return rule ? [api.formatRRule(rule), api.formatCron(rule)] : null
        },
      ),
      unreadable: [api.parseRRule(''), api.parseRRule('FREQ=SECONDLY'), api.parseRRule('hello'), api.parseCron('* * *')],
      sentences: [
        api.describeRecurrence(api.parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10')),
        api.describeRecurrence(api.parseRRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=30')),
        api.describeRecurrence(api.parseRRule('FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20271231')),
        api.describeRecurrence(api.parseRRule('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15')),
        api.describeRecurrence(api.parseRRule('FREQ=DAILY;COUNT=1')),
        api.describeRecurrence(null),
      ],
    }
  })
  expect(results.rrules).toEqual([
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5', null, ['2026-11-11', '2026-11-23', '2026-11-25']],
    ['FREQ=MONTHLY;BYDAY=3TU', null, ['2026-11-17', '2026-12-15', '2027-1-19']],
    ['FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20270301', null, ['2026-11-27', '2026-12-25', '2027-1-29']],
    ['FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1', null, ['2027-2-28', '2028-2-29', '2029-2-28']],
    // A part the editor does not edit is kept as written.
    ['FREQ=DAILY;BYYEARDAY=4', null, ['2026-11-11', '2026-11-12', '2026-11-13']],
    ['FREQ=HOURLY;INTERVAL=6;BYMINUTE=15', '15 */6 * * *', ['2026-11-11', '2026-11-11', '2026-11-11']],
    // Without BYMONTH a yearly BYMONTHDAY means every month: kept as written rather than read as one month.
    ['FREQ=YEARLY;BYMONTHDAY=15', null, ['2026-11-11', '2027-11-11', '2028-11-11']],
    ['FREQ=MONTHLY;BYDAY=1FR;BYMONTHDAY=13', null, ['2026-12-4', '2027-1-1', '2027-2-5']],
    // A rule with a time writes UNTIL as a date-time.
    ['FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;UNTIL=20270831T235959', null, ['2026-11-16', '2026-11-23', '2026-11-30']],
    // Cron cannot narrow an hourly step to one hour.
    ['FREQ=HOURLY;BYHOUR=9;BYMINUTE=0', null, ['2026-11-11', '2026-11-12', '2026-11-13']],
  ])
  expect(results.crons).toEqual([
    ['FREQ=MINUTELY;INTERVAL=15', '*/15 * * * *'],
    ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=30', '30 9 * * 1-5'],
    ['FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0', '0 9 1 */3 *'],
    ['FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25;BYHOUR=0;BYMINUTE=0', '0 0 25 12 *'],
    ['FREQ=WEEKLY;BYDAY=SU;BYHOUR=0;BYMINUTE=0', '0 0 * * 0'],
    ['FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9;BYMINUTE=0', '0 9 * * 1,5'],
    ['FREQ=HOURLY;INTERVAL=4;BYMINUTE=5', '5 */4 * * *'],
    null,
    // Every 5 hours does not divide the day: cron would restart at midnight.
    null,
  ])
  expect(results.unreadable).toEqual([null, null, null, null])
  expect(results.sentences).toEqual([
    'Every 2 weeks on Monday and Wednesday, 10 times',
    'Every weekday at 9:30 AM',
    'Every month on the last Friday, until Dec 31, 2027',
    'Every year on March 15',
    'Every day, once',
    'Does not repeat',
  ])
})

test('an empty value takes the default rule: weekly on the start’s weekday, in a named group that passes axe', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor start="2026-11-11"></c2-recurrence-editor>')
  await expect(editor(page).getByRole('group', { name: 'Recurrence' })).toBeVisible()
  expect(await value(editor(page))).toBe('FREQ=WEEKLY;BYDAY=WE')
  await expect(weekday(editor(page), 'WE')).toHaveAttribute('aria-pressed', 'true')
  await expect(weekday(editor(page), 'MO')).toHaveAttribute('aria-pressed', 'false')
  await expect(summary(editor(page))).toHaveText('Every week on Wednesday')
  await expect(editor(page).locator('.occurrence')).toHaveText([
    'Wed, Nov 11, 2026',
    'Wed, Nov 18, 2026',
    'Wed, Nov 25, 2026',
    'Wed, Dec 2, 2026',
    'Wed, Dec 9, 2026',
  ])
  // The end row is there, set to never.
  await expect(editor(page).locator('c2-select[data-part="end"]')).toHaveJSProperty('value', ['never'])
  await accessible(page)
})

test('reads a value: interval, weekdays, end and the next occurrences', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor start="2026-11-11" value="RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5"></c2-recurrence-editor>')
  await expect(numberInput(editor(page), 'interval')).toHaveValue('2')
  await expect(numberInput(editor(page), 'count')).toHaveValue('5')
  await expect(weekday(editor(page), 'MO')).toHaveAttribute('aria-pressed', 'true')
  await expect(summary(editor(page))).toHaveText('Every 2 weeks on Monday and Wednesday, 5 times')
  await expect(editor(page).locator('.occurrence')).toHaveCount(5)
  // An outside change is read again.
  await props(editor(page), { value: 'FREQ=DAILY;UNTIL=20261113' })
  await expect(summary(editor(page))).toHaveText('Every day, until Nov 13, 2026')
  await expect(editor(page).locator('.occurrence')).toHaveCount(3)
})

test('weekday toggles: click and keyboard edit the value and fire input and change; the last day stays', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor start="2026-11-11" value="FREQ=WEEKLY;BYDAY=WE"></c2-recurrence-editor>')
  await watch(editor(page), 'change')
  await weekday(editor(page), 'MO').click()
  expect(await value(editor(page))).toBe('FREQ=WEEKLY;BYDAY=MO,WE')
  expect(await events(editor(page))).toHaveLength(1)

  // Arrow keys move between the toggles; Space toggles.
  await weekday(editor(page), 'MO').focus()
  await page.keyboard.press('ArrowRight')
  await expect(weekday(editor(page), 'TU')).toBeFocused()
  await page.keyboard.press('End')
  await expect(weekday(editor(page), 'SU')).toBeFocused()
  await page.keyboard.press('Space')
  expect(await value(editor(page))).toBe('FREQ=WEEKLY;BYDAY=MO,WE,SU')

  await weekday(editor(page), 'MO').click()
  await weekday(editor(page), 'SU').click()
  await weekday(editor(page), 'WE').click()
  expect(await value(editor(page))).toBe('FREQ=WEEKLY;BYDAY=WE')
  const fired = (await events(editor(page))).length
  // Clicking the last day off changes nothing and fires nothing.
  await weekday(editor(page), 'WE').click()
  await expect(weekday(editor(page), 'WE')).toHaveAttribute('aria-pressed', 'true')
  expect(await events(editor(page))).toHaveLength(fired)
})

test('week-start puts Sunday first', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor start="2026-11-11" week-start="SU"></c2-recurrence-editor>')
  await expect(editor(page).locator('.weekday').first()).toHaveAttribute('data-day', 'SU')
})

test('frequency, monthly day modes and the end are picked from the selects', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor start="2026-11-11"></c2-recurrence-editor>')
  await watch(editor(page), 'input')
  await choose(editor(page), 'frequency', 'monthly')
  expect(await value(editor(page))).toBe('FREQ=MONTHLY;BYMONTHDAY=11')
  await expect(summary(editor(page))).toHaveText('Every month on day 11')
  expect((await events(editor(page))).length).toBeGreaterThan(0)

  await choose(editor(page), 'mode', 'weekday')
  expect(await value(editor(page))).toBe('FREQ=MONTHLY;BYDAY=2WE')
  await choose(editor(page), 'ordinal', '-1')
  await choose(editor(page), 'weekday', 'FR')
  await expect(summary(editor(page))).toHaveText('Every month on the last Friday')
  await choose(editor(page), 'mode', 'last')
  expect(await value(editor(page))).toBe('FREQ=MONTHLY;BYMONTHDAY=-1')

  await choose(editor(page), 'end', 'count')
  expect(await value(editor(page))).toBe('FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=10')
  await choose(editor(page), 'end', 'until')
  expect(await value(editor(page))).toBe('FREQ=MONTHLY;BYMONTHDAY=-1;UNTIL=20270831')

  await choose(editor(page), 'frequency', 'yearly')
  expect(await value(editor(page))).toBe('FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=-1;UNTIL=20270831')
  await choose(editor(page), 'month', '2')
  await expect(summary(editor(page))).toHaveText('Every year on the last day of February, until Aug 31, 2027')
})

test('typing the interval and the count edits the value as it is typed', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor start="2026-11-11" value="FREQ=DAILY;COUNT=10"></c2-recurrence-editor>')
  await watch(editor(page), 'input')
  await numberInput(editor(page), 'interval').fill('3')
  expect(await value(editor(page))).toBe('FREQ=DAILY;INTERVAL=3;COUNT=10')
  expect((await events(editor(page))).length).toBeGreaterThan(0)
  await watch(editor(page), 'change')
  await numberInput(editor(page), 'interval').fill('4')
  await numberInput(editor(page), 'interval').press('Tab')
  expect(await events(editor(page))).toHaveLength(1)
  await numberInput(editor(page), 'interval').fill('3')
  await numberInput(editor(page), 'count').fill('2')
  await expect(summary(editor(page))).toHaveText('Every 3 days, 2 times')
  await expect(editor(page).locator('.occurrence')).toHaveText(['Wed, Nov 11, 2026', 'Sat, Nov 14, 2026'])
  // Text that is not a whole number leaves the rule as it was.
  await numberInput(editor(page), 'interval').fill('0')
  expect(await value(editor(page))).toBe('FREQ=DAILY;INTERVAL=3;COUNT=2')
})

test('cron format: reads and writes cron, offers only what cron can say, and shows the time row', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor format="cron" start="2026-11-11" value="30 9 * * 1-5"></c2-recurrence-editor>')
  await expect(summary(editor(page))).toHaveText('Every weekday at 9:30 AM')
  await expect(editor(page).locator('c2-time-input')).toHaveJSProperty('value', '09:30')
  await expect(editor(page).locator('c2-select[data-part="end"]')).toHaveCount(0)
  await expect(editor(page).locator('c2-select[data-part="interval"]')).toHaveCount(0)
  await weekday(editor(page), 'FR').click()
  expect(await value(editor(page))).toBe('30 9 * * 1-4')
  expect(await editor(page).evaluate((element) => (element as HTMLElement & { toRRule(): string }).toRRule())).toBe(
    'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;BYHOUR=9;BYMINUTE=30',
  )

  await choose(editor(page), 'frequency', 'minutely')
  expect(await value(editor(page))).toBe('* * * * *')
  await choose(editor(page), 'interval', '15')
  expect(await value(editor(page))).toBe('*/15 * * * *')
  await expect(editor(page).locator('c2-time-input')).toHaveCount(0)

  // A cron step counts from minute 0, not from the start's minute.
  await expect(editor(page).locator('.occurrence').first()).toHaveText('Wed, Nov 11, 2026, 12:00 AM')

  await choose(editor(page), 'frequency', 'hourly')
  await expect(numberInput(editor(page), 'minute')).toHaveValue('0')
  await numberInput(editor(page), 'minute').fill('45')
  expect(await value(editor(page))).toBe('45 * * * *')
  await expect(summary(editor(page))).toHaveText('Every hour at 45 minutes past the hour')

  await choose(editor(page), 'frequency', 'monthly')
  await expect(editor(page).locator('c2-select[data-part="mode"]')).toHaveCount(0)
  expect(await value(editor(page))).toMatch(/^\d+ \d+ 11 \* \*$/)
})

test('an RRULE editor reports cron through its cron getter, or null', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor with-time start="2026-11-11T08:00" value="FREQ=WEEKLY;BYDAY=MO;BYHOUR=8;BYMINUTE=0"></c2-recurrence-editor>')
  const cron = () => editor(page).evaluate((element) => (element as HTMLElement & { cron: string | null }).cron)
  expect(await cron()).toBe('0 8 * * 1')
  await expect(editor(page).locator('c2-time-input')).toHaveJSProperty('value', '08:00')
  await numberInput(editor(page), 'interval').fill('2')
  expect(await cron()).toBeNull()
})

test('none: "Does not repeat" is an empty value, required asks for a rule, the form receives the value', async ({ page, renderScenario }) => {
  await renderScenario(
    '<form><c2-recurrence-editor name="repeat" required frequencies="none daily weekly" start="2026-11-11"></c2-recurrence-editor></form><button>After</button>',
  )
  expect(await value(editor(page))).toBe('')
  await expect(summary(editor(page))).toHaveText('Does not repeat')
  await expect(editor(page).locator('.occurrences')).toHaveCount(0)
  await expect(editor(page).locator('c2-number-input')).toHaveCount(0)
  const form = page.locator('form')
  expect(await form.evaluate((element) => (element as HTMLFormElement).checkValidity())).toBe(false)
  expect(await editor(page).evaluate((element) => (element as HTMLElement & { validationMessage: string }).validationMessage)).toBe(
    'Choose how often it repeats',
  )

  await choose(editor(page), 'frequency', 'daily')
  expect(await form.evaluate((element) => (element as HTMLFormElement).checkValidity())).toBe(true)
  expect(await form.evaluate((element) => new FormData(element as HTMLFormElement).get('repeat'))).toBe('FREQ=DAILY')

  await editor(page).evaluate((element) => element.setAttribute('disabled', ''))
  expect(await form.evaluate((element) => new FormData(element as HTMLFormElement).get('repeat'))).toBeNull()
  await expect(editor(page).locator('c2-select[data-part="frequency"]')).toHaveJSProperty('disabled', true)

  await editor(page).evaluate((element) => element.removeAttribute('disabled'))
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  expect(await value(editor(page))).toBe('')
})

test('renderOccurrence draws each occurrence; the footer slot shows only with content', async ({ page, renderScenario }) => {
  await renderScenario('<c2-recurrence-editor start="2026-11-11" value="FREQ=DAILY" preview-count="2"></c2-recurrence-editor>')
  await expect(editor(page).locator('.footer')).toBeHidden()
  await editor(page).evaluate(async (element) => {
    const host = element as HTMLElement & { renderOccurrence: (context: { index: number; date: Date }) => string; updateComplete: Promise<boolean> }
    host.renderOccurrence = ({ index, date }) => `#${index + 1} ${date.getDate()}`
    const button = document.createElement('button')
    button.slot = 'footer'
    button.textContent = 'Save'
    element.append(button)
    await host.updateComplete
  })
  await expect(editor(page).locator('.occurrence')).toHaveText(['#1 11', '#2 12'])
  await expect(editor(page).locator('.footer')).toBeVisible()
  await props(editor(page), { previewCount: 0 })
  await expect(editor(page).locator('.occurrences')).toHaveCount(0)
})

test('speaks the language of the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div lang="fr"><c2-recurrence-editor start="2026-11-11" value="FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=3"></c2-recurrence-editor></div>',
  )
  await expect(summary(editor(page))).toHaveText('Toutes les 2 semaines le lundi et mercredi, 3 fois')
  await expect(editor(page).getByRole('group', { name: 'Récurrence' })).toBeVisible()
  await expect(weekday(editor(page), 'MO')).toHaveAccessibleName('lundi')
})
