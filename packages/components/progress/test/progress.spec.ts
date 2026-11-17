import { test, expect, props, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'
import type { Locator } from '@playwright/test'

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

const tiers = JSON.stringify([
  { value: 500, label: 'Silver' },
  { value: 1500, label: 'Gold', state: 'claimable' },
  { value: 3000, label: 'Platinum' },
])

/** Centre of a part, as a fraction of the track's width from its left edge. */
async function along(host: Locator, part: string, index = 0) {
  const [track, box] = await Promise.all([host.locator('[part="track"]').boundingBox(), host.locator(`[part="${part}"]`).nth(index).boundingBox()])
  return (box!.x + box!.width / 2 - track!.x) / track!.width
}

test('without marks the bar draws no milestone list', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress value="40">Points</c2-progress>')
  await expect(page.locator('[part="marks"]')).toHaveCount(0)
  // The track is still a direct child of the bar, as before milestones existed.
  await expect(page.locator('.c2-progress > [part="track"]')).toHaveCount(1)
})

test('marks put a dot on the track at each milestone, with its label under the track', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-progress value="1800" max="3000" marks='${tiers}'>Loyalty points</c2-progress>`)
  const host = page.locator('c2-progress')
  await expect(host.locator('[part="mark-label"]')).toHaveText(['Silver', 'Gold', 'Platinum'])
  expect(await along(host, 'mark-dot', 0)).toBeCloseTo(500 / 3000, 2)
  expect(await along(host, 'mark-dot', 1)).toBeCloseTo(1500 / 3000, 2)
  expect(await along(host, 'mark-dot', 2)).toBeCloseTo(1, 2)
  // The dot is centred on the track, and the label sits below it.
  const [track, dot, label] = await Promise.all([
    host.locator('[part="track"]').boundingBox(),
    host.locator('[part="mark-dot"]').first().boundingBox(),
    host.locator('[part="mark-label"]').first().boundingBox(),
  ])
  expect(Math.abs(dot!.y + dot!.height / 2 - (track!.y + track!.height / 2))).toBeLessThan(1)
  expect(label!.y).toBeGreaterThanOrEqual(dot!.y + dot!.height)
  // The dot is drawn over the track and its fill, not under them.
  const hit = await host.evaluate(
    (el, [x, y]) => el.shadowRoot!.elementFromPoint(x, y)?.getAttribute('part'),
    [dot!.x + dot!.width / 2, dot!.y + dot!.height / 2],
  )
  expect(hit).toBe('mark-dot')
  // A label at the end of the track ends there instead of overflowing it.
  const last = await host.locator('[part="mark-label"]').last().boundingBox()
  expect(last!.x + last!.width).toBeLessThanOrEqual(track!.x + track!.width + 1)
  await accessible(page)
})

test('each milestone is locked, reached or claimable, coloured and announced by its state', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-progress value="1800" max="3000" marks='${tiers}'>Loyalty points</c2-progress>`)
  const host = page.locator('c2-progress')
  const dots = host.locator('[part="mark-dot"]')
  await expect(dots.nth(0)).toHaveCSS('background-color', 'rgb(2, 101, 220)')
  await expect(dots.nth(1)).toHaveCSS('background-color', 'rgb(22, 163, 74)')
  await expect(dots.nth(2)).toHaveCSS('background-color', 'rgb(161, 161, 170)')
  await expect(host.locator('[part="mark"]')).toHaveText([/Silver\s*500, reached/, /Gold\s*1,500, ready to claim/, /Platinum\s*3,000, 1,200 to go/])
  // The value moves the states; the explicit `claimable` stays.
  await props(host, { value: 3000 })
  await expect(host.locator('[part="mark"]').last()).toHaveText(/3,000, reached/)
  await props(host, { value: 100 })
  await expect(host.locator('[part="mark"]')).toHaveText([/500, 400 to go/, /ready to claim/, /3,000, 2,900 to go/])
})

test('nextMark gives the first milestone not reached and the distance to it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-progress value="38" max="50" marks='[{"value":25,"label":"Gift wrap"},{"value":50,"label":"Free shipping"}]'>Cart</c2-progress>`)
  const host = page.locator('c2-progress')
  const next = () => host.evaluate((el) => (el as HTMLElement & { nextMark?: { index: number; remaining: number } }).nextMark)
  expect(await next()).toEqual({ mark: { value: 50, label: 'Free shipping' }, index: 1, remaining: 12 })
  await props(host, { value: 50 })
  expect(await next()).toBeUndefined()
})

test('an indeterminate bar announces no distance to its milestones and has no next one', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-progress marks='${tiers}'>Loyalty points</c2-progress>`)
  const host = page.locator('c2-progress')
  await expect(host.locator('[part="mark"]')).toHaveText([/500, not reached/, /1,500, ready to claim/, /3,000, not reached/])
  expect(await host.evaluate((el) => (el as HTMLElement & { nextMark?: unknown }).nextMark)).toBeUndefined()
})

test('a milestone kept locked past the value is announced as not reached, and is not the next one', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-progress value="30" marks='[{"value":20,"label":"Verified","state":"locked"},{"value":50,"label":"Pro"}]'>Account</c2-progress>`)
  const host = page.locator('c2-progress')
  await expect(host.locator('[part="mark"]')).toHaveText([/20, not reached/, /50, 20 to go/])
  expect(await host.evaluate((el) => (el as HTMLElement & { nextMark?: { index: number; remaining: number } }).nextMark)).toMatchObject({
    index: 1,
    remaining: 20,
  })
})

test('marks also take an array in the property, and renderMark draws their labels', async ({ page, renderScenario }) => {
  await renderScenario('<c2-progress value="60">Season pass</c2-progress>')
  const host = page.locator('c2-progress')
  await host.evaluate(async (el) => {
    const progress = el as HTMLElement & { marks: unknown; renderMark: unknown; updateComplete: Promise<boolean> }
    progress.marks = [
      { value: 50, label: 'Badge' },
      { value: 75, label: 'Skin' },
    ]
    progress.renderMark = ({ mark, state, remaining }: { mark: { label: string }; state: string; remaining: number }) => {
      const span = document.createElement('span')
      span.textContent = `${mark.label} (${state}, ${remaining})`
      return span
    }
    await progress.updateComplete
  })
  await expect(host.locator('[part="mark-label"]')).toHaveText(['Badge (reached, 0)', 'Skin (locked, 15)'])
})

test('the milestone states are announced in the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-progress value="1800" max="3000" marks='${tiers}'>Points</c2-progress></div>`)
  await expect(page.locator('[part="mark"]')).toHaveText([/500, atteint/, /1\u202f500, à réclamer/, /3\u202f000, encore 1\u202f200/])
})

test('the circular variant ignores marks', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-progress variant="circular" value="40" marks='${tiers}'>Points</c2-progress>`)
  await expect(page.locator('[part="marks"]')).toHaveCount(0)
})
