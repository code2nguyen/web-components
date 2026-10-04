import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const plan = [
  { id: 'design', label: 'Design' },
  { id: 'ia', label: 'Information architecture', start: '2026-09-28', end: '2026-10-02', progress: 0.8, parent: 'design' },
  { id: 'vis', label: 'Visual design', start: '2026-10-05', end: '2026-10-16', progress: 0.35, parent: 'design', dependencies: ['ia'] },
  { id: 'review', label: 'Design review', start: '2026-10-16', milestone: true, dependencies: ['vis'] },
]

const dataChart = (attributes = '') => `<c2-gantt aria-label="Plan" today="2026-10-01" ${attributes} tasks='${JSON.stringify(plan)}'></c2-gantt>`

const markupChart = (attributes = '') => `<c2-gantt aria-label="Plan" today="2026-10-01" ${attributes}>
  <c2-gantt-task task-id="design" label="Design">
    <c2-gantt-task task-id="ia" start="2026-09-28" end="2026-10-02" progress="0.8">Information architecture</c2-gantt-task>
    <c2-gantt-task task-id="vis" start="2026-10-05" end="2026-10-16" progress="0.35" dependencies="ia">Visual design</c2-gantt-task>
  </c2-gantt-task>
  <c2-gantt-task task-id="review" start="2026-10-16" milestone dependencies="vis">Design review</c2-gantt-task>
</c2-gantt>`

// Rows carry their semantics through ElementInternals-free shadow markup, so they are found by `data-id`.
const rowOf = (page: Page, id: string) => page.locator(`c2-gantt .row[data-id="${id}"]`)
const barOf = (page: Page, id: string) => page.locator(`c2-gantt .bar[data-id="${id}"]`)
const widthOf = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!.width

const firstWeekTick = (page: Page) => page.locator('c2-gantt .tick.minor').first()

test('renders the tasks as a tree grid with bars sized by their days', async ({ page, renderScenario }) => {
  await renderScenario(dataChart())
  const host = page.locator('c2-gantt')
  await expect(host).toHaveHostAria('role', 'treegrid')
  await expect(page.locator('c2-gantt .row')).toHaveCount(4)
  await expect(rowOf(page, 'design')).toHaveAttribute('aria-expanded', 'true')
  await expect(rowOf(page, 'ia')).toHaveAttribute('aria-level', '2')
  await expect(rowOf(page, 'vis')).toHaveAccessibleName('Visual design, Oct 5, 2026 to Oct 16, 2026, 12 days, 35% complete, after Information architecture')
  await expect(rowOf(page, 'review')).toHaveAccessibleName('Design review, milestone, Oct 16, 2026, after Visual design')

  // Week scale: 16px a day, end inclusive.
  expect(await widthOf(page, 'c2-gantt .bar[data-id="ia"]')).toBeCloseTo(5 * 16, 0)
  expect(await widthOf(page, 'c2-gantt .bar[data-id="vis"]')).toBeCloseTo(12 * 16, 0)
  // The group's summary spans its children: 28 Sep to 16 Oct.
  expect(await widthOf(page, 'c2-gantt .summary[data-id="design"]')).toBeCloseTo(19 * 16, 0)
  await expect(page.locator('c2-gantt .milestone[data-id="review"]')).toBeVisible()
  await expect(page.locator('c2-gantt .links path.head')).toHaveCount(2)
  await expect(rowOf(page, 'ia').locator('.cell-days')).toHaveText('5')
  await accessible(page)
})

test('markup mode reads nested c2-gantt-task children and follows their changes', async ({ page, renderScenario }) => {
  await renderScenario(markupChart())
  await expect(page.locator('c2-gantt .row')).toHaveCount(4)
  await expect(rowOf(page, 'design')).toHaveAttribute('aria-expanded', 'true')
  await expect(rowOf(page, 'ia')).toHaveAttribute('aria-level', '2')
  await expect(rowOf(page, 'ia').locator('.label')).toHaveText('Information architecture')
  expect(await widthOf(page, 'c2-gantt .bar[data-id="vis"]')).toBeCloseTo(12 * 16, 0)

  // An attribute change on a child re-lays the chart out.
  await page.locator('c2-gantt-task[task-id="vis"]').evaluate((element) => element.setAttribute('end', '2026-10-09'))
  await expect.poll(() => widthOf(page, 'c2-gantt .bar[data-id="vis"]')).toBeCloseTo(5 * 16, 0)

  // So does a task added later, and its text.
  await page.locator('c2-gantt-task[task-id="design"]').evaluate((element) => {
    const task = document.createElement('c2-gantt-task')
    task.setAttribute('task-id', 'copy')
    task.setAttribute('start', '2026-10-12')
    task.setAttribute('end', '2026-10-14')
    task.textContent = 'Copywriting'
    element.append(task)
  })
  await expect(page.locator('c2-gantt .row')).toHaveCount(5)
  await expect(rowOf(page, 'copy').locator('.label')).toHaveText('Copywriting')
  await page.locator('c2-gantt-task[task-id="copy"]').evaluate((element) => (element.textContent = 'Copy'))
  await expect(rowOf(page, 'copy').locator('.label')).toHaveText('Copy')

  await page.locator('c2-gantt-task[task-id="copy"]').evaluate((element) => element.remove())
  await expect(page.locator('c2-gantt .row')).toHaveCount(4)
})

test('a tasks array wins over children, and null hands control back to them', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => message.type() === 'warning' && warnings.push(message.text()))
  await renderScenario(`<c2-gantt aria-label="Plan" tasks='[{"id":"solo","label":"Solo","start":"2026-10-01","end":"2026-10-02"}]'>
    <c2-gantt-task task-id="child" start="2026-10-01">Child</c2-gantt-task>
  </c2-gantt>`)
  await expect(page.locator('c2-gantt .row')).toHaveCount(1)
  await expect(rowOf(page, 'solo')).toBeVisible()
  expect(warnings.some((text) => text.includes('children are ignored'))).toBe(true)

  await props(page.locator('c2-gantt'), { tasks: null })
  await expect(page.locator('c2-gantt .row')).toHaveCount(1)
  await expect(rowOf(page, 'child')).toBeVisible()
})

test('weeks start on the locale’s first day unless week-start overrides it', async ({ page, renderScenario }) => {
  const supported = await page.evaluate(() => {
    const locale = new Intl.Locale('en-US') as unknown as { getWeekInfo?: () => unknown; weekInfo?: unknown }
    return typeof locale.getWeekInfo === 'function' || locale.weekInfo !== undefined
  })

  // 2026-09-27 is a Sunday, 2026-09-28 a Monday, 2026-09-26 a Saturday.
  await renderScenario(dataChart('locale="en-GB"'))
  await expect(firstWeekTick(page)).toHaveText('28–4')

  await renderScenario(dataChart('locale="en-GB" week-start="sunday"'))
  await expect(firstWeekTick(page)).toHaveText('27–3')

  await renderScenario(dataChart('locale="en-US" week-start="1"'))
  await expect(firstWeekTick(page)).toHaveText('28–4')

  test.skip(!supported, 'This engine has no Intl week info, so every locale falls back to Monday')
  await renderScenario(dataChart('locale="en-US"'))
  await expect(firstWeekTick(page)).toHaveText('27–3')
  await renderScenario(dataChart('locale="ar-EG" week-start="locale"'))
  await expect(page.locator('c2-gantt .tick.minor').first()).not.toHaveText('28–4')
})

test('the weekend follows the locale, and the weekend attribute overrides it', async ({ page, renderScenario }) => {
  await renderScenario(dataChart('locale="en-GB"'))
  // Monday 28 Sep to Sunday 25 Oct: four weeks, so four Saturdays and four Sundays.
  await expect(page.locator('c2-gantt .weekend')).toHaveCount(8)
  const count = 8

  await props(page.locator('c2-gantt'), { weekend: '5' })
  await expect(page.locator('c2-gantt .weekend')).toHaveCount(count / 2)

  await props(page.locator('c2-gantt'), { weekend: '' })
  await expect(page.locator('c2-gantt .weekend')).toHaveCount(0)
})

test('clicking a bar fires task-click and selects it; cancelling task-click keeps the selection', async ({ page, renderScenario }) => {
  await renderScenario(dataChart())
  const host = page.locator('c2-gantt')
  await watch(host, 'selection-change')
  await pointerClick(barOf(page, 'vis'))
  await expect(host).toHaveJSProperty('selected', 'vis')
  await expect(rowOf(page, 'vis')).toHaveAttribute('aria-selected', 'true')
  await expect(rowOf(page, 'vis')).toBeFocused()
  await expect(barOf(page, 'vis')).toHaveClass(/selected/)
  await expect(page.locator('c2-gantt .links path.active')).toHaveCount(4)
  const events = JSON.parse((await host.getAttribute('data-events'))!)
  expect(events).toEqual([{ value: 'vis', task: plan[2] }])

  await host.evaluate((element) => element.addEventListener('task-click', (event) => event.preventDefault()))
  await pointerClick(barOf(page, 'ia'))
  await expect(host).toHaveJSProperty('selected', 'vis')
})

test('selection-change carries the element in markup mode, and does not bubble', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="outer">${markupChart()}</div>`)
  const result = page.evaluate(
    () =>
      new Promise<{ tag: string; bubbled: boolean }>((resolve) => {
        let bubbled = false
        document.querySelector('#outer')!.addEventListener('selection-change', () => (bubbled = true))
        document.querySelector('c2-gantt')!.addEventListener('selection-change', (event) => {
          const detail = (event as CustomEvent<{ element?: Element }>).detail
          setTimeout(() => resolve({ tag: detail.element?.getAttribute('task-id') ?? '', bubbled }))
        })
      }),
  )
  await pointerClick(barOf(page, 'ia'))
  expect(await result).toEqual({ tag: 'ia', bubbled: false })
})

test('the keyboard walks the rows, opens and closes groups and selects', async ({ page, renderScenario }) => {
  await renderScenario(dataChart())
  const host = page.locator('c2-gantt')
  await watch(host, 'group-toggle')
  await rowOf(page, 'design').focus()

  await page.keyboard.press('ArrowDown')
  await expect(rowOf(page, 'ia')).toBeFocused()
  await expect(page.locator('c2-gantt .tooltip')).toContainText('Information architecture')
  await page.keyboard.press('End')
  await expect(rowOf(page, 'review')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(rowOf(page, 'design')).toBeFocused()

  await page.keyboard.press('ArrowLeft')
  await expect(rowOf(page, 'design')).toHaveAttribute('aria-expanded', 'false')
  await expect(rowOf(page, 'ia')).toHaveCount(0)
  await expect(host).toHaveJSProperty('collapsed', ['design'])
  await page.keyboard.press('ArrowDown')
  await expect(rowOf(page, 'review')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  await expect(rowOf(page, 'ia')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(rowOf(page, 'ia')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(rowOf(page, 'design')).toBeFocused()
  await expect(host).toHaveAttribute('data-events', '[{"id":"design","expanded":false},{"id":"design","expanded":true}]')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('selected', 'ia')
})

test('one row holds the roving tabindex', async ({ page, renderScenario, tab }) => {
  await renderScenario(`${dataChart('selected="vis"')}<button type="button">After</button>`)
  await expect(page.locator('c2-gantt .row[tabindex="0"]')).toHaveCount(1)
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await tab()
  await expect(rowOf(page, 'vis')).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('clicking the chevron collapses a group', async ({ page, renderScenario }) => {
  await renderScenario(markupChart())
  await pointerClick(rowOf(page, 'design').locator('.toggle'))
  await expect(page.locator('c2-gantt .row')).toHaveCount(2)
  await expect(page.locator('c2-gantt .summary[data-id="design"]')).toBeVisible()
  await expect(page.locator('c2-gantt .links path.head')).toHaveCount(0)
})

test('the scale changes the width of a day', async ({ page, renderScenario }) => {
  await renderScenario(dataChart('scale="day"'))
  expect(await widthOf(page, 'c2-gantt .bar[data-id="ia"]')).toBeCloseTo(5 * 28, 0)
  await props(page.locator('c2-gantt'), { scale: 'month' })
  await expect.poll(() => widthOf(page, 'c2-gantt .bar[data-id="ia"]')).toBeCloseTo(5 * 5, 0)
  await expect(page.locator('c2-gantt .tick.minor').first()).toHaveText('Sep')
})

test('column widths and row heights come from CSS variables', async ({ page, renderScenario }) => {
  await renderScenario(`<style>c2-gantt { --c2-gantt__column-week--width: 20px; --c2-gantt__row--height: 40px }</style>${dataChart()}`)
  await expect.poll(() => widthOf(page, 'c2-gantt .bar[data-id="ia"]')).toBeCloseTo(5 * 20, 0)
  expect((await rowOf(page, 'ia').boundingBox())!.height).toBeCloseTo(40, 0)
  expect((await page.locator('c2-gantt .track').nth(1).boundingBox())!.height).toBeCloseTo(40, 0)
})

test('the today line sits on its day, and today="false" hides it', async ({ page, renderScenario }) => {
  await renderScenario(dataChart())
  const today = await page.locator('c2-gantt .today').boundingBox()
  const ia = await barOf(page, 'ia').boundingBox()
  // 1 Oct is the fourth day of the bar that starts on 28 Sep; the line marks the middle of that day.
  expect(today!.x + today!.width / 2 - ia!.x).toBeCloseTo(3.5 * 16, 0)
  await props(page.locator('c2-gantt'), { today: 'false' })
  await expect(page.locator('c2-gantt .today')).toHaveCount(0)
})

test('a narrow chart switches to the compact layout, with labels above the bars', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="width: 400px">${dataChart()}</div>`)
  await expect(page.locator('c2-gantt .gantt')).toHaveClass(/compact/)
  await expect(page.locator('c2-gantt .above').first()).toContainText('Design')
  // The rows stay in the accessibility tree and keep the focus.
  await expect(page.locator('c2-gantt .row')).toHaveCount(4)
  await rowOf(page, 'ia').focus()
  await expect(rowOf(page, 'ia')).toBeFocused()
  await accessible(page)

  await props(page.locator('c2-gantt'), { layout: 'split' })
  await expect(page.locator('c2-gantt .gantt')).not.toHaveClass(/compact/)
})

test('hide-list keeps the rows for assistive technology but not on screen', async ({ page, renderScenario }) => {
  await renderScenario(dataChart('hide-list'))
  const list = await page.locator('c2-gantt .list').boundingBox()
  expect(list!.width).toBeLessThanOrEqual(1)
  await expect(page.locator('c2-gantt .row')).toHaveCount(4)
  await expect(page.locator('c2-gantt .outside', { hasText: 'Design' }).first()).toBeVisible()
})

test('invalid tasks are skipped with one warning', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => message.type() === 'warning' && warnings.push(message.text()))
  const tasks = [
    { id: 'ok', label: 'Fine', start: '2026-10-01', end: '2026-10-03' },
    { id: 'bad', label: 'No start' },
    { id: 'backwards', label: 'Backwards', start: '2026-10-05', end: '2026-10-01' },
    { id: 'ok', label: 'Duplicate', start: '2026-10-01' },
    { id: 'orphan', label: 'Orphan', start: '2026-10-02', parent: 'missing', dependencies: ['nowhere'] },
  ]
  await renderScenario(`<c2-gantt aria-label="Plan" tasks='${JSON.stringify(tasks)}'></c2-gantt>`)
  await expect(page.locator('c2-gantt .row')).toHaveCount(2)
  await expect(rowOf(page, 'orphan')).toHaveAttribute('aria-level', '1')
  const warning = warnings.find((text) => text.startsWith('c2-gantt'))!
  for (const fragment of ['"bad"', '"backwards"', 'duplicate id "ok"', 'missing parent', 'missing task "nowhere"']) expect(warning).toContain(fragment)
})

test('empty and loading states', async ({ page, renderScenario }) => {
  await renderScenario('<c2-gantt aria-label="Plan" tasks="[]"><span slot="empty">Nothing planned yet</span></c2-gantt>')
  await expect(page.locator('c2-gantt [part="empty"]')).toBeVisible()
  await expect(page.locator('c2-gantt')).toContainText('Nothing planned yet')

  await props(page.locator('c2-gantt'), { loading: true, tasks: plan })
  await expect(page.locator('c2-gantt .skeleton-row')).toHaveCount(5)
  await expect(page.locator('c2-gantt')).toHaveHostAria('aria-busy', 'true')
  await props(page.locator('c2-gantt'), { loading: false })
  await expect(page.locator('c2-gantt .row')).toHaveCount(4)
})

test('hovering a bar shows the tooltip and fires task-hover', async ({ page, renderScenario }) => {
  await renderScenario(dataChart())
  const host = page.locator('c2-gantt')
  await watch(host, 'task-hover')
  await barOf(page, 'vis').hover()
  const tooltip = page.locator('c2-gantt .tooltip')
  await expect(tooltip).toContainText('Visual design')
  await expect(tooltip).toContainText('12 days')
  await expect(tooltip).toContainText('Information architecture')
  await expect(tooltip).toContainText('35%')
  await page.mouse.move(0, 0)
  await expect(tooltip).toHaveCount(0)
  const events = JSON.parse((await host.getAttribute('data-events'))!) as Array<{ id: string | null }>
  expect(events.map((event) => event.id)).toEqual(['vis', null])
})

test('renderTooltip replaces the tooltip contents', async ({ page, renderScenario }) => {
  await renderScenario(dataChart())
  await page.locator('c2-gantt').evaluate((element) => {
    ;(element as unknown as { renderTooltip: (context: { id: string; days: number }) => string }).renderTooltip = (context) => `${context.id}: ${context.days}`
  })
  await barOf(page, 'ia').hover()
  await expect(page.locator('c2-gantt .tooltip')).toHaveText('ia: 5')
})

test('the component writes no attributes on its host', async ({ page, renderScenario }) => {
  await renderScenario(dataChart())
  await pointerClick(barOf(page, 'vis'))
  const attributes = await page.locator('c2-gantt').evaluate((element) => element.getAttributeNames().sort())
  expect(attributes).toEqual(['aria-label', 'tasks', 'today'])
})
