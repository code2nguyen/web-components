import { accessible } from '../../../../tests/component-fixture'
import type { Upload } from '../src/upload'
import { test, expect } from './fixture'

const pdf = (name: string, contents = 'pdf') => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(contents) })

test('hides the single-file picker until its attachment is removed', async ({ page, scenario }) => {
  await scenario()
  const upload = page.locator('c2-upload')
  await expect(upload.locator('.dropzone')).toBeVisible()

  await upload.locator('input[type="file"]').setInputFiles(pdf('profile.pdf'))
  await expect(upload.locator('.dropzone')).toHaveCount(0)
  await expect(page.getByText('profile.pdf')).toBeVisible()

  await page.getByRole('button', { name: 'Remove profile.pdf' }).click()
  await expect(upload.locator('.dropzone')).toBeVisible()
})

test('compact mode uses a button and reports remaining multiple-file capacity', async ({ page, scenario }) => {
  await scenario('compact')
  const upload = page.locator('c2-upload')
  const input = upload.locator('input[type="file"]')
  await expect(upload.locator('.dropzone')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Upload files' })).toBeVisible()

  await input.setInputFiles(pdf('one.pdf'))
  await expect(page.getByRole('button', { name: 'Upload more (2 remaining)' })).toBeVisible()
  await input.setInputFiles([pdf('two.pdf'), pdf('three.pdf')])
  await expect(upload.locator('.compact-button')).toHaveCount(0)

  await page.getByRole('button', { name: 'Remove three.pdf' }).click()
  await expect(page.getByRole('button', { name: 'Upload more (1 remaining)' })).toBeVisible()
})

test('multiple drop zones switch to upload-more copy and show remaining capacity', async ({ page, scenario }) => {
  await scenario('multiple-capacity')
  const upload = page.locator('c2-upload')
  await upload.locator('input[type="file"]').setInputFiles(pdf('one.pdf'))

  await expect(upload.getByText('Drop more files here or upload more')).toBeVisible()
  await expect(upload.getByText('2 files remaining')).toBeVisible()
})

test('selects multiple files and renders them as attachments', async ({ page, scenario }) => {
  await scenario('progress')
  const upload = page.locator('c2-upload')

  await upload.locator('input[type="file"]').setInputFiles([pdf('brief.pdf'), pdf('notes.pdf')])

  await expect(upload.locator('c2-attachment')).toHaveCount(2)
  await expect(page.getByText('brief.pdf')).toBeVisible()
  await expect(page.getByText('notes.pdf')).toBeVisible()
  await expect(upload).toHaveAttribute('data-selected-events', '1')
  await expect(upload).toHaveAttribute('data-input-events', '1')
  await expect(upload).toHaveAttribute('data-change-events', '1')
})

test('shows reported progress and completes every attachment', async ({ page, scenario }) => {
  await scenario('progress')
  const upload = page.locator('c2-upload')
  await upload.locator('input[type="file"]').setInputFiles([pdf('brief.pdf'), pdf('notes.pdf')])

  const progressBars = page.getByRole('progressbar')
  await expect(progressBars).toHaveCount(2)
  await expect(progressBars.first()).toHaveJSProperty('value', 42)

  await page.getByRole('button', { name: 'Finish uploads' }).click()
  await expect(page.getByText('Uploaded')).toHaveCount(2)
  await expect(upload.locator('c2-attachment[status="complete"]')).toHaveCount(2)
})

test('offers retry after an upload error', async ({ page, scenario }) => {
  await scenario('retry')
  const upload = page.locator('c2-upload')
  await upload.locator('input[type="file"]').setInputFiles(pdf('invoice.pdf'))

  await expect(page.getByText('Upload failed')).toBeVisible()
  await expect(upload).toHaveAttribute('data-attempts', '1')
  await page.getByRole('button', { name: 'Retry invoice.pdf' }).click()
  await expect(page.getByText('Uploaded')).toBeVisible()
  await expect(upload).toHaveAttribute('data-attempts', '2')
})

test('removing an uploading attachment cancels it and updates the value', async ({ page, scenario }) => {
  await scenario('progress')
  const upload = page.locator('c2-upload')
  await upload.locator('input[type="file"]').setInputFiles(pdf('draft.pdf'))
  await page.getByRole('button', { name: 'Cancel upload draft.pdf' }).click()

  await expect(upload.locator('c2-attachment')).toHaveCount(0)
  await expect.poll(() => upload.evaluate((element: Upload) => element.value.length)).toBe(0)
  await expect(upload).toHaveAttribute('data-input-events', '2')
  await expect(upload).toHaveAttribute('data-change-events', '2')
})

test('validates file type, size and queue limit', async ({ page, scenario }) => {
  await scenario('validation')
  const upload = page.locator('c2-upload')
  const input = upload.locator('input[type="file"]')

  await input.setInputFiles([
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('ok') },
    pdf('large.pdf', 'too-large'),
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('ok') },
  ])

  await expect(upload.locator('c2-attachment')).toHaveCount(1)
  await expect(upload).toHaveAttribute('data-rejections', 'size,type')
  await expect(page.getByText(/exceeds the 4 B size limit/)).toBeVisible()
  await expect(page.getByText(/not an accepted file type/)).toBeVisible()

  await input.setInputFiles([pdf('second.pdf', 'ok'), pdf('third.pdf', 'ok')])
  await expect(upload.locator('c2-attachment')).toHaveCount(2)
  await expect(upload).toHaveAttribute('data-rejections', 'limit')
})

test('accepts files dropped on the drop zone', async ({ page, scenario }) => {
  await scenario('drop')
  const upload = page.locator('c2-upload')
  await upload.locator('.dropzone').evaluate((dropzone) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['proposal'], 'proposal.pdf', { type: 'application/pdf' }))
    dropzone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, composed: true }))
    dropzone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, composed: true }))
  })

  await expect(page.getByText('proposal.pdf')).toBeVisible()
  await expect(upload).toHaveAttribute('data-selected-events', '1')
})

test('participates in required validation and submits each selected file', async ({ page, scenario }) => {
  await scenario('form')
  const upload = page.locator('c2-upload')

  await expect.poll(() => upload.evaluate((element: Upload) => element.validity.valueMissing)).toBe(true)
  await upload.locator('input[type="file"]').setInputFiles([pdf('one.pdf'), pdf('two.pdf')])
  await expect.poll(() => upload.evaluate((element: Upload) => element.validity.valid)).toBe(true)
  await expect
    .poll(() => page.locator('form').evaluate((form) => (new FormData(form as HTMLFormElement).getAll('documents') as File[]).map((file) => file.name)))
    .toEqual(['one.pdf', 'two.pdf'])
})

test('disabled uploaders cannot browse or receive files', async ({ page, scenario }) => {
  await scenario('disabled')
  const upload = page.locator('c2-upload')
  await expect(upload.locator('.dropzone')).toHaveAttribute('aria-disabled', 'true')
  await expect(upload.locator('input[type="file"]')).toBeDisabled()
  await expect.poll(() => upload.evaluate((element: Upload) => element.addFiles([new File(['x'], 'x.txt')]).length)).toBe(0)
})

test('has no detectable accessibility violations', async ({ page, scenario }) => {
  await scenario('progress')
  const upload = page.locator('c2-upload')
  await upload.locator('input[type="file"]').setInputFiles(pdf('accessible.pdf'))
  await accessible(page)
})
