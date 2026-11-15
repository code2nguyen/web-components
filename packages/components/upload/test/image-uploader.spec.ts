import type { Locator } from '@playwright/test'
import { accessible, expect, test } from '../../../../tests/component-fixture'
import type { ImageUploader } from '../src/image-uploader'

// A 1×1 PNG, so the thumbnails decode.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const image = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })

const names = (uploader: Locator) => uploader.evaluate((element: ImageUploader) => element.value.map((file) => file.name))

test('draws a tile per image, an add tile with the count, and removes an image', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image-uploader multiple max-files="4" auto-upload="false" aria-label="Listing photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  const add = uploader.locator('.add')
  await expect(add).toHaveAccessibleName('Add images 0 / 4')

  await uploader.locator('input[type="file"]').setInputFiles([image('front.png'), image('kitchen.png')])
  await expect(uploader.getByRole('img', { name: 'front.png' })).toBeVisible()
  await expect(add).toContainText('2 / 4')

  await uploader.getByRole('button', { name: 'Remove front.png' }).click()
  await expect.poll(() => names(uploader)).toEqual(['kitchen.png'])
})

test('hides the add tile at max-files and shows progress, failure and retry per tile', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image-uploader multiple max-files="2" aria-label="Claim photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  await uploader.evaluate((element: ImageUploader) => {
    let attempts = 0
    element.uploadHandler = (file, { onProgress }) =>
      new Promise((resolve, reject) => {
        onProgress(40)
        if (file.name === 'broken.png' && ++attempts === 1) reject(new Error('offline'))
        else (window as unknown as { finish: () => void }).finish = () => resolve({ ok: true })
      })
  })
  await uploader.locator('input[type="file"]').setInputFiles([image('dent.png'), image('broken.png')])

  await expect(uploader.locator('.add')).toHaveCount(0)
  await expect(uploader.getByRole('progressbar', { name: 'Uploading dent.png' })).toHaveJSProperty('value', 40)
  await expect(uploader.getByRole('button', { name: 'Cancel upload dent.png' })).toBeVisible()
  await expect(uploader.getByText('Upload failed')).toBeVisible()

  await uploader.getByRole('button', { name: 'Retry broken.png' }).click()
  await expect(uploader.getByText('Upload failed')).toHaveCount(0)
  await page.evaluate(() => (window as unknown as { finish: () => void }).finish())
  await expect(uploader.getByRole('progressbar', { name: 'Uploading broken.png' })).toHaveCount(0)
})

test('reorders with the keyboard: Space picks up, arrows move, Escape returns', async ({ page, renderScenario, tab }) => {
  await renderScenario('<button>Before</button><c2-image-uploader multiple reorderable cover auto-upload="false" aria-label="Photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  await uploader.locator('input[type="file"]').setInputFiles([image('a.png'), image('b.png'), image('c.png')])
  await uploader.evaluate((element: ImageUploader) => {
    element.addEventListener('reorder', (event) => (element.dataset.reorder = `${event.detail.from}>${event.detail.to}`))
  })
  await expect(uploader.locator('.badge')).toHaveText('Cover')

  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  const handle = uploader.getByRole('button', { name: 'Reorder a.png, position 1 of 3' })
  await expect(handle).toBeFocused()
  await page.keyboard.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => names(uploader)).toEqual(['b.png', 'c.png', 'a.png'])
  await expect(uploader).toHaveAttribute('data-reorder', '1>2')
  await expect(uploader.getByRole('button', { name: 'Reorder a.png, position 3 of 3' })).toBeFocused()
  await expect(uploader.getByRole('status').last()).toHaveText('a.png moved to position 3 of 3.')

  await page.keyboard.press('Escape')
  await expect.poll(() => names(uploader)).toEqual(['a.png', 'b.png', 'c.png'])
  await expect(uploader.getByRole('button', { name: 'Reorder a.png, position 1 of 3' })).toHaveAttribute('aria-pressed', 'false')

  await page.keyboard.press('Enter')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect.poll(() => names(uploader)).toEqual(['b.png', 'c.png', 'a.png'])
  await expect(uploader.locator('.tile').first().locator('.badge')).toHaveText('Cover')
})

test('reorders by dragging a tile with the pointer', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image-uploader multiple reorderable auto-upload="false" aria-label="Photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  await uploader.locator('input[type="file"]').setInputFiles([image('a.png'), image('b.png'), image('c.png')])
  const tiles = uploader.locator('.tile')
  const from = (await tiles.nth(0).boundingBox())!
  const to = (await tiles.nth(2).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width, from.y + from.height / 2, { steps: 3 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 })
  await expect(tiles.nth(2)).toHaveClass(/tile--drop/)
  await page.mouse.up()
  await expect.poll(() => names(uploader)).toEqual(['b.png', 'c.png', 'a.png'])
  await expect(uploader.getByRole('button', { name: 'Reorder a.png, position 3 of 3' })).toHaveAttribute('aria-pressed', 'false')
})

test('is not reorderable without the attribute', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image-uploader multiple auto-upload="false" aria-label="Photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  await uploader.locator('input[type="file"]').setInputFiles([image('a.png'), image('b.png')])
  await expect(uploader.locator('.handle')).toHaveCount(0)
})

test('holds one image without multiple, and a new file replaces it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image-uploader auto-upload="false" capture="environment" aria-label="Profile photo"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  const input = uploader.locator('input[type="file"]')
  await expect(input).toHaveAttribute('capture', 'environment')
  await expect(uploader.locator('.add')).toHaveAccessibleName('Add image')
  await input.setInputFiles(image('old.png'))
  await expect(uploader.locator('.add')).toHaveCount(0)
  await uploader.evaluate((element: ImageUploader) =>
    element.addEventListener('upload-remove', (event) => (element.dataset.removed = event.detail.item.file.name)),
  )

  const chooser = page.waitForEvent('filechooser')
  await uploader.getByRole('button', { name: 'Replace old.png' }).click()
  await (await chooser).setFiles(image('new.png'))
  await expect.poll(() => names(uploader)).toEqual(['new.png'])
  await expect(uploader).toHaveAttribute('data-removed', 'old.png')

  // An invalid file keeps the image there.
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await expect.poll(() => names(uploader)).toEqual(['new.png'])
})

test('replacing one image of a grid keeps its place, and keeps the image when nothing is chosen', async ({ page, renderScenario }) => {
  await renderScenario('<c2-image-uploader multiple max-files="2" auto-upload="false" aria-label="Photos"></c2-image-uploader>')
  const uploader = page.locator('c2-image-uploader')
  await uploader.locator('input[type="file"]').setInputFiles([image('a.png'), image('b.png')])
  const first = await uploader.evaluate((element: ImageUploader) => element.items[0].id)

  let chooser = page.waitForEvent('filechooser')
  await uploader.evaluate((element: ImageUploader, id) => void element.replace(id), first)
  await (await chooser).setFiles([])
  await expect.poll(() => names(uploader)).toEqual(['a.png', 'b.png'])

  chooser = page.waitForEvent('filechooser')
  await uploader.evaluate((element: ImageUploader, id) => void element.replace(id), first)
  await (await chooser).setFiles(image('new.png'))
  await expect.poll(() => names(uploader)).toEqual(['new.png', 'b.png'])
})

test('rejects in its own words', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-image-uploader multiple auto-upload="false" aria-label="Photos"></c2-image-uploader></div>')
  const uploader = page.locator('c2-image-uploader')
  await uploader.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await expect(uploader.getByText('notes.txt n’est pas une image acceptée.')).toBeVisible()
})

test('reads in the language of the page', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-image-uploader multiple max-files="3" cover aria-label="Photos"></c2-image-uploader></div>')
  const uploader = page.locator('c2-image-uploader')
  await expect(uploader.locator('.add')).toHaveAccessibleName('Ajouter des images 0 / 3')
  await uploader.locator('input[type="file"]').setInputFiles(image('a.png'))
  await expect(uploader.locator('.badge')).toHaveText('Couverture')
})

test('has no detectable accessibility violations', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-image-uploader multiple reorderable cover max-files="4" aria-label="Listing photos"><span slot="hint">PNG or JPG</span></c2-image-uploader>',
  )
  const uploader = page.locator('c2-image-uploader')
  await uploader.evaluate((element: ImageUploader) => {
    element.uploadHandler = (file) => (file.name === 'b.png' ? Promise.reject(new Error('x')) : new Promise(() => {}))
  })
  await uploader.locator('input[type="file"]').setInputFiles([image('a.png'), image('b.png')])
  await expect(uploader.getByText('Upload failed')).toBeVisible()
  await accessible(page)
})
