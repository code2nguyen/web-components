import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'

test('keyboard steps publish input and change, and Home/End reach bounds', async ({ page, renderScenario }) => {
  await renderScenario('<c2-slider aria-label="Volume" min="10" max="30" step="5" value="15" show-value ticks></c2-slider>')
  const host = page.locator('c2-slider')
  const slider = page.getByRole('slider', { name: 'Volume' })
  await watch(host, 'change')
  await slider.press('ArrowRight')
  await expect(host).toHaveJSProperty('value', 20)
  await expect(slider).toHaveAttribute('aria-valuetext', '20')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await slider.press('End')
  await expect(slider).toHaveValue('30')
  await slider.press('Home')
  await expect(slider).toHaveValue('10')
  await accessible(page)
})
test('disabled prevents keyboard changes and vertical semantics are exposed', async ({ page, renderScenario }) => {
  await renderScenario('<c2-slider aria-label="Volume" value="40" orientation="vertical"></c2-slider>')
  const slider = page.getByRole('slider')
  await expect(slider).toHaveAttribute('aria-orientation', 'vertical')
  await props(page.locator('c2-slider'), { disabled: true })
  await expect(slider).toBeDisabled()
  await pointerClick(slider)
  await expect(slider).toHaveValue('40')
})
test('out-of-range values keep the display and accessibility value in sync', async ({ page, renderScenario }) => {
  await renderScenario('<c2-slider aria-label="Volume" min="10" max="30" value="100" show-value></c2-slider>')
  const slider = page.getByRole('slider')
  await expect(slider).toHaveValue('30')
  await expect(slider).toHaveAttribute('aria-valuetext', '30')
  await expect(page.locator('c2-slider [part="value"]')).toHaveText('30')
})
test('participates in forms, restores its default and exposes custom validity', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-slider name="volume" aria-label="Volume" min="0" max="100" step="5" value="25"></c2-slider></form>')
  const host = page.locator('c2-slider')
  const slider = page.getByRole('slider')
  const form = page.locator('form')
  await slider.press('ArrowRight')
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).get('volume'))).toBe('30')
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(slider).toHaveValue('25')
  await host.evaluate((element) => (element as HTMLElement & { setCustomValidity(message: string): void }).setCustomValidity('Choose another volume'))
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await host.evaluate((element) => (element as HTMLElement & { setCustomValidity(message: string): void }).setCustomValidity(''))
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})
test('fieldset disabled state removes the slider from FormData', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset disabled><c2-slider name="volume" aria-label="Volume" value="40"></c2-slider></fieldset></form>')
  await expect(page.getByRole('slider')).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((element) => new FormData(element as HTMLFormElement).has('volume'))).toBe(false)
})
test('range mode exposes two sliders that cannot cross and publish input and change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-slider mode="range" aria-label="Price" min="0" max="100" step="10" value-start="20" value-end="30" show-value ticks></c2-slider>')
  const host = page.locator('c2-slider')
  const start = page.getByRole('slider', { name: 'Price, Minimum' })
  const end = page.getByRole('slider', { name: 'Price, Maximum' })
  await expect(start).toHaveValue('20')
  await expect(end).toHaveValue('30')
  await watch(host, 'change')
  await start.press('ArrowRight')
  await expect(host).toHaveJSProperty('valueStart', 30)
  await expect(host).toHaveAttribute('data-events', '[null]')
  await start.press('ArrowRight')
  await expect(host).toHaveJSProperty('valueStart', 30)
  await expect(start).toHaveValue('30')
  await end.press('Home')
  await expect(host).toHaveJSProperty('valueEnd', 30)
  await end.press('End')
  await expect(end).toHaveAttribute('aria-valuetext', '100')
  await expect(page.locator('c2-slider [part~="thumb-end"] [part="value"]')).toHaveText('100')
  await accessible(page)
})
test('range mode moves the nearer thumb on a track press', async ({ page, renderScenario }) => {
  await renderScenario('<c2-slider mode="range" aria-label="Price" value-start="20" value-end="80" style="width: 400px"></c2-slider>')
  const host = page.locator('c2-slider')
  const track = page.locator('c2-slider [part="track"]')
  await watch(host, 'change')
  const box = (await track.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2)
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { valueEnd: number }).valueEnd)).toBeGreaterThan(85)
  await expect(host).toHaveJSProperty('valueStart', 20)
  await expect(host).toHaveAttribute('data-events', '[null]')
  await page.mouse.click(box.x + box.width * 0.05, box.y + box.height / 2)
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { valueStart: number }).valueStart)).toBeLessThan(10)
})
test('range mode sorts programmatic values and submits both ends', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-slider mode="range" name="price" aria-label="Price" value-start="40" value-end="60"></c2-slider></form>')
  const host = page.locator('c2-slider')
  const form = page.locator('form')
  const entries = () => form.evaluate((element) => new FormData(element as HTMLFormElement).getAll('price'))
  await expect.poll(entries).toEqual(['40', '60'])
  await props(host, { valueStart: 90 })
  await expect(host).toHaveJSProperty('valueStart', 60)
  await expect(host).toHaveJSProperty('valueEnd', 90)
  await expect.poll(entries).toEqual(['60', '90'])
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(host).toHaveJSProperty('valueStart', 40)
  await expect(host).toHaveJSProperty('valueEnd', 60)
})
test('range mode drags either thumb, including where both meet', async ({ page, renderScenario }) => {
  await renderScenario('<c2-slider mode="range" aria-label="Price" value-start="90" value-end="90" style="width: 400px"></c2-slider>')
  const host = page.locator('c2-slider')
  const drag = async (part: string, dx: number) => {
    const box = (await page.locator(`c2-slider [part~="${part}"]`).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
  }
  await drag('thumb-start', -120)
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { valueStart: number }).valueStart)).toBeLessThan(70)
  await expect(host).toHaveJSProperty('valueEnd', 90)
  await drag('thumb-end', -300)
  await expect
    .poll(() =>
      host.evaluate((element) => {
        const slider = element as HTMLElement & { valueEnd: number; valueStart: number }
        return slider.valueEnd - slider.valueStart
      }),
    )
    .toBe(0)
})
test('markers are drawn on the track, filled before the value, with a part per kind', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-slider aria-label="Replay" min="0" max="100" value="50" markers='[{"value":20,"label":"Stop","kind":"stop"},{"value":80,"label":"Alarm","kind":"alarm"},{"value":140},{"value":60,"kind":"bad kind"}]'></c2-slider>`,
  )
  const markers = page.locator('c2-slider [part~="marker"]')
  await expect(markers).toHaveCount(3)
  await expect(markers.nth(0)).toHaveAttribute('part', 'marker marker-stop marker-filled')
  await expect(markers.nth(1)).toHaveAttribute('part', 'marker marker-alarm')
  // A kind that is not a part name adds no part; a marker outside min/max is not drawn.
  await expect(markers.nth(2)).toHaveAttribute('part', 'marker')
  await expect(page.locator('c2-slider [part="markers"]')).toHaveAttribute('aria-hidden', 'true')
  const x = await markers.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().x))
  expect(x[0]).toBeLessThan(x[2])
  expect(x[2]).toBeLessThan(x[1])
  await accessible(page)
})
test('a thumb resting on a marker reads its label, and seekMarker steps between markers', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-slider aria-label="Replay" min="0" max="100" step="5" value="10" markers='[{"value":20,"label":"Stop"},{"value":20,"label":"Door open"},{"value":75,"label":"Alarm"},{"value":5}]'></c2-slider>`,
  )
  const host = page.locator('c2-slider')
  const slider = page.getByRole('slider', { name: 'Replay' })
  await expect(slider).toHaveAttribute('aria-valuetext', '10')
  await slider.press('ArrowRight')
  await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuetext', '20, Stop, Door open')
  await watch(host, 'change')
  const seek = (direction: 1 | -1) =>
    host.evaluate(
      (element, direction) => (element as HTMLElement & { seekMarker(direction: number): { value: number } | undefined }).seekMarker(direction)?.value ?? null,
      direction,
    )
  expect(await seek(1)).toBe(75)
  await expect(slider).toHaveValue('75')
  await expect(slider).toHaveAttribute('aria-valuetext', '75, Alarm')
  expect(await seek(1)).toBeNull()
  expect(await seek(-1)).toBe(20)
  expect(await seek(-1)).toBe(5)
  await expect(slider).toHaveAttribute('aria-valuetext', '5')
  // Like setting `value`, seeking fires no event.
  await expect(host).toHaveAttribute('data-events', '[]')
  await expect(page.locator('c2-slider [part~="marker-filled"]')).toHaveCount(1)
})
test('renderMarker fills each marker, and range mode fills the markers inside the interval', async ({ page, renderScenario }) => {
  await renderScenario('<c2-slider mode="range" aria-label="Window" value-start="30" value-end="70"></c2-slider>')
  const host = page.locator('c2-slider')
  await host.evaluate((element) => {
    const slider = element as HTMLElement & { markers: unknown; renderMarker: unknown }
    slider.markers = [{ value: 10 }, { value: 50, label: 'Peak' }, { value: 90 }]
    slider.renderMarker = ({ index, filled }: { index: number; filled: boolean }) => `${index}${filled ? '*' : ''}`
  })
  await expect(page.locator('c2-slider [part~="marker"]')).toHaveText(['0', '1*', '2'])
  const start = page.getByRole('slider', { name: 'Window, Minimum' })
  await expect(start).toHaveAttribute('aria-valuetext', '30')
  await props(host, { valueStart: 50 })
  await expect(start).toHaveAttribute('aria-valuetext', '50, Peak')
  expect(await host.evaluate((element) => (element as HTMLElement & { seekMarker(): unknown }).seekMarker() ?? null)).toBeNull()
})
test('markers off the step grid snap to the value a thumb can hold', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-slider aria-label="Level" min="0" max="10" step="4" value="0" markers='[{"value":5,"label":"Mid"},{"value":10,"label":"Top","kind":"filled"}]'></c2-slider>`,
  )
  const host = page.locator('c2-slider')
  const slider = page.getByRole('slider')
  const seek = () => host.evaluate((element) => (element as HTMLElement & { seekMarker(): { label: string } | undefined }).seekMarker()?.label ?? null)
  expect(await seek()).toBe('Mid')
  await expect(slider).toHaveAttribute('aria-valuetext', '4, Mid')
  // The top of the grid is 8, not max: the last marker is reached there, and seeking past it stops.
  expect(await seek()).toBe('Top')
  await expect(slider).toHaveValue('8')
  await expect(slider).toHaveAttribute('aria-valuetext', '8, Top')
  expect(await seek()).toBeNull()
  // `filled` is the state part, never a kind; both markers are reached, so both are filled.
  await expect(page.locator('c2-slider [part~="marker"]').nth(1)).toHaveAttribute('part', 'marker marker-filled')
})
test('without markers no marker layer is rendered', async ({ page, renderScenario }) => {
  await renderScenario('<c2-slider aria-label="Volume" value="40" markers="not json"></c2-slider>')
  await expect(page.locator('c2-slider [part="markers"]')).toHaveCount(0)
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', '40')
})
