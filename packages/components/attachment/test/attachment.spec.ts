import { accessible, pointerClick, watch } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

test('renders file metadata and the built-in remove action', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByText('project-brief.pdf')).toBeVisible()
  await expect(page.getByText('PDF', { exact: true })).toBeVisible()
  await expect(page.getByText('2.4 MB')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove project-brief.pdf' })).toBeVisible()
  await accessible(page)
})

test('reports upload progress and cancel emits attachment-remove', async ({ page, scenario }) => {
  await scenario('uploading')
  const attachment = page.locator('c2-attachment')
  const progress = page.getByRole('progressbar', { name: 'Uploading video.mp4' })
  await expect(progress).toBeVisible()
  await expect(progress).toHaveJSProperty('value', 42)
  await watch(attachment, 'attachment-remove')
  await pointerClick(page.getByRole('button', { name: 'Cancel upload video.mp4' }))
  await expect(attachment).toHaveAttribute('data-events', '[{"name":"video.mp4"}]')
})

test('failed uploads offer retry and removal', async ({ page, scenario }) => {
  await scenario('error')
  const attachment = page.locator('c2-attachment')
  await expect(page.getByRole('status')).toHaveText('Upload failed')
  await watch(attachment, 'attachment-retry')
  await pointerClick(page.getByRole('button', { name: 'Retry invoice.csv' }))
  await expect(attachment).toHaveAttribute('data-events', '[{"name":"invoice.csv"}]')
  await watch(attachment, 'attachment-remove')
  await pointerClick(page.getByRole('button', { name: 'Remove invoice.csv' }))
  await expect(attachment).toHaveAttribute('data-events', '[{"name":"invoice.csv"}]')
})

test('disabled attachments keep built-in actions inert', async ({ page, scenario }) => {
  await scenario('disabled')
  await expect(page.getByRole('button', { name: 'Retry locked.pdf' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove locked.pdf' })).toBeDisabled()
})

test('custom slots replace all fallback regions', async ({ page, scenario }) => {
  await scenario('slots')
  await expect(page.getByText('CUSTOM', { exact: true })).toBeVisible()
  await expect(page.getByText('Custom name')).toBeVisible()
  await expect(page.getByText('Reviewed today')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible()
})

test('public parts style media, content, name, metadata and actions regions', async ({ page, scenario }) => {
  await scenario('slots')
  await page.addStyleTag({
    content:
      'c2-attachment::part(media){background:rgb(1,2,3)}c2-attachment::part(content){background:rgb(4,5,6)}c2-attachment::part(name){background:rgb(7,8,9)}c2-attachment::part(metadata){background:rgb(10,11,12)}c2-attachment::part(actions){background:rgb(13,14,15)}',
  })
  const host = page.locator('c2-attachment')
  await expect(host.locator('.media')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('.content')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.name')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
  await expect(host.locator('[part="metadata"]')).toHaveCSS('background-color', 'rgb(10, 11, 12)')
  await expect(host.locator('.actions')).toHaveCSS('background-color', 'rgb(13, 14, 15)')
})

test('attachment groups expose collection semantics and grid layout', async ({ page, scenario }) => {
  await scenario('group')
  const group = page.locator('c2-attachment-group')
  await expect(page.getByRole('list', { name: 'Project files' })).toBeVisible()
  await expect(group.locator('c2-attachment')).toHaveCount(2)
  await expect(group).toHaveAttribute('layout', 'grid')
  await accessible(page)
})

test('mixed groups combine image tiles with full-width file rows', async ({ page, scenario }) => {
  await scenario('mixed')
  const group = page.locator('c2-attachment-group')
  await expect(group).toHaveAttribute('layout', 'mixed')
  await expect(group.locator('c2-attachment[layout="tile"]')).toHaveCount(1)
  await expect(group.locator('c2-attachment:not([layout="tile"])')).toHaveCount(1)
})

test('selects Phosphor icons from the file extension with a generic fallback', async ({ page, scenario }) => {
  await scenario('icons')
  await expect(page.locator('c2-phosphor-file-zip')).toHaveCount(1)
  await expect(page.locator('c2-phosphor-file-ts')).toHaveCount(1)
  await expect(page.locator('c2-phosphor-file-pdf')).toHaveCount(1)
  await expect(page.locator('c2-phosphor-file')).toHaveCount(1)
})
