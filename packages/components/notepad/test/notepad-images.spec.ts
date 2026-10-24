import { test, expect } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const content = (page: Page) => page.getByRole('textbox', { name: 'Notes' })
const host = (page: Page) => page.locator('c2-notepad')
const block = (page: Page) => content(page).locator('.image-block')

type Editor = HTMLElement & {
  value: string
  imageUpload: ((file: Blob) => Promise<string>) | null
  imageResolver: ((src: string) => string | Promise<string>) | null
}

/**
 * An application's image store: uploads give `app:<n>` and keep the file, which the resolver draws from. `fail` makes
 * the next upload reject; `hold` keeps uploads waiting until `release()`.
 */
async function withStore(page: Page) {
  await host(page).evaluate((element: Editor) => {
    const files = new Map<string, Blob>()
    const store = { uploads: [] as string[], fail: false, hold: false, waiting: [] as (() => void)[] }
    ;(window as unknown as { store: typeof store }).store = store
    element.imageUpload = async (file) => {
      if (store.hold) await new Promise<void>((resolve) => store.waiting.push(resolve))
      if (store.fail) throw new Error('Quota exceeded')
      const src = `app:${files.size + 1}`
      files.set(src, file)
      store.uploads.push(`${src} ${file.type}`)
      return src
    }
    element.imageResolver = (src) => (files.has(src) ? URL.createObjectURL(files.get(src)!) : '')
  })
}

/** A small PNG made in the page, as a screenshot would be. */
const PNG = `new Promise((resolve) => {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 200
  const context = canvas.getContext('2d')
  context.fillStyle = '#2563eb'
  context.fillRect(0, 0, 400, 200)
  canvas.toBlob((blob) => resolve(new File([blob], 'shot.png', { type: 'image/png' })), 'image/png')
})`

/** Pastes files (and any text types) into the page, as a screenshot or a copied image does. */
async function pasteImage(page: Page, data: Record<string, string> = {}) {
  await content(page).evaluate(
    async (element, { png, data }) => {
      const transfer = new DataTransfer()
      transfer.items.add(await (0, eval)(png))
      for (const [type, value] of Object.entries(data)) transfer.setData(type, value)
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: transfer })
      element.dispatchEvent(event)
    },
    { png: PNG, data },
  )
}

async function paste(page: Page, data: Record<string, string>) {
  await content(page).evaluate((element, entries) => {
    const transfer = new DataTransfer()
    for (const [type, value] of Object.entries(entries)) transfer.setData(type, value)
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    element.dispatchEvent(event)
  }, data)
}

const value = (page: Page) => host(page).evaluate((element: Editor) => element.value)
const drawn = (page: Page) =>
  block(page)
    .locator('img')
    .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)

test('an image line reads as an image block, drawn through the resolver, and is written back the same', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await pasteImage(page)
  await expect.poll(() => value(page)).toBe('![](app:1)')
  await host(page).evaluate((element: Editor) => (element.value = 'Before\n![A chart|120](app:1)\nAfter'))
  await expect(block(page)).toHaveCount(1)
  await expect.poll(() => drawn(page)).toBe(400)
  await expect(block(page).locator('img')).toHaveAttribute('alt', 'A chart')
  expect(
    await block(page)
      .locator('img')
      .evaluate((image) => image.getBoundingClientRect().width),
  ).toBeCloseTo(120, 0)
  expect(await value(page)).toBe('Before\n![A chart|120](app:1)\nAfter')
})

test('a pasted screenshot is saved through imageUpload, previewed meanwhile, and stored as its src', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await page.evaluate(() => ((window as unknown as { store: { hold: boolean } }).store.hold = true))
  await content(page).click()
  await page.keyboard.type('Look:')
  await page.keyboard.press('Enter')
  await pasteImage(page)
  // Shown at once from the file, but not written until it is saved.
  await expect(block(page)).toHaveClass(/is-pending/)
  await expect.poll(() => drawn(page)).toBe(400)
  expect(await value(page)).toBe('Look:')
  await page.evaluate(() => {
    const store = (window as unknown as { store: { hold: boolean; waiting: (() => void)[] } }).store
    store.hold = false
    store.waiting.forEach((release) => release())
  })
  await expect.poll(() => value(page)).toBe('Look:\n![](app:1)')
  await expect(block(page)).not.toHaveClass(/is-pending/)
  expect(await page.evaluate(() => (window as unknown as { store: { uploads: string[] } }).store.uploads)).toEqual(['app:1 image/png'])
  // The caret is on the line after the image: typing goes there.
  await page.keyboard.type('After')
  await expect.poll(() => value(page)).toBe('Look:\n![](app:1)\nAfter')
})

test('without an uploader a pasted image is kept in the page as a data URL', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await content(page).click()
  await pasteImage(page)
  await expect.poll(() => value(page)).toMatch(/^!\[\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)$/)
  await expect.poll(() => drawn(page)).toBe(400)
})

test('an upload that fails takes its block away and fires image-error', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes" value="Text"></c2-notepad>`)
  await withStore(page)
  await host(page).evaluate((element) => {
    ;(window as unknown as { store: { fail: boolean } }).store.fail = true
    element.addEventListener('image-error', (event) => ((window as unknown as { error: string }).error = String((event as CustomEvent).detail.error)))
  })
  await content(page).click()
  await pasteImage(page)
  await expect.poll(() => page.evaluate(() => (window as unknown as { error?: string }).error)).toBe('Error: Quota exceeded')
  await expect(block(page)).toHaveCount(0)
  expect(await value(page)).toBe('Text')
})

test('a dropped image file goes in where it is dropped', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes" value="First\nSecond"></c2-notepad>`)
  await withStore(page)
  const first = await content(page).locator('p').first().boundingBox()
  await content(page).evaluate(
    async (element, { png, x, y }) => {
      const transfer = new DataTransfer()
      transfer.items.add(await (0, eval)(png))
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer }))
    },
    { png: PNG, x: first!.x + first!.width - 4, y: first!.y + first!.height / 2 },
  )
  await expect.poll(() => value(page)).toBe('First\n![](app:1)\nSecond')
})

test('clicking an image shows its resize handle; dragging it, Alt+arrows and a double-click size it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await pasteImage(page)
  await expect.poll(() => value(page)).toBe('![](app:1)')
  const handle = block(page).locator('.image-handle')
  await expect(handle).toBeHidden()
  await block(page).locator('img').hover()
  // Not on hover: only once the image is clicked.
  await expect(handle).toBeHidden()
  await block(page).locator('img').click()
  await expect(block(page)).toHaveClass(/is-selected/)
  await expect(handle).toBeVisible()

  const box = await handle.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 - 150, box!.y + box!.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => value(page)).toBe('![|250](app:1)')

  await block(page).locator('img').click()
  await page.keyboard.press('Alt+ArrowLeft')
  const narrower = Number(/\|(\d+)\]/.exec(await value(page))![1])
  expect(narrower).toBeLessThan(250)
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(() => value(page)).toBe('![|250](app:1)')

  await handle.dblclick()
  await expect.poll(() => value(page)).toBe('![](app:1)')
})

test('Escape during a resize puts the image back', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await pasteImage(page)
  await expect.poll(() => value(page)).toBe('![](app:1)')
  await block(page).locator('img').click()
  const box = await block(page).locator('.image-handle').boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x - 100, box!.y + box!.height / 2, { steps: 4 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await value(page)).toBe('![](app:1)')
  expect(
    await block(page)
      .locator('img')
      .evaluate((image) => image.getBoundingClientRect().width),
  ).toBeCloseTo(400, 0)
})

test('HTML an editor copied an image with brings the same image back, not a copy', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await pasteImage(page)
  await expect.poll(() => value(page)).toBe('![](app:1)')
  await page.keyboard.press('Enter')
  const origin = await page.evaluate(() => location.origin)
  await pasteImage(page, { 'text/html': `<img src="data:image/png;base64,AAAA" data-c2-image-src="app:1" data-c2-image-origin="${origin}" width="80">` })
  await expect.poll(() => value(page)).toBe('![](app:1)\n![|80](app:1)')
  expect(await page.evaluate(() => (window as unknown as { store: { uploads: string[] } }).store.uploads)).toHaveLength(1)
})

test('a data-URL image in pasted HTML is saved through imageUpload rather than kept in the text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  const data = await page.evaluate(async (png) => {
    const file = (await (0, eval)(png)) as Blob
    return new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
  }, PNG)
  await content(page).click()
  await paste(page, { 'text/html': `<p>Chart</p><img src="${data}" alt="chart">`, 'text/plain': 'Chart' })
  await expect.poll(() => value(page)).toBe('Chart\n![chart](app:1)')
})

/** A 1×1 PNG a site serves, readable by other pages (`open`) or by its own only; and a page that is not an image. */
async function serveWebImages(page: Page) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  await page.route('https://images.test/**', (route) => {
    const url = route.request().url()
    return route.fulfill({
      body: url.endsWith('.html') ? '<p>Sign in</p>' : png,
      contentType: url.endsWith('.html') ? 'text/html' : 'image/png',
      headers: { 'access-control-allow-origin': url.includes('open') ? '*' : 'https://images.test' },
    })
  })
}

/** Records `image-error` on the window, as `error`. */
const recordImageErrors = (page: Page) =>
  host(page).evaluate((element) =>
    element.addEventListener('image-error', (event) => ((window as unknown as { error: string }).error = String((event as CustomEvent).detail.error))),
  )
/** What the store and `recordImageErrors` leave on the window. */
type Recorded = { store: { uploads: string[]; fail: boolean; hold: boolean; waiting: (() => void)[] }; error?: string }
const store = (page: Page) =>
  page.evaluate(() => {
    const { store, error } = window as unknown as Recorded
    return { uploads: store.uploads, error }
  })

test('a web image in pasted HTML is copied through imageUpload, written with its address meanwhile', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await serveWebImages(page)
  await page.evaluate(() => ((window as unknown as Recorded).store.hold = true))
  await content(page).click()
  await paste(page, { 'text/html': '<p>Chart</p><img src="https://images.test/open.png" alt="chart">', 'text/plain': 'Chart' })
  // Closed before its copy is saved, the page keeps the image by its address.
  await expect.poll(() => value(page)).toBe('Chart\n![chart](https://images.test/open.png)')
  await page.evaluate(() => {
    const { store } = window as unknown as { store: { uploads: string[]; fail: boolean; hold: boolean; waiting: (() => void)[] }; error?: string }
    store.hold = false
    store.waiting.forEach((release) => release())
  })
  await expect.poll(() => value(page)).toBe('Chart\n![chart](app:1)')
  expect((await store(page)).uploads).toEqual(['app:1 image/png'])
})

test('a web image the site does not let the page read, or that is not an image, keeps its address, with no image-error', async ({
  page,
  renderScenario,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'WebKit reports a refused cross-origin fetch as a page error even when it is caught.')
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await serveWebImages(page)
  await recordImageErrors(page)
  await content(page).click()
  await paste(page, {
    'text/html': '<p>Chart</p><img src="https://images.test/closed.png" alt="chart"><img src="https://images.test/open.html" alt="login">',
    'text/plain': 'Chart',
  })
  await expect.poll(() => value(page)).toBe('Chart\n![chart](https://images.test/closed.png)\n![login](https://images.test/open.html)')
  await expect(block(page).first()).not.toHaveClass(/is-pending/)
  await expect(block(page).last()).not.toHaveClass(/is-pending/)
  expect((await store(page)).uploads).toEqual([])
  expect((await store(page)).error).toBeUndefined()
})

test('a web image the upload refuses keeps its address, and fires image-error', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await serveWebImages(page)
  await recordImageErrors(page)
  await page.evaluate(() => ((window as unknown as Recorded).store.fail = true))
  await content(page).click()
  await paste(page, { 'text/html': '<p>Chart</p><img src="https://images.test/open.png" alt="chart">', 'text/plain': 'Chart' })
  await expect.poll(async () => (await store(page)).error).toBe('Error: Quota exceeded')
  await expect.poll(() => value(page)).toBe('Chart\n![chart](https://images.test/open.png)')
})

test('an image copied in this application with a web address is pasted as it is, not copied again', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await serveWebImages(page)
  const origin = await page.evaluate(() => location.origin)
  await content(page).click()
  await paste(page, {
    'text/html': `<p>Chart</p><img src="https://images.test/open.png" data-c2-image-src="https://images.test/open.png" data-c2-image-origin="${origin}" alt="chart">`,
    'text/plain': 'Chart',
  })
  await expect.poll(() => value(page)).toBe('Chart\n![chart](https://images.test/open.png)')
  await expect(block(page)).not.toHaveClass(/is-pending/)
  expect((await store(page)).uploads).toEqual([])
})

test('an image the resolver cannot draw shows a placeholder', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await host(page).evaluate((element: Editor) => (element.value = '![](app:404)'))
  await expect(block(page)).toHaveClass(/is-missing/)
  await expect(block(page).locator('.image-missing')).toHaveText('Image not available on this device')
  expect(await value(page)).toBe('![](app:404)')
})

test('no-images ignores a pasted image file and leaves images out of pasted HTML', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes" no-images value="Text"></c2-notepad>`)
  await withStore(page)
  await content(page).click()
  await page.keyboard.press('End')
  await pasteImage(page)
  await paste(page, { 'text/html': '<p>More</p><img src="app:1" alt="x">', 'text/plain': 'More' })
  await expect.poll(() => value(page)).toBe('TextMore')
  await expect(block(page)).toHaveCount(0)
})

test('a read-only page shows no resize handle on a clicked image', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await pasteImage(page)
  await expect.poll(() => value(page)).toBe('![](app:1)')
  await host(page).evaluate((element: Editor & { readOnly: boolean }) => (element.readOnly = true))
  await block(page).locator('img').click()
  await expect(block(page).locator('.image-handle')).toBeHidden()
})

test('an image takes whole rules, so the line after it is written on a rule', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await content(page).click()
  await pasteImage(page)
  await page.keyboard.type('After')
  await expect.poll(() => value(page)).toBe('![](app:1)\nAfter')
  await expect.poll(() => drawn(page)).toBe(400)
  const { rule, height } = await block(page).evaluate((element) => ({
    rule: parseFloat(getComputedStyle(element.closest('.writing')!).lineHeight),
    height: element.getBoundingClientRect().height,
  }))
  expect(height).toBeGreaterThan(200)
  expect(height % rule).toBeCloseTo(0, 1)
})

test('a written line that reads as an image stays text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await content(page).click()
  await page.keyboard.type('![not](an-image)')
  await expect.poll(() => value(page)).toBe('\\![not](an-image)')
  await host(page).evaluate((element: Editor) => (element.value = String(element.value)))
  await host(page).evaluate((element: Editor) => {
    const current = element.value
    element.value = ''
    element.value = current
  })
  await expect(block(page)).toHaveCount(0)
  await expect(content(page)).toHaveText('![not](an-image)')
})

test('copying a selected image puts it on the clipboard as a PNG, with HTML that keeps its src', async ({ page, renderScenario, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium lets a test read images off the clipboard.')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await pasteImage(page)
  await expect.poll(() => value(page)).toBe('![](app:1)')
  await block(page).locator('img').click()
  await page.keyboard.press('ControlOrMeta+c')
  const read = () =>
    page.evaluate(async () => {
      const items = await navigator.clipboard.read()
      const read = async (type: string) => {
        const item = items.find((candidate) => candidate.types.includes(type))
        return item ? (await item.getType(type)).text() : ''
      }
      return { types: items.flatMap((item) => [...item.types]).sort(), html: await read('text/html'), text: await read('text/plain') }
    })
  await expect.poll(async () => (await read()).types).toEqual(['image/png', 'text/html', 'text/plain'])
  const clipboard = await read()
  expect(clipboard.html).toContain('data-c2-image-src="app:1"')
  expect(clipboard.text).toBe('![](app:1)')
})

test('a resolver set after the value draws the images already there', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes" value="![](app:1)"></c2-notepad>`)
  await expect(block(page)).toHaveClass(/is-missing/)
  await host(page).evaluate(async (element: Editor) => {
    const png = await new Promise<Blob>((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 200
      canvas.toBlob((blob) => resolve(blob!), 'image/png')
    })
    element.imageResolver = (src) => (src === 'app:1' ? URL.createObjectURL(png) : '')
  })
  await expect.poll(() => drawn(page)).toBe(400)
  await expect(block(page)).not.toHaveClass(/is-missing/)
})

test('an image copied in another application is pasted as the image itself, not as an id this store lacks', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await content(page).click()
  await pasteImage(page, { 'text/html': '<img src="data:image/png;base64,AAAA" data-c2-image-src="other:7" data-c2-image-origin="https://elsewhere.example">' })
  // The file on the clipboard is saved here, once.
  await expect.poll(() => value(page)).toBe('![](app:1)')
  expect(await page.evaluate(() => (window as unknown as { store: { uploads: string[] } }).store.uploads)).toEqual(['app:1 image/png'])
})

test('an icon inline in pasted text, or an image only the copying application can open, is left out', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notepad label="Notes"></c2-notepad>`)
  await withStore(page)
  await content(page).click()
  await paste(page, {
    'text/html':
      '<p>Great <img src="https://example.com/emoji.png" width="16" height="16" alt="👍"> work</p><img src="file:///C:/clip_image001.png"><img src="cid:image002">',
    'text/plain': 'Great work',
  })
  await expect.poll(() => value(page)).toBe('Great work')
  await expect(block(page)).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { store: { uploads: string[] } }).store.uploads)).toEqual([])
})
