import { test, expect, props } from '../../../../tests/component-fixture'

const markup = '<button id="anchor" popovertarget="menu">Open menu</button><c2-overlay id="menu" fit-anchor><button>Action</button></c2-overlay>'
test('native trigger opens an anchored popover and Escape closes it', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const host = page.locator('c2-overlay')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(host).toHaveJSProperty('open', true)
  await expect(host).toHaveAttribute('current-placement', /bottom/)
  const anchor = await page.locator('#anchor').boundingBox()
  await expect(host).toHaveCSS('width', `${Math.round(anchor!.width)}px`)
  await page.keyboard.press('Escape')
  await expect(host).not.toBeVisible()
  await expect(host).toHaveJSProperty('open', false)
})
test('open property and light dismissal stay synchronized', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await props(page.locator('c2-overlay'), { open: true })
  await expect(page.getByRole('button', { name: 'Action', exact: true })).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(page.locator('c2-overlay')).toHaveJSProperty('open', false)
})
test('positioning variables set on the open overlay move it without a resize or scroll', async ({ page, renderScenario }) => {
  await renderScenario(
    '<button id="anchor" popovertarget="menu" style="margin: 120px 0 0 200px">Open menu</button><c2-overlay id="menu" placement="bottom-start"><button>Action</button></c2-overlay>',
  )
  const host = page.locator('c2-overlay')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(host).toHaveJSProperty('open', true)
  const anchor = (await page.locator('#anchor').boundingBox())!
  const gap = async () => (await host.boundingBox())!.y - (anchor.y + anchor.height)
  const shift = async () => (await host.boundingBox())!.x - anchor.x
  await expect.poll(gap).toBeCloseTo(8, 0)
  await expect.poll(shift).toBeCloseTo(0, 0)

  await host.evaluate((element) => element.style.setProperty('--c2-overlay--offset-y', '40px'))
  await expect.poll(gap).toBeCloseTo(40, 0)
  await host.evaluate((element) => element.style.setProperty('--c2-overlay--offset-x', '24px'))
  await expect.poll(shift).toBeCloseTo(24, 0)
})
test('viewport padding keeps the open overlay that far from the viewport edge', async ({ page, renderScenario }) => {
  await renderScenario(
    '<button id="anchor" popovertarget="menu" style="margin: 120px 0 0 4px">Open menu</button><c2-overlay id="menu" placement="bottom-end" free-width disabled-cross-axis><button style="width: 240px">Action</button></c2-overlay>',
  )
  const host = page.locator('c2-overlay')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(host).toHaveJSProperty('open', true)
  const left = async () => (await host.boundingBox())!.x
  await expect.poll(left).toBeCloseTo(8, 0)
  await host.evaluate((element) => element.style.setProperty('--c2-overlay--viewport-padding', '32px'))
  await expect.poll(left).toBeCloseTo(32, 0)
})

const BUTTON_MODULE = '/packages/components/button/src/button.ts'
const C2_TRIGGERS = `
  <c2-button id="open-filters" commandfor="filters" command="toggle-popover">Filters</c2-button>
  <c2-button commandfor="filters" command="show-popover">Show</c2-button>`

test('a c2-button commandfor trigger opens, anchors and closes the overlay', async ({ page, renderScenario }) => {
  await renderScenario('<c2-overlay id="filters" placement="bottom-start"><button>Status</button></c2-overlay>')
  // The scenario page loads c2-overlay only: load c2-button, then put the triggers before the overlay.
  await page.locator('main').evaluate(
    async (main, { url, markup }) => {
      await import(url)
      main.insertAdjacentHTML('afterbegin', markup)
      await Promise.all([...main.querySelectorAll('c2-button')].map((button) => (button as Element & { updateComplete: Promise<boolean> }).updateComplete))
    },
    { url: BUTTON_MODULE, markup: C2_TRIGGERS },
  )
  const host = page.locator('c2-overlay')
  const trigger = page.getByRole('button', { name: 'Filters' })

  await trigger.click()
  await expect(host).toHaveJSProperty('open', true)
  await expect(page.getByRole('button', { name: 'Status' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filters', expanded: true })).toBeVisible()
  // Placed under the trigger that names it.
  const anchor = (await trigger.boundingBox())!
  const box = (await host.boundingBox())!
  expect(Math.abs(box.x - anchor.x)).toBeLessThan(2)
  expect(box.y).toBeGreaterThan(anchor.y)

  // A second press closes it: the trigger's own press does not light-dismiss and reopen it.
  await trigger.click()
  await expect(host).toHaveJSProperty('open', false)
  await expect(page.getByRole('button', { name: 'Filters', expanded: false })).toBeVisible()

  await page.getByRole('button', { name: 'Show' }).click()
  await expect(host).toHaveJSProperty('open', true)
  await page.keyboard.press('Escape')
  await expect(host).toHaveJSProperty('open', false)
})

test('with invoker commands a native trigger gets no attribute, and a removed overlay takes back the state it gave', async ({ page, renderScenario }) => {
  await renderScenario(`<button commandfor="filters" command="toggle-popover">Native</button>
    <c2-overlay id="filters"><button>Status</button></c2-overlay>`)
  await page.locator('main').evaluate(async (main, url) => {
    await import(url)
    main.insertAdjacentHTML('afterbegin', '<c2-button commandfor="filters" command="toggle-popover">Filters</c2-button>')
    await (main.querySelector('c2-button') as Element & { updateComplete: Promise<boolean> }).updateComplete
  }, BUTTON_MODULE)
  const filters = page.getByRole('button', { name: 'Filters' })
  await filters.click()
  await expect(page.getByRole('button', { name: 'Filters', expanded: true })).toBeVisible()
  expect(await page.getByRole('button', { name: 'Native' }).evaluate((el) => el.getAttributeNames().sort())).toEqual(['command', 'commandfor'])
  expect(await page.locator('c2-button').evaluate((el) => el.hasAttribute('aria-expanded'))).toBe(false)

  await page.locator('c2-overlay').evaluate((el) => el.remove())
  await expect(page.getByRole('button', { name: 'Filters', expanded: true })).toHaveCount(0)
  expect(await page.locator('c2-button').evaluate((el) => (el as HTMLElement).ariaExpanded)).toBeNull()
})

test('a close button inside the overlay is never its anchor', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="margin: 160px 0 0 240px"><button popovertarget="panel">Open</button></div>
    <section><c2-overlay id="panel" placement="bottom-start"><div>Panel <button popovertarget="panel" popovertargetaction="hide">Close</button>
      <button commandfor="panel" command="hide-popover">Hide</button></div></c2-overlay></section>`)
  const open = page.getByRole('button', { name: 'Open' })
  await open.click()
  const host = page.locator('c2-overlay')
  await expect(host).toHaveJSProperty('open', true)
  const anchor = (await open.boundingBox())!
  const box = (await host.boundingBox())!
  expect(Math.abs(box.x - anchor.x)).toBeLessThan(2)
  expect(box.y).toBeGreaterThan(anchor.y)
})

test('an element that does not forward commands is no trigger, and a moved overlay lets go of its trigger until it opens again', async ({
  page,
  renderScenario,
}) => {
  await renderScenario('<section></section><c2-overlay id="filters"><button>Status</button></c2-overlay>')
  await page.locator('main').evaluate(
    async (main, urls) => {
      await Promise.all(urls.map((url) => import(url)))
      main.insertAdjacentHTML(
        'afterbegin',
        '<c2-icon-button commandfor="filters" command="toggle-popover" aria-label="Icon"></c2-icon-button><c2-button commandfor="filters" command="Toggle-Popover">Filters</c2-button>',
      )
      await Promise.all(
        [...main.querySelectorAll('c2-button, c2-icon-button')].map((el) => (el as Element & { updateComplete: Promise<boolean> }).updateComplete),
      )
    },
    [BUTTON_MODULE, '/packages/components/icon-button/src/icon-button.ts'],
  )
  const host = page.locator('c2-overlay')
  await page.getByRole('button', { name: 'Icon' }).click()
  await expect(host).toHaveJSProperty('open', false)
  expect(await page.locator('c2-icon-button').evaluate((el) => el.hasAttribute('aria-expanded'))).toBe(false)

  // The command keyword is matched without regard to case, as natively.
  await page.getByRole('button', { name: 'Filters' }).click()
  await expect(page.getByRole('button', { name: 'Filters', expanded: true })).toBeVisible()
  // Moved while open: the browser hides it without a toggle event. The trigger gets back its own state (none here),
  // and the next press opens it and reports it expanded again.
  await host.evaluate((el) => el.ownerDocument.querySelector('section')!.append(el))
  await expect(host).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Filters', expanded: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Filters' }).click()
  await expect(host).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filters', expanded: true })).toBeVisible()
})

test('an input naming it by commandfor and the submit and untyped buttons of a form open nothing, so none is the anchor or reported expanded', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<div style="margin: 160px 0 0 240px"><button id="open" popovertarget="filters">Open</button></div>
    <c2-overlay id="filters" placement="bottom-start"><button>Status</button></c2-overlay>`)
  await page.locator('main').evaluate(async (main, url) => {
    await import(url)
    main.insertAdjacentHTML(
      'afterbegin',
      '<input type="button" commandfor="filters" command="toggle-popover" value="Input">' +
        '<form><button commandfor="filters" command="toggle-popover">Untyped</button><button popovertarget="filters">Submit</button>' +
        '<input type="submit" popovertarget="filters" value="Send"><c2-button type="submit" commandfor="filters" command="toggle-popover">Save</c2-button></form>',
    )
    main.querySelector('form')!.addEventListener('submit', (event) => event.preventDefault())
    await (main.querySelector('c2-button') as Element & { updateComplete: Promise<boolean> }).updateComplete
  }, BUTTON_MODULE)
  const host = page.locator('c2-overlay')
  // As the browser treats them: neither form button opens it.
  await page.getByRole('button', { name: 'Untyped' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('button', { name: 'Input' }).click()
  await expect(host).toHaveJSProperty('open', false)
  const open = page.getByRole('button', { name: 'Open' })
  await open.click()
  await expect(host).toHaveJSProperty('open', true)
  // Placed under the button that opened it, not under the controls that come first in the page.
  const anchor = (await open.boundingBox())!
  const box = (await host.boundingBox())!
  expect(Math.abs(box.x - anchor.x)).toBeLessThan(2)
  expect(box.y).toBeGreaterThan(anchor.y)
  expect(await page.locator('c2-button').evaluate((el) => (el as HTMLElement).ariaExpanded)).toBeNull()
})
