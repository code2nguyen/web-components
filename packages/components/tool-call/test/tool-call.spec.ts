import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const card = (page: Page, selector = 'c2-tool-call') => page.locator(selector)
const header = (page: Page, selector?: string) => card(page, selector).locator('summary')
const sections = (page: Page, selector?: string) => card(page, selector).locator('[part="section"]')

const SEARCH = `<c2-tool-call name="search_web" description="Searched the web for lit ssr" state="success" duration="1240"
  input='{"query":"lit ssr","limit":3}' output="Found 3 results"></c2-tool-call>`

test('shows the tool, what it did, its state and duration in a closed header', async ({ page, renderScenario }) => {
  await renderScenario(SEARCH)
  await expect(header(page)).toHaveText(/search_web\s+Searched the web for lit ssr\s+1\.2s\s+Completed/)
  await expect(card(page).locator('[part="body"]')).toBeHidden()
  await expect(card(page)).toHaveState('success')
  await accessible(page)
})

test('opens from a click or the keyboard to show the input as JSON and the output as text, and fires toggle', async ({ page, renderScenario }) => {
  await renderScenario(`${SEARCH}<button>After</button>`)
  await card(page).evaluate((element) => {
    ;(window as unknown as { toggles: string[] }).toggles = []
    element.addEventListener('toggle', (event) => (window as unknown as { toggles: string[] }).toggles.push((event as ToggleEvent).newState))
  })
  await header(page).click()
  await expect(sections(page)).toHaveCount(2)
  await expect(sections(page).nth(0)).toHaveText(/Input\s+\{\s+"query": "lit ssr",\s+"limit": 3\s+\}/)
  await expect(sections(page).nth(1)).toHaveText(/Output\s+Found 3 results/)
  await expect(card(page)).toHaveJSProperty('open', true)
  await expect(card(page)).toHaveAttribute('open', '')
  await accessible(page)

  await header(page).focus()
  await page.keyboard.press('Enter')
  await expect(card(page).locator('[part="body"]')).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as unknown as { toggles: string[] }).toggles)).toEqual(['open', 'closed'])
})

test('each state has its own word and custom state, and a failed call shows its error in place of the output', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tool-call name="read_file" input='{"path":"/etc/app.conf"}' open></c2-tool-call>`)
  const words: string[] = []
  for (const state of ['pending', 'running', 'success', 'cancelled', 'error']) {
    await card(page).evaluate(async (element, value) => {
      ;(element as HTMLElement & { state: string }).state = value
      await (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
    }, state)
    await expect(card(page)).toHaveState(state)
    words.push((await card(page).locator('.state-label').textContent()) ?? '')
  }
  expect(words).toEqual(['Pending', 'Running', 'Completed', 'Cancelled', 'Failed'])
  // Without an error text a failed call has nothing to show in place of the output.
  await expect(sections(page)).toHaveCount(2)
  await expect(sections(page).nth(1)).toBeHidden()
  await card(page).evaluate((element) => element.setAttribute('error-text', 'EACCES: permission denied'))
  await expect(sections(page).nth(1)).toHaveText(/Error\s+EACCES: permission denied/)
  await expect(sections(page).nth(1).locator('pre')).toHaveCSS('color', 'rgb(220, 38, 38)')
})

test('a value given as a property shows as JSON, and a plain-text attribute stays text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tool-call name="run" open output="not { json"></c2-tool-call>`)
  await expect(sections(page).nth(1)).toHaveText(/Output\s+not \{ json/)
  await card(page).evaluate((element) => ((element as HTMLElement & { input: unknown }).input = { a: [1, 2] }))
  await expect(sections(page).nth(0).locator('pre')).toHaveText('{\n  "a": [\n    1,\n    2\n  ]\n}')
})

test('slots replace the formatted input and output, and actions stay visible while the card is closed', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tool-call name="delete_branch" description="Delete feature/login" state="pending">
    <span slot="input">Branch <code>feature/login</code></span>
    <button slot="actions">Approve</button><button slot="actions">Deny</button>
  </c2-tool-call>`)
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
  await expect(card(page).locator('[part="actions"]')).toBeVisible()
  const slotted = card(page).locator('[slot="input"]')
  await expect(slotted).toBeHidden()
  await header(page).click()
  // The slotted content replaces the formatted input inside the Input section.
  await expect(slotted).toBeVisible()
  await expect(sections(page).nth(0).locator('pre')).toHaveCount(0)
  await expect(sections(page).nth(0)).toBeVisible()
  await expect(sections(page).nth(1)).toBeHidden()
  await accessible(page)
})

test('a long output scrolls in its box and can be reached from the keyboard; a short one is not a tab stop', async ({ page, renderScenario }) => {
  const long = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join('\n')
  await renderScenario(`<c2-tool-call name="tail_log" open input='{"lines":40}'></c2-tool-call>`)
  await card(page).evaluate((element, text) => ((element as HTMLElement & { output: unknown }).output = text), long)
  const output = sections(page).nth(1).locator('pre')
  await expect(output).toHaveAttribute('tabindex', '0')
  expect((await output.boundingBox())!.height).toBeLessThanOrEqual(241)
  await expect(sections(page).nth(0).locator('pre')).not.toHaveAttribute('tabindex', /.*/)
  await accessible(page)
})

test('a call without a name still reads as a tool, and its words follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-tool-call duration="320" state="running" open input="q"></c2-tool-call></div>`)
  await expect(header(page)).toHaveText(/Outil\s+320ms\s+En cours/)
  await expect(sections(page).nth(0)).toHaveText(/Entrée\s+q/)
})

test('only an object or an array in the attribute is read as JSON, and a card that starts open fires no toggle', async ({ page, renderScenario }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { toggles: number }).toggles = 0
    document.addEventListener('toggle', () => (window as unknown as { toggles: number }).toggles++, true)
  })
  await renderScenario(`<c2-tool-call name="probe" open input="7" output="null"></c2-tool-call>`)
  await expect(sections(page).nth(0)).toHaveText(/Input\s+7/)
  await expect(sections(page).nth(1)).toHaveText(/Output\s+null/)
  await expect(card(page)).toHaveJSProperty('output', 'null')
  // The details' own toggle stays in the shadow root; a capturing listener on the document sees only the host's.
  await page.waitForTimeout(150)
  expect(await page.evaluate(() => (window as unknown as { toggles: number }).toggles)).toBe(0)
})

test('an open call with nothing to show reveals no empty body, and a box that starts scrolling after a state change joins the tab order', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-tool-call name="wait" state="running" open output="ok"></c2-tool-call>`)
  await card(page).evaluate((element) => {
    element.output = undefined
  })
  await expect(card(page).locator('[part="body"]')).toBeHidden()
  await card(page).evaluate((element) => {
    element.errorText = Array.from({ length: 60 }, (_, line) => `trace line ${line}`).join('\n')
    element.state = 'error'
  })
  await expect(sections(page).nth(1).locator('pre')).toHaveAttribute('tabindex', '0')
})
