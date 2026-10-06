import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'

test('consumer-owned row content and adornments remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-list-item><span class="slot-probe">Label</span><span class="slot-probe" slot="description">Description</span><span class="slot-probe" slot="prefix-icon">P</span><span class="slot-probe" slot="suffix-icon">S</span></c2-list-item>',
  )
  await page.locator('.slot-probe').evaluateAll((nodes) => nodes.forEach((node) => ((node as HTMLElement).style.color = 'rgb(1, 2, 3)')))
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.color)))
    .toEqual(Array(4).fill('rgb(1, 2, 3)'))
})

test('standalone rows toggle with click and Space and announce their state', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item value="a">Favorite</c2-list-item>')
  const item = page.locator('c2-list-item', { hasText: 'Favorite' })
  await expect(item).toHaveHostAria('role', 'button')
  await watch(item, 'selected-change')
  await item.click()
  await expect(item).toHaveHostAria('aria-pressed', 'true')
  await item.press('Space')
  await expect(item).toHaveHostAria('aria-pressed', 'false')
  await expect(item).toHaveAttribute('data-events', '[{"selected":true,"value":"a"},{"selected":false,"value":"a"}]')
  await accessible(page)
})
test('disabled rows do not select or dispatch consumer clicks', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item disabled>Unavailable</c2-list-item>')
  const item = page.locator('c2-list-item')
  await watch(item, 'click')
  await pointerClick(item)
  await expect(item).toHaveJSProperty('selected', false)
  await expect(item).toHaveAttribute('data-events', '[]')
})
test('link rows support keyboard navigation and safe external targets', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item href="#docs" target="_blank">Docs</c2-list-item>')
  await expect(page.locator('c2-list-item a')).toHaveAttribute('rel', 'noopener noreferrer')
  await props(page.locator('c2-list-item'), { target: undefined })
  await page.locator('c2-list-item').press('Enter')
  await expect(page).toHaveURL(/#docs$/)
})

test('the icon slots size a bare svg but leave other content its natural width', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-item id="row">
      Home
      <svg slot="prefix-icon" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg>
      <kbd slot="suffix-icon">⌘H</kbd>
    </c2-list-item>
  `)
  const box = (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { width: Math.round(rect.width), clipped: element.scrollWidth > Math.ceil(rect.width) }
    })

  // The svg has no size of its own, so the row gives it one.
  expect(await box('#row svg')).toEqual({ width: 16, clipped: false })
  // A shortcut hint is documented content for this slot: squaring it to 16px would cut it off.
  const hint = await box('#row kbd')
  expect(hint.width).toBeGreaterThan(16)
  expect(hint.clipped).toBe(false)
})

test('--c2-list-item__icon--size still drives the svg and the icon elements', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-list-item id="row" style="--c2-list-item__icon--size: 24px">Home<svg slot="prefix-icon" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg></c2-list-item>`,
  )
  await expect(page.locator('#row svg')).toHaveCSS('width', '24px')
  await expect(page.locator('#row svg')).toHaveCSS('height', '24px')
})

test('a slotted description shows, and an absent one stays hidden', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-item value="with">Inbox<span slot="description">12 unread</span></c2-list-item>
    <c2-list-item value="without">Archive</c2-list-item>
  `)

  const visible = page.locator('c2-list-item[value="with"]')
  const empty = page.locator('c2-list-item[value="without"]')
  const hidden = (item: typeof visible) => item.evaluate((element) => element.shadowRoot?.querySelector('.c2-list-item__description')?.hasAttribute('hidden'))

  await expect.poll(() => hidden(visible)).toBe(false)
  await expect.poll(() => hidden(empty)).toBe(true)
  await expect(page.getByText('12 unread')).toBeVisible()
})

test('renders without tripping Lit’s change-in-update warning', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('scheduled an update')) warnings.push(message.text())
  })

  // Reading a slot in `firstUpdated` and writing a reactive property from it schedules a second update as a
  // side effect of the first, which is what this warning reports. The description is driven by `slotchange`.
  await renderScenario('<c2-list-item value="a">Inbox<span slot="description">12 unread</span></c2-list-item>')
  await expect(page.getByText('12 unread')).toBeVisible()

  expect(warnings).toEqual([])
})

// React hydrates server markup against what the element looks like after it upgrades, and reports every attribute
// the element wrote on itself as a mismatch. The row's role and state therefore live on ElementInternals.
test('states its semantics without writing host attributes, so server-rendered markup hydrates unchanged', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-item value="a">Favorite</c2-list-item>
    <c2-list-item href="#docs">Docs</c2-list-item>
    <c2-list-item disabled>Unavailable</c2-list-item>
  `)
  const hostSemantics = () =>
    page
      .locator('c2-list-item')
      .evaluateAll((elements) => elements.flatMap((element) => element.getAttributeNames().filter((name) => name === 'role' || name.startsWith('aria-'))))
  const toggle = page.locator('c2-list-item[value="a"]')
  const link = page.locator('c2-list-item[href="#docs"]')
  const disabled = page.locator('c2-list-item', { hasText: 'Unavailable' })

  await expect(toggle).toHaveHostAria('role', 'button')
  await expect(toggle).toHaveHostAria('aria-pressed', 'false')
  await expect(toggle).toHaveHostAria('aria-selected', null)
  await expect(link).toHaveHostAria('role', 'link')
  await expect(link).toHaveHostAria('aria-pressed', null)
  await expect(disabled).toHaveHostAria('aria-disabled', 'true')
  await expect(toggle).toHaveHostAria('aria-disabled', null)
  expect(await hostSemantics()).toEqual([])

  await toggle.click()
  await expect(toggle).toHaveHostAria('aria-pressed', 'true')
  await props(disabled, { disabled: false })
  await expect(disabled).toHaveHostAria('aria-disabled', null)
  expect(await hostSemantics()).toEqual([])
})

test('an author-written role on the host wins and decides the state it implies', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item role="option" value="a">Favorite</c2-list-item>')
  const item = page.locator('c2-list-item')
  await expect(item).toHaveAttribute('role', 'option')
  await expect(item).toHaveHostAria('aria-selected', 'false')
  await expect(item).toHaveHostAria('aria-pressed', null)
})

test('a button inside the row keeps its own click and keys, and does not toggle the row', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item value="a">Draft<button slot="suffix-icon" class="delete">Delete</button></c2-list-item>')
  const item = page.locator('c2-list-item')
  // A listener on the document (event delegation, React's root listener) must see the button as the target.
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { seen: string[] }).seen = seen
    document.addEventListener('click', (event) => seen.push((event.target as Element).className || (event.target as Element).localName))
  })
  await page.locator('.delete').click()
  await page.locator('.delete').press('Enter')
  await page.locator('.delete').press('Space')
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['delete', 'delete', 'delete'])
  await expect(item).toHaveJSProperty('selected', false)
  await item.click({ position: { x: 4, y: 4 } })
  await expect(item).toHaveJSProperty('selected', true)
})

test('controls nested in another component and in a disabled row keep their events', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-item id="nested" value="a">Draft<x-action slot="suffix-icon" class="delete"></x-action></c2-list-item>
    <c2-list-item id="disabled" value="b" disabled>Locked<button slot="suffix-icon" class="unlock">Unlock</button></c2-list-item>
  `)
  // A stand-in for c2-button / c2-select: the native control lives in the component's own shadow root.
  await page.evaluate(() => {
    customElements.define(
      'x-action',
      class extends HTMLElement {
        constructor() {
          super()
          this.attachShadow({ mode: 'open' }).innerHTML = '<button>Delete</button>'
        }
      },
    )
  })
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { seen: string[] }).seen = seen
    document.addEventListener('click', (event) => seen.push((event.target as Element).className || (event.target as Element).localName))
  })
  await page.locator('x-action button').click()
  await page.locator('x-action button').press('Enter')
  // A disabled row takes no pointer events, but a focused control inside it still activates from the keyboard.
  await page.locator('.unlock').press('Enter')
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['delete', 'delete', 'unlock'])
  await expect(page.locator('#nested')).toHaveJSProperty('selected', false)
  await expect(page.locator('#disabled')).toHaveJSProperty('selected', false)
})

test('a roving-tabindex menu item in a row is recognised by its role alone', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item value="a">Draft<span slot="suffix-icon" role="menuitemcheckbox" tabindex="-1" class="pin">Pin</span></c2-list-item>')
  await page.locator('.pin').click()
  await expect(page.locator('c2-list-item')).toHaveJSProperty('selected', false)
})
