import { accessible, pointerClick, watch } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

const viewerDefined = (page: import('@playwright/test').Page) => page.evaluate(() => !!customElements.get('c2-file-preview'))

test.describe('c2-attachment preview', () => {
  test('loads the viewer on first use and pages through the previewable files of its group', async ({ page, scenario }) => {
    await scenario('preview-group')
    expect(await viewerDefined(page)).toBe(false)

    const trigger = page.getByRole('button', { name: 'notes.txt', exact: true })
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    await pointerClick(trigger)

    await expect(page.getByRole('dialog', { name: 'Preview of notes.txt' })).toBeVisible()
    const dialog = page.getByRole('dialog')
    expect(await viewerDefined(page)).toBe(true)
    await expect(dialog.locator('pre')).toContainText('Release notes')
    // budget.xlsx has no `preview`, so the set holds three files.
    await expect(dialog.locator('.counter')).toHaveText('2 of 3')
    await accessible(page)

    await pointerClick(dialog.getByRole('button', { name: 'Next file' }))
    await expect(dialog.locator('.title')).toHaveText('report.pdf')
    await expect(dialog.locator('.counter')).toHaveText('3 of 3')
    await expect(dialog.getByRole('button', { name: 'Next file' })).toHaveAttribute('aria-disabled', 'true')

    await page.keyboard.press('Escape')
    await expect(page.locator('c2-file-preview')).toHaveCount(0)
  })

  test('opens from the keyboard and moves with the arrow keys', async ({ page, scenario }) => {
    await scenario('preview-group')
    const trigger = page.getByRole('button', { name: 'notes.txt', exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.title')).toHaveText('notes.txt')
    // Focus starts on the close button, outside the text, so the arrows page through the set.
    await expect(dialog.getByRole('button', { name: 'Close preview' })).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.locator('.title')).toHaveText('cover.svg')
    await expect(dialog.getByRole('img', { name: 'cover.svg' })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(dialog.locator('.title')).toHaveText('report.pdf')
    await dialog.getByRole('button', { name: 'Close preview' }).click()
    await expect(page.locator('c2-file-preview')).toHaveCount(0)
    // The dialog hands focus back to what opened it.
    await expect(trigger).toBeFocused()
  })

  test('the thumbnail opens the preview with the pointer', async ({ page, scenario }) => {
    await scenario('preview-group')
    await pointerClick(page.locator('c2-attachment').first().locator('.media'))
    await expect(page.getByRole('dialog', { name: 'Preview of cover.svg' })).toBeVisible()
  })

  test('a cancelled attachment-preview keeps the viewer unloaded', async ({ page, scenario }) => {
    await scenario('preview-group')
    const attachment = page.locator('c2-attachment').nth(1)
    await watch(attachment, 'attachment-preview')
    await attachment.evaluate((element) => element.addEventListener('attachment-preview', (event) => event.preventDefault()))
    await pointerClick(page.getByRole('button', { name: 'notes.txt', exact: true }))
    await expect(attachment).toHaveAttribute('data-events', '[{"name":"notes.txt"}]')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await viewerDefined(page)).toBe(false)
  })

  test('openPreview() keeps document order, skips disabled files and opens once', async ({ page, scenario }) => {
    await scenario('preview-order')
    const first = page.locator('c2-attachment').first()
    await watch(first, 'attachment-preview')
    await first.evaluate((element: HTMLElement & { openPreview(): Promise<void> }) => {
      void element.openPreview()
      void element.openPreview()
    })
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.counter')).toHaveText('1 of 3')
    await expect(first).toHaveAttribute('data-events', '[{"name":"a.txt"}]')
    await pointerClick(dialog.getByRole('button', { name: 'Next file' }))
    await pointerClick(dialog.getByRole('button', { name: 'Next file' }))
    await expect(dialog.locator('.title')).toHaveText('d.txt')
  })

  test('a disabled attachment cannot open its preview', async ({ page, scenario }) => {
    await scenario('preview-disabled')
    await expect(page.getByRole('button', { name: 'notes.txt', exact: true })).toBeDisabled()
  })

  test('attachments without preview render as before', async ({ page, scenario }) => {
    await scenario('default')
    await expect(page.locator('c2-attachment .preview-trigger')).toHaveCount(0)
    await expect(page.locator('c2-attachment c2-file-preview')).toHaveCount(0)
  })
})

test.describe('c2-file-preview', () => {
  test('zooms an image with the toolbar and the keyboard', async ({ page, scenario }) => {
    await scenario('fp-image')
    const preview = page.locator('c2-file-preview')
    const image = preview.getByRole('img', { name: 'cover.svg' })
    await expect(image).toBeVisible()
    await expect(preview.locator('.metadata')).toHaveText('Image · 2 KB · 1 of 3')
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(800)
    const fitted = (await image.boundingBox())!.width

    await pointerClick(preview.getByRole('button', { name: 'Zoom in' }))
    await expect(preview.locator('.zoom')).toHaveText('125%')
    await expect.poll(async () => Math.abs((await image.boundingBox())!.width - fitted * 1.25)).toBeLessThan(2)

    await preview.locator('.stage').focus()
    await page.keyboard.press('+')
    await expect(preview.locator('.zoom')).toHaveText('156%')
    await page.keyboard.press('0')
    await expect(preview.locator('.zoom')).toHaveText('100%')
    await expect(preview.getByRole('button', { name: 'Fit to view' })).toBeDisabled()
    await accessible(page)
  })

  test('moves through the set and reports it', async ({ page, scenario }) => {
    await scenario('fp-image')
    const preview = page.locator('c2-file-preview')
    await watch(preview, 'preview-change')
    await pointerClick(preview.getByRole('button', { name: 'Next file' }))
    await expect(preview.locator('pre')).toContainText('Release notes')
    await pointerClick(preview.getByRole('button', { name: 'Next file' }))
    await expect(preview.getByText('No preview is available for this file.')).toBeVisible()
    await expect(preview.getByRole('link', { name: 'Download archive.zip' }).first()).toHaveAttribute('download', 'archive.zip')
    await expect(preview).toHaveAttribute('data-events', /"index":1.*"index":2/)
    // The previous button stays focusable at the first file: it is aria-disabled, not disabled.
    await pointerClick(preview.getByRole('button', { name: 'Previous file' }))
    await pointerClick(preview.getByRole('button', { name: 'Previous file' }))
    await expect(preview.getByRole('button', { name: 'Previous file' })).toHaveAttribute('aria-disabled', 'true')
    await expect(preview.getByRole('button', { name: 'Previous file' })).toHaveJSProperty('disabled', false)
  })

  test('a single file from src, with no set controls', async ({ page, scenario }) => {
    await scenario('fp-single')
    const preview = page.locator('c2-file-preview')
    await expect(preview.locator('pre')).toContainText('Release notes')
    await expect(preview.locator('.metadata')).toHaveText('Text · 1 KB')
    await expect(preview.getByRole('button', { name: 'Next file' })).toHaveCount(0)
    await expect(preview.getByRole('region', { name: 'Preview of notes.txt' })).toBeVisible()
  })

  test('shows a text file as text and never runs it', async ({ page, scenario }) => {
    await scenario('fp-text-file')
    const preview = page.locator('c2-file-preview')
    await expect(preview.locator('pre')).toHaveText('<script>window.ran = true</script><b>bold?</b>')
    await expect(preview.locator('pre b, pre script')).toHaveCount(0)
    expect(await page.evaluate(() => (window as Window & { ran?: boolean }).ran)).toBeUndefined()
  })

  test('never reads a file from another origin', async ({ page, scenario }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await scenario('fp-text-elsewhere')
    await expect(page.locator('c2-file-preview').getByRole('alert')).toHaveText(/This file could not be previewed\./)
    expect(requests.filter((url) => url.startsWith('http://127.0.0.1:9/'))).toEqual([])
  })

  test('frames a local PDF as a typed blob', async ({ page, scenario }) => {
    await scenario('fp-pdf-file')
    const frame = page.locator('c2-file-preview iframe')
    await expect(frame).toHaveAttribute('src', /^blob:/)
    await expect(frame).not.toHaveAttribute('sandbox')
    await expect(frame).toHaveAttribute('title', 'upload.pdf')
  })

  test('reads a same-origin PDF into a typed blob', async ({ page, scenario }) => {
    await scenario('fp-pdf-own')
    const frame = page.locator('c2-file-preview iframe')
    await expect(frame).toHaveAttribute('src', /^blob:/)
    await expect(frame).not.toHaveAttribute('sandbox')
  })

  test('sandboxes a PDF from another origin', async ({ page, scenario }) => {
    await scenario('fp-pdf-elsewhere')
    const frame = page.locator('c2-file-preview iframe')
    await expect(frame).toHaveAttribute('src', 'http://127.0.0.1:9/report.pdf')
    await expect(frame).toHaveAttribute('sandbox', '')
  })

  test('refuses a script URL', async ({ page, scenario }) => {
    await scenario('fp-unsafe')
    const preview = page.locator('c2-file-preview')
    await expect(preview.getByText('This file could not be previewed.')).toBeVisible()
    await expect(preview.locator('iframe, a')).toHaveCount(0)
  })

  test('revokes its object URLs when it leaves the page', async ({ page, scenario }) => {
    await scenario('fp-pdf-file')
    const preview = page.locator('c2-file-preview')
    const src = await preview.locator('iframe').getAttribute('src')
    const revoked = await preview.evaluate((element) => {
      const urls: string[] = []
      const original = URL.revokeObjectURL
      URL.revokeObjectURL = (url: string) => {
        urls.push(url)
        original(url)
      }
      element.remove()
      URL.revokeObjectURL = original
      return urls
    })
    expect(revoked).toContain(src)
  })

  test('says when there is nothing to show', async ({ page, scenario }) => {
    await scenario('fp-empty')
    await expect(page.locator('c2-file-preview').getByText('No file to preview.')).toBeVisible()
  })

  test('speaks the language of the page', async ({ page, scenario }) => {
    await scenario('fp-lang')
    const preview = page.locator('c2-file-preview')
    await expect(preview.getByRole('region', { name: 'Aperçu de a.txt' })).toBeVisible()
    await expect(preview.locator('.metadata')).toHaveText('Texte · 1 sur 2')
    await pointerClick(preview.getByRole('button', { name: 'Fichier suivant' }))
    await expect(preview.locator('pre')).toHaveText('deux')
  })

  test('renderViewer replaces the built-in viewer', async ({ page, scenario }) => {
    await scenario('fp-render')
    const preview = page.locator('c2-file-preview')
    await expect(preview.getByText('Custom report.pdf')).toBeVisible()
    await expect(preview.locator('iframe')).toHaveCount(0)
  })

  test('text implies the text viewer, names never reach Object.prototype, fields keep their keys', async ({ page, scenario }) => {
    await scenario('fp-edge')
    const preview = page.locator('c2-file-preview')
    await expect(preview.locator('pre')).toHaveText('hello')
    const field = page.getByRole('textbox', { name: 'Rename' })
    await field.focus()
    await page.keyboard.type('a-0')
    await page.keyboard.press('ArrowRight')
    await expect(field).toHaveValue('a-0')
    await expect(preview.locator('.title')).toHaveText('notes')

    await pointerClick(preview.getByRole('button', { name: 'Next file' }))
    await expect(preview.getByText('No preview is available for this file.')).toBeVisible()
    await expect(preview.locator('.metadata')).toHaveText('File · 2 of 3')

    // A nameless HTML file is only ever downloaded, as bytes.
    await pointerClick(preview.getByRole('button', { name: 'Next file' }))
    const link = preview.locator('a.download').first()
    await expect(link).toHaveAttribute('download', '')
    const type = await link.evaluate(async (anchor: HTMLAnchorElement) => (await (await fetch(anchor.href)).blob()).type)
    expect(type).toBe('application/octet-stream')
  })

  test('opens as a dialog of its own', async ({ page, scenario }) => {
    await scenario('fp-modal')
    const preview = page.locator('c2-file-preview')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await watch(preview, 'close')
    await preview.evaluate((element: HTMLElement & { showModal(): Promise<void> }) => element.showModal())
    const dialog = page.getByRole('dialog', { name: 'Preview of notes.txt' })
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
    await pointerClick(dialog.getByRole('button', { name: 'Close preview' }))
    await expect(dialog).toBeHidden()
    await expect(preview).toHaveAttribute('data-events', '[null]')
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
  })
})
