import type { Page, Route } from '@playwright/test'
import type { Image } from '../src/image'
import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'

// A 4×3 PNG, so a loaded image has a real intrinsic size.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')

/** Serves images from https://img.test/, counting requests per path; `hold` delays a response until released. */
async function images(page: Page) {
  const requests: string[] = []
  const held = new Map<string, Route>()
  const hold = new Set<string>()
  await page.route('https://img.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    if (hold.has(path)) {
      held.set(path, route)
      return
    }
    if (path.startsWith('/missing')) await route.fulfill({ status: 404, body: 'missing' })
    else await route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  })
  return {
    requests,
    hold: (path: string) => hold.add(path),
    release: async (path: string) => {
      hold.delete(path)
      await held.get(path)?.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    },
  }
}

const status = (page: Page, selector = 'c2-image') =>
  page.locator(selector).evaluate((element) => element.shadowRoot!.querySelector('.frame')!.className.match(/frame--(blocked|loading|loaded|error)/)![1])

test('loads, fades in and re-dispatches load', async ({ page, renderScenario }) => {
  const served = await images(page)
  await renderScenario('<c2-image alt="Team offsite" width="400" height="300"></c2-image>')
  const image = page.locator('c2-image')
  await watch(image, 'load')
  await props(image, { src: 'https://img.test/team.png' })
  await expect.poll(() => status(page)).toBe('loaded')
  await expect(image).toHaveAttribute('data-events', '[null]')
  expect(served.requests).toEqual(['/team.png'])
  await expect(page.getByRole('img', { name: 'Team offsite' })).toBeVisible()
  expect(await image.evaluate((element: Image) => element.complete)).toBe(true)
  await accessible(page)
})

test('loading="click" makes no request until the reader activates it', async ({ page, renderScenario }) => {
  const served = await images(page)
  await renderScenario('<c2-image loading="click" src="https://img.test/chart.png" alt="Revenue chart" placeholder-src="https://img.test/tiny.png"></c2-image>')
  const image = page.locator('c2-image')
  await watch(image, 'load-request')
  const button = page.getByRole('button', { name: /Load image · img\.test.*Revenue chart/ })
  await expect(button).toBeVisible()
  expect(served.requests).toEqual([])
  await accessible(page)

  await button.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => status(page)).toBe('loaded')
  await expect(image).toHaveAttribute('data-events', JSON.stringify([{ src: 'https://img.test/chart.png' }]))
  // Nothing at all was requested before activation (asserted above); after it, the image and its preview load.
  expect(served.requests).toContain('/chart.png')
})

test('the click-to-load placeholder names the host of an absolute URL only, so server and client render alike', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image loading="click" src="/chart.png" alt="Local chart"></c2-image>')
  await expect(page.getByRole('button', { name: /Load image/ })).toBeVisible()
  expect(await page.locator('c2-image').evaluate((element) => element.shadowRoot!.querySelector('.host'))).toBeNull()
})

test('cancelling load-request keeps the image blocked; rewriting src loads the new URL', async ({ page, renderScenario }) => {
  const served = await images(page)
  await renderScenario(`<c2-image id="cancel" loading="click" src="https://img.test/a.png" alt="Blocked"></c2-image>
    <c2-image id="proxy" loading="click" src="https://img.test/b.png" alt="Proxied"></c2-image>`)
  await page.locator('#cancel').evaluate((element) => element.addEventListener('load-request', (event) => event.preventDefault()))
  await page.locator('#proxy').evaluate((element: Image) =>
    element.addEventListener('load-request', () => {
      element.src = 'https://img.test/proxy/b.png'
    }),
  )
  await page.getByRole('button', { name: /Blocked/ }).click()
  await page.getByRole('button', { name: /Proxied/ }).click()
  await expect.poll(() => status(page, '#proxy')).toBe('loaded')
  expect(await status(page, '#cancel')).toBe('blocked')
  expect(served.requests).toEqual(['/proxy/b.png'])
})

test('a failed image shows the fallback with its alternative text and re-dispatches error', async ({ page, renderScenario }) => {
  await images(page)
  await renderScenario('<c2-image alt="Quarterly chart"></c2-image>')
  const image = page.locator('c2-image')
  await watch(image, 'error')
  await props(image, { src: 'https://img.test/missing.png' })
  await expect.poll(() => status(page)).toBe('error')
  await expect(image).toHaveAttribute('data-events', '[null]')
  await expect(page.getByText('Quarterly chart')).toBeVisible()
  await accessible(page)
})

test('lazy images defer to the browser, eager ones load at once', async ({ page, renderScenario }) => {
  const served = await images(page)
  // When a lazy image is fetched is each engine's own heuristic (WebKit starts far earlier than Chromium), so assert
  // what the component controls: the native loading hint, and that an eager image is requested straight away.
  await renderScenario(`<c2-image id="lazy" src="https://img.test/lazy.png" alt="Lazy" width="200" height="150"></c2-image>
    <c2-image id="eager" loading="eager" src="https://img.test/eager.png" alt="Eager" width="200" height="150"></c2-image>`)
  const loadingOf = (selector: string) => page.locator(selector).evaluate((element) => element.shadowRoot!.querySelector('img.image')!.getAttribute('loading'))
  expect(await loadingOf('#lazy')).toBe('lazy')
  expect(await loadingOf('#eager')).toBe('eager')
  await expect.poll(() => served.requests).toContain('/eager.png')
})

test('width and height reserve the box, so loading does not shift the layout', async ({ page, renderScenario }) => {
  const served = await images(page)
  served.hold('/slow.png')
  await renderScenario('<c2-image loading="eager" src="https://img.test/slow.png" alt="Slow" width="320" height="240"></c2-image>')
  const image = page.locator('c2-image')
  expect(await status(page)).toBe('loading')
  const before = await image.boundingBox()
  expect(before).toMatchObject({ width: 320, height: 240 })
  await served.release('/slow.png')
  await expect.poll(() => status(page)).toBe('loaded')
  expect(await image.boundingBox()).toEqual(before)
})

test('preview opens the image in a dialog, closes on Escape, and can be cancelled', async ({ page, renderScenario }) => {
  await images(page)
  await renderScenario(`<c2-image id="preview" preview src="https://img.test/team.png" alt="Team offsite" width="200" height="150"></c2-image>
    <c2-image id="custom" preview src="https://img.test/team.png" alt="Own viewer" width="200" height="150"></c2-image>`)
  await expect.poll(() => status(page, '#preview')).toBe('loaded')
  await expect.poll(() => status(page, '#custom')).toBe('loaded')

  await pointerClick(page.getByRole('button', { name: 'Open Team offsite full screen' }))
  const dialog = page.getByRole('dialog', { name: 'Team offsite' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.locator('#custom').evaluate((element) => element.addEventListener('preview-open', (event) => event.preventDefault()))
  await page.getByRole('button', { name: 'Open Own viewer full screen' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a data: placeholder shows under click-to-load', async ({ page, renderScenario }) => {
  await images(page)
  const data = `data:image/png;base64,${PNG.toString('base64')}`
  await renderScenario(`<c2-image loading="click" src="https://img.test/x.png" alt="With preview" placeholder-src="${data}"></c2-image>`)
  expect(await page.locator('c2-image').evaluate((element) => element.shadowRoot!.querySelector<HTMLImageElement>('.lqip')?.src.startsWith('data:'))).toBe(true)
})
