import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

test('tooltip supplies a name and keyboard activation reaches the consumer', async ({ page, renderScenario }) => {
  await renderScenario('<c2-icon-button tooltip="Settings"><span aria-hidden="true">⚙</span></c2-icon-button>')
  const host = page.locator('c2-icon-button')
  await watch(host, 'click')
  await page.getByRole('button', { name: 'Settings', exact: true }).press('Enter')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await accessible(page)
})
test('explicit name wins and selected state is announced', async ({ page, renderScenario }) => {
  await renderScenario('<c2-icon-button aria-label="Bookmark" tooltip="Save" toggle>★</c2-icon-button>')
  const button = page.getByRole('button', { name: 'Bookmark' })
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await props(page.locator('c2-icon-button'), { selected: true, disabled: true })
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(button).toBeDisabled()
})

// The icon must sit in the middle of the button, and the button in the middle of whatever box its host is given.
const layouts = {
  'default size': '<c2-icon-button aria-label="Settings"><c2-feather-settings></c2-feather-settings></c2-icon-button>',
  'resized through its variables':
    '<c2-icon-button aria-label="Settings" style="--c2-icon-button__state-layer--size: 72px; --c2-icon-button__icon--width: 20px; --c2-icon-button__icon--height: 20px"><c2-feather-settings></c2-feather-settings></c2-icon-button>',
  'host sized directly': '<c2-icon-button aria-label="Settings" style="width: 96px; height: 64px"><c2-feather-settings></c2-feather-settings></c2-icon-button>',
  'stretched by a flex row':
    '<div style="display: flex; gap: 8px"><div style="height: 80px; width: 40px"></div><c2-icon-button aria-label="Settings"><c2-feather-settings></c2-feather-settings></c2-icon-button></div>',
  'stretched by a grid cell':
    '<div style="display: grid; grid-template-columns: 120px; grid-template-rows: 90px"><c2-icon-button aria-label="Settings"><c2-feather-settings></c2-feather-settings></c2-icon-button></div>',
  'icon larger than the button':
    '<c2-icon-button aria-label="Settings" style="--c2-icon-button__state-layer--size: 32px; --c2-icon-button__icon--width: 40px; --c2-icon-button__icon--height: 40px"><c2-feather-settings></c2-feather-settings></c2-icon-button>',
}

for (const [name, markup] of Object.entries(layouts)) {
  test(`feather icon is centered: ${name}`, async ({ page, renderScenario }) => {
    await renderScenario(markup)
    const centers = await page.locator('c2-icon-button').evaluate((host) => {
      const center = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height }
      }
      const button = host.shadowRoot!.querySelector('button')!
      const svg = host.querySelector('c2-feather-settings')!.shadowRoot!.querySelector('svg')!
      return { host: center(host), button: center(button), icon: center(svg) }
    })
    for (const axis of ['x', 'y'] as const) {
      expect(Math.abs(centers.icon[axis] - centers.button[axis]), `icon vs button on ${axis}`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(centers.button[axis] - centers.host[axis]), `button vs host on ${axis}`).toBeLessThanOrEqual(0.5)
    }
    expect(centers.icon.width).toBe(centers.icon.height)
  })
}

test('icon keeps its size when it is larger than the button', async ({ page, renderScenario }) => {
  await renderScenario(layouts['icon larger than the button'])
  const box = await page.locator('c2-feather-settings').boundingBox()
  expect(box?.width).toBe(40)
  expect(box?.height).toBe(40)
})

test('button is vertically centered on a line of text', async ({ page, renderScenario }) => {
  await renderScenario(
    '<p style="font: 16px/24px system-ui; margin: 0"><span id="text">Settings</span> <c2-icon-button aria-label="Settings" style="--c2-icon-button__state-layer--size: 32px; --c2-icon-button__icon--width: 16px; --c2-icon-button__icon--height: 16px"><c2-feather-settings></c2-feather-settings></c2-icon-button></p>',
  )
  const text = await page.locator('#text').boundingBox()
  const icon = await page.locator('c2-feather-settings').boundingBox()
  expect(Math.abs(icon!.y + icon!.height / 2 - (text!.y + text!.height / 2))).toBeLessThanOrEqual(2)
})
