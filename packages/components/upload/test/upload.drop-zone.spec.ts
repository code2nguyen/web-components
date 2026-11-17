import type { Locator } from '@playwright/test'
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
  await zone.focus()
  await expect(zone).toBeFocused()
  for (const key of ['Enter', ' ']) {
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press(key)
    await (await chooser).setFiles({ name: `${key === ' ' ? 'space' : 'enter'}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('x') })
    await expect.poll(() => names(upload)).toEqual([`${key === ' ' ? 'space' : 'enter'}.pdf`])
    await upload.evaluate((element: Upload) => element.clear())
    await zone.focus()
  }
})

test('announces in the language of the page', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-upload multiple paste auto-upload="false" aria-label="Fichiers"></c2-upload></div>')
  const upload = page.locator('c2-upload')
  await paste(upload.locator('.dropzone'), [pdf('a.pdf'), pdf('b.pdf')])
  await expect(announcer(upload)).toHaveText('2 fichiers ajoutés')
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
