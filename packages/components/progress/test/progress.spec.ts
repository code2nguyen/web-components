import { test, expect, props, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('value-slot presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const value = page.locator('c2-progress').locator('[part="value"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-progress><span slot="value" data-slot-presence-probe>One of two</span></c2-progress>',
    host: 'c2-progress',
    slot: 'value',
    assertPresent: async (present) => (present ? expect(value).toBeVisible() : expect(value).toBeHidden()),
  })
})

test('indeterminate progress has a name without a numeric value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress>Uploading files</c2-progress>')
  const progress = page.getByRole('progressbar', { name: 'Uploading files' })
  await expect(progress).not.toHaveAttribute('aria-valuenow')
  // Nothing to show next to a label that has no value yet.
  await expect(page.locator('[part="value"]')).toBeHidden()
  await accessible(page)
})

test('determinate progress reports and updates the current value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress label="Upload" value="25" max="50" show-value></c2-progress>')
  const progress = page.getByRole('progressbar', { name: 'Upload' })
  await expect(progress).toHaveAttribute('aria-valuenow', '25')
  await expect(page.locator('[part="value"]')).toHaveText('50%')
  await props(page.locator('c2-progress'), { value: 50 })
  await expect(progress).toHaveAttribute('aria-valuenow', '50')
  await expect(page.locator('[part="value"]')).toHaveText('100%')
  await accessible(page)
})

test('the indicator fills the track in proportion to the value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress label="Upload" value="25"></c2-progress>')
  const width = async () => {
    const track = await page.locator('[part="track"]').boundingBox()
    const indicator = await page.locator('[part="indicator"]').boundingBox()
    if (!track || !indicator) throw new Error('Expected a visible track and indicator')
    return Math.round((indicator.width / track.width) * 100)
  }
  expect(await width()).toBe(25)
  await props(page.locator('c2-progress'), { value: 80 })
  // The fill transitions; wait for it to land rather than sampling mid-animation.
  await expect.poll(width).toBe(80)
})

test('out-of-range progress announces the same bounds as the visual fill', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress value="150" max="100"></c2-progress>')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await props(page.locator('c2-progress'), { value: -10, max: 0 })
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100')
})

test('a fractional value is announced at the precision it was given', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress label="Download" value="1.2" max="4"></c2-progress>')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1.2')
})

test('clearing the value returns the bar to the indeterminate sweep', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress label="Sync" value="60" show-value></c2-progress>')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
  await props(page.locator('c2-progress'), { value: undefined })
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  await expect(page.locator('[part="value"]')).toHaveText('')
})

test('slotted value text replaces the percentage and shows without show-value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress value="3" max="5">Onboarding<span slot="value">Step 3 of 5</span></c2-progress>')
  await expect(page.locator('[part="value"]')).toBeVisible()
  await expect(page.locator('c2-progress > [slot="value"]')).toBeVisible()
  // Assigned content replaces the percentage fallback, so "60%" never renders.
  const assigned = page.locator('[part="value"] slot[name="value"]')
  expect(await assigned.evaluate((slot: HTMLSlotElement) => slot.assignedNodes().map((node) => node.textContent?.trim()))).toEqual(['Step 3 of 5'])
  await expect(page.getByRole('progressbar', { name: 'Onboarding' })).toHaveAttribute('aria-valuenow', '3')
  await accessible(page)
})

test('a bare bar falls back to a default accessible name', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress></c2-progress>')
  await expect(page.getByRole('progressbar', { name: 'Loading' })).toBeVisible()
  // With neither a label nor a value there is no header row to reserve space for.
  await expect(page.locator('[part="header"]')).toBeHidden()
})

test('the bar fills a flex or grid container instead of collapsing to its content', async ({ page, renderScenario }) => {
  // The host has no intrinsic width, so a percentage on an inner box would be indefinite here and resolve to zero.
  await renderScenario(
    '<div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;width:300px"><c2-progress value="60"></c2-progress></div>',
  )
  await expect(page.locator('[part="track"]')).toHaveCSS('width', '300px')
  await props(page.locator('c2-progress'), { style: '--c2-progress--width: 180px' })
  await expect(page.locator('[part="track"]')).toHaveCSS('width', '180px')
})

test('the circular variant draws a ring with the value in its middle and the label underneath', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress variant="circular" value="67" show-value>Readiness</c2-progress>')
  const progress = page.getByRole('progressbar', { name: 'Readiness' })
  await expect(progress).toHaveAttribute('aria-valuenow', '67')
  await expect(page.locator('[part="value"]')).toHaveText('67%')
  const ring = await page.locator('[part="track"]').boundingBox()
  const value = await page.locator('[part="value"]').boundingBox()
  const label = await page.locator('[part="label"]').boundingBox()
  if (!ring || !value || !label) throw new Error('Expected a visible ring, value and label')
  expect(Math.round(ring.width)).toBe(64)
  expect(Math.round(ring.height)).toBe(64)
  // The value is centred inside the ring and the label sits below it.
  expect(Math.abs(value.x + value.width / 2 - (ring.x + ring.width / 2))).toBeLessThan(1.5)
  expect(Math.abs(value.y + value.height / 2 - (ring.y + ring.height / 2))).toBeLessThan(1.5)
  expect(label.y).toBeGreaterThanOrEqual(ring.y + ring.height)
  await accessible(page)
})

test('the circular arc covers the fraction of the ring given by the value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress variant="circular" label="Upload" value="25"></c2-progress>')
  const coverage = () =>
    page.locator('[part="indicator"]').evaluate((circle: SVGCircleElement) => {
      const [dash] = getComputedStyle(circle).strokeDasharray.split(/[ ,]+/).map(parseFloat)
      return Math.round((dash / circle.getTotalLength()) * 100)
    })
  await expect.poll(coverage).toBe(25)
  await props(page.locator('c2-progress'), { value: 80 })
  await expect.poll(coverage).toBe(80)
})

test('an indeterminate circular ring spins without a value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress variant="circular" show-value>Loading data</c2-progress>')
  await expect(page.getByRole('progressbar', { name: 'Loading data' })).not.toHaveAttribute('aria-valuenow')
  await expect(page.locator('[part="value"]')).toHaveText('')
  const animation = await page.locator('[part="indicator"]').evaluate((circle) => getComputedStyle(circle).animationName)
  expect(animation).toBe('c2-progress-spin')
})
