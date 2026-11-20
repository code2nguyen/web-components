import type { Locator, Page } from '@playwright/test'
import { accessible, expect, test } from '../../../../tests/component-fixture'
import type { Upload } from '../src/upload'

// The drop zone behaviour `c2-upload` takes from `@c2n/core`'s DropZoneController: the drag-over state, drops and
// pastes, the keyboard path and the announcement of what was added.

type FileSpec = { name: string; type: string; text?: string }

/** Dispatches a drag event carrying files, or text when `files` is a string. */
async function drag(target: Locator, type: string, files: FileSpec[] | string): Promise<boolean> {
  return target.evaluate(
    (element, { type, files }) => {
      const transfer = new DataTransfer()
      if (typeof files === 'string') transfer.setData('text/plain', files)
      else for (const file of files) transfer.items.add(new File([file.text ?? 'x'], file.name, { type: file.type }))
      const event = new DragEvent(type, { dataTransfer: transfer, bubbles: true, composed: true, cancelable: true })
      element.dispatchEvent(event)
      return event.defaultPrevented
    },
    { type, files },
  )
}

/** Dispatches a paste carrying files, or text when `files` is a string. Returns whether the zone took it. */
async function paste(target: Locator, files: FileSpec[] | string): Promise<boolean> {
  return target.evaluate((element, files) => {
    const transfer = new DataTransfer()
    if (typeof files === 'string') transfer.setData('text/plain', files)
    else for (const file of files) transfer.items.add(new File([file.text ?? 'x'], file.name, { type: file.type }))
    // Built as a plain event with `clipboardData` defined on it: not every engine takes it in the ClipboardEvent init.
    const event = new Event('paste', { bubbles: true, composed: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    element.dispatchEvent(event)
    return event.defaultPrevented
  }, files)
}

const pdf = (name: string): FileSpec => ({ name, type: 'application/pdf' })
const names = (upload: Locator) => upload.evaluate((element: Upload) => element.value.map((file) => file.name))
const announcer = (upload: Locator) => upload.locator('.announcer')

test('files dragged over light the zone up until they leave; dragged text does not', async ({ page, renderScenario }) => {
  await renderScenario('<c2-upload multiple auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  const zone = upload.locator('.dropzone')

  expect(await drag(zone, 'dragenter', [pdf('a.pdf')])).toBe(true)
  await expect(zone).toHaveClass(/dropzone--dragging/)
  // Entering a child and leaving the zone itself keeps it lit until the last leave.
  await drag(zone.locator('.prompt'), 'dragenter', [pdf('a.pdf')])
  await drag(zone, 'dragleave', [pdf('a.pdf')])
  await expect(zone).toHaveClass(/dropzone--dragging/)
  await drag(zone.locator('.prompt'), 'dragleave', [pdf('a.pdf')])
  await expect(zone).not.toHaveClass(/dropzone--dragging/)

  expect(await drag(zone, 'dragenter', 'just text')).toBe(false)
  expect(await drag(zone, 'dragover', 'just text')).toBe(false)
  await expect(zone).not.toHaveClass(/dropzone--dragging/)
  expect(await drag(zone, 'drop', 'just text')).toBe(false)
  expect(await names(upload)).toEqual([])
})

test('a drop adds what the rules take and announces what was added and refused', async ({ page, renderScenario }) => {
  await renderScenario('<c2-upload multiple accept=".pdf" auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  await expect(announcer(upload)).toHaveText('')
  await expect(announcer(upload)).toHaveAttribute('role', 'status')

  await drag(upload.locator('.dropzone'), 'dragover', [pdf('plan.pdf')])
  expect(await drag(upload.locator('.dropzone'), 'drop', [pdf('plan.pdf'), { name: 'notes.txt', type: 'text/plain' }, pdf('brief.pdf')])).toBe(true)
  await expect.poll(() => names(upload)).toEqual(['plan.pdf', 'brief.pdf'])
  await expect(announcer(upload)).toHaveText('2 files added')
  await expect(upload.locator('[part="errors"]')).toContainText('notes.txt is not an accepted file type.')
  await expect(upload.locator('.dropzone')).not.toHaveClass(/dropzone--dragging/)
  await accessible(page)
})

test('pasting files into the focused zone adds them only with paste set, and leaves pasted text alone', async ({ page, renderScenario }) => {
  await renderScenario('<c2-upload multiple auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  const zone = upload.locator('.dropzone')

  expect(await paste(zone, [pdf('scan.pdf')])).toBe(false)
  expect(await names(upload)).toEqual([])

  await upload.evaluate((element: Upload) => (element.paste = true))
  expect(await paste(zone, 'some text')).toBe(false)
  expect(await paste(zone, [pdf('scan.pdf')])).toBe(true)
  await expect.poll(() => names(upload)).toEqual(['scan.pdf'])
  await expect(announcer(upload)).toHaveText('1 file added')
})

test('a disabled zone takes no drag state, drop or paste', async ({ page, renderScenario }) => {
  await renderScenario('<c2-upload multiple paste disabled auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  const zone = upload.locator('.dropzone')
  await drag(zone, 'dragenter', [pdf('a.pdf')])
  await expect(zone).not.toHaveClass(/dropzone--dragging/)
  // The dragover is cancelled with no drop effect: the drop is refused rather than left to the browser.
  const effect = await zone.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['x'], 'a.pdf', { type: 'application/pdf' }))
    const event = new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, composed: true, cancelable: true })
    element.dispatchEvent(event)
    return `${event.defaultPrevented}:${transfer.dropEffect}`
  })
  expect(effect).toBe('true:none')
  // The drop is still cancelled, so the browser does not open the file in place of the page.
  expect(await drag(zone, 'drop', [pdf('a.pdf')])).toBe(true)
  expect(await paste(zone, [pdf('a.pdf')])).toBe(false)
  expect(await names(upload)).toEqual([])
})

test('Enter and Space on the zone open the file picker', async ({ page, renderScenario }) => {
  await renderScenario('<c2-upload aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  const zone = upload.locator('.dropzone')
  for (const key of ['Enter', ' ']) {
    // Focus again for each key: closing the file chooser may leave focus elsewhere in some engines.
    await zone.focus()
    await expect(zone).toBeFocused()
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press(key)
    await (await chooser).setFiles({ name: `${key === ' ' ? 'space' : 'enter'}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('x') })
    await expect.poll(() => names(upload)).toEqual([`${key === ' ' ? 'space' : 'enter'}.pdf`])
    await upload.evaluate((element: Upload) => element.clear())
  }
})

test('announces in the language of the page', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-upload multiple paste auto-upload="false" aria-label="Fichiers"></c2-upload></div>')
  const upload = page.locator('c2-upload')
  await paste(upload.locator('.dropzone'), [pdf('a.pdf'), pdf('b.pdf')])
  await expect(announcer(upload)).toHaveText('2 fichiers ajoutés')
})

test('file sizes are written in the language of the page', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-upload id="en" max-size="2516582" auto-upload="false" aria-label="Files"></c2-upload>
    <c2-upload id="en-big" max-size="15728640" auto-upload="false" aria-label="Files"></c2-upload>
    <div lang="fr"><c2-upload id="fr" max-size="2516582" auto-upload="false" aria-label="Fichiers"></c2-upload></div>`)
  await expect(page.locator('#en [part="hint"]')).toHaveText('up to 2.4 MB')
  await expect(page.locator('#en-big [part="hint"]')).toHaveText('up to 15 MB')
  await expect(page.locator('#fr [part="hint"]')).toHaveText(/^jusqu'à 2,4\sMo$/)
  // A size that rounds to 1024 kB reads as 1.0 MB, not 1,024 kB.
  await renderScenario('<c2-upload id="near-mb" max-size="1048500" auto-upload="false" aria-label="Files"></c2-upload>')
  await expect(page.locator('#near-mb [part="hint"]')).toHaveText('up to 1.0 MB')
})

test('c2-image-uploader takes pasted images on its add tile', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image-uploader multiple paste auto-upload="false" aria-label="Photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  await paste(uploader.locator('[part="add"]'), [{ name: 'shot.png', type: 'image/png' }])
  await expect.poll(() => names(uploader)).toEqual(['shot.png'])
  await expect(uploader.locator('.announcer')).toHaveText('1 file added')
})

test('a drop or paste on c2-image-uploader adds images even after a Replace whose dialog was cancelled', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image-uploader multiple paste auto-upload="false" aria-label="Photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  await paste(uploader.locator('[part="add"]'), [
    { name: 'a.png', type: 'image/png' },
    { name: 'b.png', type: 'image/png' },
  ])
  await expect.poll(() => names(uploader)).toEqual(['a.png', 'b.png'])
  // What a Replace leaves behind when its file dialog is cancelled: the tile it was opened for.
  await uploader.evaluate((element) => {
    const host = element as unknown as { replacing?: string; items: readonly { id: string }[] }
    host.replacing = host.items[0].id
  })
  await paste(uploader.locator('[part="add"]'), [{ name: 'c.png', type: 'image/png' }])
  await expect.poll(() => names(uploader)).toEqual(['a.png', 'b.png', 'c.png'])
})

/** Report a Safari user agent: the clipboard fallback runs only in WebKit, the engine that fires no `paste`. */
const asSafari = (page: Page) =>
  page.addInitScript({
    content: `Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' })`,
  })

test('where the browser fires no paste event for the shortcut (Safari), the focused zone reads the clipboard', async ({ page, renderScenario }) => {
  await asSafari(page)
  // Stand in for Safari: the shortcut fires no `paste`, and the clipboard holds a screenshot.
  await page.addInitScript(() => {
    window.addEventListener('paste', (event) => event.stopImmediatePropagation(), true)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => [{ types: ['text/plain', 'image/png'], getType: async (type: string) => new Blob(['png'], { type }) }],
      },
    })
  })
  await renderScenario('<c2-upload multiple paste auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  await upload.locator('.dropzone').focus()
  await page.keyboard.press('ControlOrMeta+V')
  await expect.poll(() => names(upload)).toEqual(['pasted.png'])
  await expect(announcer(upload)).toHaveText('1 file added')
})

test('without paste set, the shortcut reads nothing from the clipboard', async ({ page, renderScenario }) => {
  await asSafari(page)
  await page.addInitScript(() => {
    ;(window as unknown as { reads: number }).reads = 0
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => ((window as unknown as { reads: number }).reads++, []) },
    })
  })
  await renderScenario('<c2-upload multiple auto-upload="false" aria-label="Project files"></c2-upload>')
  await page.locator('c2-upload').locator('.dropzone').focus()
  await page.keyboard.press('ControlOrMeta+V')
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(0)
})

test('the drop prompt and hint follow the page language, the action word where the translation puts it', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-upload multiple max-files="3" auto-upload="false" aria-label="Fichiers"></c2-upload></div>')
  const upload = page.locator('c2-upload')
  await expect(upload.locator('[part="prompt"]')).toHaveText('Déposez des fichiers ici ou parcourez')
  await expect(upload.locator('[part="prompt"] .action')).toHaveText('parcourez')
  await expect(upload.locator('[part="hint"]')).toHaveText('3 fichiers au maximum')
})

test("the image uploader's add tile takes the paste shortcut's clipboard fallback too, on any keyboard layout", async ({ page, renderScenario }) => {
  await asSafari(page)
  await page.addInitScript(() => {
    window.addEventListener('paste', (event) => event.stopImmediatePropagation(), true)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async (type: string) => new Blob(['png'], { type }) }] },
    })
  })
  await renderScenario('<c2-image-uploader paste auto-upload="false" aria-label="Photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  await uploader.locator('[part="add"]').focus()
  // A Russian layout: the V key reports `м`, and only its physical code says it is the paste shortcut.
  await uploader.locator('[part="add"]').evaluate((button) => {
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'м', code: 'KeyV', metaKey: mac, ctrlKey: !mac, bubbles: true, composed: true }))
  })
  await expect.poll(() => names(uploader)).toEqual(['pasted.png'])
})

test('the clipboard is not read when the browser sent its paste elsewhere, nor for another letter on the V key, nor for a Finder file', async ({
  page,
  renderScenario,
}) => {
  await asSafari(page)
  await page.addInitScript(() => {
    const scope = window as unknown as { reads: number; clipboardItems: unknown[] }
    scope.reads = 0
    scope.clipboardItems = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => (scope.reads++, scope.clipboardItems) },
    })
  })
  await renderScenario('<c2-upload multiple paste auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  const zone = upload.locator('.dropzone')
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent))
  const press = (init: { key: string; code: string; metaKey: boolean; ctrlKey: boolean }, pasteOnBody = false) =>
    zone.evaluate(
      (element, { init, pasteOnBody }) => {
        element.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, composed: true }))
        // The browser's own paste, sent to the start of a selection elsewhere on the page.
        if (pasteOnBody) document.body.dispatchEvent(new Event('paste', { bubbles: true }))
      },
      { init, pasteOnBody },
    )
  const shortcut = { key: 'v', code: 'KeyV', metaKey: mac, ctrlKey: !mac }
  const reads = () => page.evaluate(() => (window as unknown as { reads: number }).reads)

  await press(shortcut, true)
  await page.waitForTimeout(100)
  expect(await reads()).toBe(0)

  // Dvorak: the V key types `k`, and ⌘K / Ctrl+K is not paste.
  await press({ ...shortcut, key: 'k' })
  await page.waitForTimeout(100)
  expect(await reads()).toBe(0)

  // A file copied in Finder: its URL and the picture of its icon.
  await page.evaluate(() => {
    ;(window as unknown as { clipboardItems: unknown[] }).clipboardItems = [
      {
        types: ['text/uri-list', 'image/png'],
        getType: async (type: string) => new Blob([type === 'text/uri-list' ? 'file:///Users/me/Report.pdf' : 'icon'], { type }),
      },
    ]
  })
  await press(shortcut)
  await expect.poll(reads).toBe(1)
  await page.waitForTimeout(100)
  expect(await names(upload)).toEqual([])
})

test('outside Safari (WebKit), the paste shortcut never reads the clipboard', async ({ page, renderScenario }) => {
  await page.addInitScript(() => {
    const scope = window as unknown as { reads: number; release?: () => void }
    scope.reads = 0
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        // Holds the read open, as a permission prompt does, until the test lets it go.
        read: async () => {
          scope.reads++
          await new Promise<void>((resolve) => (scope.release = resolve))
          return [{ types: ['image/png'], getType: async (type: string) => new Blob(['png'], { type }) }]
        },
      },
    })
  })
  await renderScenario('<c2-upload multiple paste auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  const zone = upload.locator('.dropzone')
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent))
  const shortcut = { key: 'v', code: 'KeyV', metaKey: mac, ctrlKey: !mac }
  const press = () =>
    zone.evaluate((element, init) => element.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, composed: true })), shortcut)
  const reads = () => page.evaluate(() => (window as unknown as { reads: number }).reads)

  // This engine's own user agent: whatever it is in the run, only a WebKit that is not Chrome takes the fallback.
  const webkitOnly = await page.evaluate(() => /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent))
  await press()
  await page.waitForTimeout(100)
  expect(await reads()).toBe(webkitOnly ? 1 : 0)
  if (webkitOnly) await page.evaluate(() => (window as unknown as { release: () => void }).release())
  await page.waitForTimeout(100)
  expect(await names(upload)).toEqual(webkitOnly ? ['pasted.png'] : [])
})

test('in Safari, a paste the browser sends late makes the clipboard read moot', async ({ page, renderScenario }) => {
  await asSafari(page)
  await page.addInitScript(() => {
    const scope = window as unknown as { reads: number; release?: () => void }
    scope.reads = 0
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => {
          scope.reads++
          await new Promise<void>((resolve) => (scope.release = resolve))
          return [{ types: ['image/png'], getType: async (type: string) => new Blob(['png'], { type }) }]
        },
      },
    })
  })
  await renderScenario('<c2-upload multiple paste auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  const zone = upload.locator('.dropzone')
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent))
  await zone.evaluate((element, init) => element.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, composed: true })), {
    key: 'v',
    code: 'KeyV',
    metaKey: mac,
    ctrlKey: !mac,
  })
  await expect.poll(() => page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(1)
  // The browser's own paste, late (as Chrome on macOS sends ⌘V), while the read waits on its prompt.
  await paste(zone, [{ name: 'shot.png', type: 'image/png' }])
  await expect.poll(() => names(upload)).toEqual(['shot.png'])
  await page.evaluate(() => (window as unknown as { release: () => void }).release())
  await page.waitForTimeout(100)
  expect(await names(upload)).toEqual(['shot.png'])
})

test('a drop prompt translated without the action placeholder still shows the action after it', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="de"><c2-upload auto-upload="false" aria-label="Dateien"></c2-upload></div>')
  const upload = page.locator('c2-upload')
  await expect(upload.locator('[part="prompt"]')).toHaveText('Dateien hier ablegen durchsuchen')
  await expect(upload.locator('[part="prompt"] .action')).toHaveText('durchsuchen')
})

test('in Safari, a held or repeated paste shortcut reads the clipboard once', async ({ page, renderScenario }) => {
  await asSafari(page)
  await page.addInitScript(() => {
    const scope = window as unknown as { reads: number; release?: () => void }
    scope.reads = 0
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        // Held open, as Safari's Paste callout holds it, until the test lets it go.
        read: async () => {
          scope.reads++
          await new Promise<void>((resolve) => (scope.release = resolve))
          return [{ types: ['image/png'], getType: async (type: string) => new Blob(['png'], { type }) }]
        },
      },
    })
  })
  await renderScenario('<c2-upload multiple paste auto-upload="false" aria-label="Project files"></c2-upload>')
  const upload = page.locator('c2-upload')
  const zone = upload.locator('.dropzone')
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent))
  const press = (repeat: boolean) =>
    zone.evaluate((element, init) => element.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, composed: true })), {
      key: 'v',
      code: 'KeyV',
      metaKey: mac,
      ctrlKey: !mac,
      repeat,
    })
  await press(false)
  await expect.poll(() => page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(1)
  await press(true)
  await press(false)
  await page.waitForTimeout(100)
  await page.evaluate(() => (window as unknown as { release: () => void }).release())
  await expect.poll(() => names(upload)).toEqual(['pasted.png'])
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(1)
  expect(await names(upload)).toEqual(['pasted.png'])
})

test('a translation that repeats the action placeholder keeps the text after it', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="nl"><c2-upload auto-upload="false" aria-label="Bestanden"></c2-upload></div>')
  await expect(page.locator('c2-upload [part="prompt"]')).toHaveText('bladeren: sleep bestanden of bladeren hier')
})

test('in Safari, an image copied from a web page is taken although it carries its URL, named so an extension rule takes it', async ({
  page,
  renderScenario,
}) => {
  await asSafari(page)
  await page.addInitScript(() => {
    window.addEventListener('paste', (event) => event.stopImmediatePropagation(), true)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => [
          {
            types: ['image/jpeg', 'text/uri-list'],
            getType: async (type: string) => new Blob([type === 'text/uri-list' ? 'https://example.com/cat.jpg' : 'jpg'], { type }),
          },
        ],
      },
    })
  })
  await renderScenario('<c2-upload multiple paste accept=".jpg" auto-upload="false" aria-label="Photos"></c2-upload>')
  const upload = page.locator('c2-upload')
  await upload.locator('.dropzone').focus()
  await page.keyboard.press('ControlOrMeta+V')
  await expect.poll(() => names(upload)).toEqual(['pasted.jpg'])
})

test('a refused file is reported in the language of the page', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-upload multiple paste accept=".pdf" auto-upload="false" aria-label="Fichiers"></c2-upload></div>')
  const upload = page.locator('c2-upload')
  await paste(upload.locator('.dropzone'), [{ name: 'photo.png', type: 'image/png' }])
  await expect(upload.locator('[part="errors"]')).toContainText('photo.png n’est pas d’un type accepté.')
})
