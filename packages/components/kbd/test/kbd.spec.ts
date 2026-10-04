import { test, expect, accessible } from '../../../../tests/component-fixture'

test('renders the slotted key inside a native kbd and stays out of the tab order', async ({ page, renderScenario, tab }) => {
  await renderScenario('<button>Before</button><c2-kbd>Esc</c2-kbd><button>After</button>')
  const host = page.locator('c2-kbd')
  const kbd = host.locator('[part="kbd"]')
  await expect(kbd).toHaveCount(1)
  expect(await kbd.evaluate((node) => node.localName)).toBe('kbd')
  await expect(host).toHaveText('Esc')
  expect(await kbd.locator('slot').evaluate((slot) => (slot as HTMLSlotElement).assignedNodes().map((node) => node.textContent))).toEqual(['Esc'])

  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await accessible(page)
})

test('a whole shortcut keeps its slotted parts in order on one line, spaced by the gap', async ({ page, renderScenario }) => {
  await renderScenario('<div style="width: 40px"><c2-kbd><span>Ctrl</span><span>+</span><span>Shift</span><span>+</span><span>K</span></c2-kbd></div>')
  const host = page.locator('c2-kbd')
  await expect(host).toHaveText('Ctrl+Shift+K')
  const parts = host.locator('span')
  const boxes = await parts.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON() as DOMRect))
  // A narrow container does not wrap the shortcut: every part shares one line, left to right.
  expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1)
  for (let index = 1; index < boxes.length; index++) {
    expect(Math.round(boxes[index].left - boxes[index - 1].right)).toBe(4)
  }
  await host.evaluate((element) => element.style.setProperty('--c2-kbd--gap', '10px'))
  await expect
    .poll(async () => parts.evaluateAll((nodes) => Math.round(nodes[1].getBoundingClientRect().left - nodes[0].getBoundingClientRect().right)))
    .toBe(10)
  await accessible(page)
})

test('the key can be hidden from assistive technology when a control already announces the shortcut', async ({ page, renderScenario }) => {
  await renderScenario('<button aria-keyshortcuts="Control+K">Search <c2-kbd aria-hidden="true">Ctrl K</c2-kbd></button>')
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible()
  await accessible(page)
})

test('box and type variables restyle the rendered key', async ({ page, renderScenario }) => {
  await renderScenario('<c2-kbd>K</c2-kbd>')
  const host = page.locator('c2-kbd')
  const kbd = host.locator('[part="kbd"]')
  await expect(kbd).toHaveCSS('min-width', '24px')
  await expect(kbd).toHaveCSS('height', '24px')
  await expect(kbd).toHaveCSS('background-color', 'rgb(250, 250, 250)')
  await expect(kbd).toHaveCSS('font-size', '12px')
  await expect(kbd).toHaveCSS('text-transform', 'none')

  await host.evaluate((element) => {
    element.style.setProperty('--c2-kbd--height', '32px')
    element.style.setProperty('--c2-kbd--min-width', '40px')
    element.style.setProperty('--c2-kbd--background-color', 'rgb(24, 24, 27)')
    element.style.setProperty('--c2-kbd--color', 'rgb(250, 250, 250)')
    element.style.setProperty('--c2-kbd--box-shadow', 'rgb(161, 161, 170) 0px 1px 0px 0px')
    element.style.setProperty('--c2-kbd--text-transform', 'uppercase')
  })
  await expect(kbd).toHaveCSS('height', '32px')
  await expect.poll(async () => Math.round((await host.boundingBox())!.width)).toBe(40)
  await expect(kbd).toHaveCSS('background-color', 'rgb(24, 24, 27)')
  await expect(kbd).toHaveCSS('color', 'rgb(250, 250, 250)')
  await expect(kbd).toHaveCSS('box-shadow', 'rgb(161, 161, 170) 0px 1px 0px 0px')
  await expect(kbd).toHaveCSS('text-transform', 'uppercase')
  // The restyled key still meets contrast and the other checks.
  await accessible(page)
})
