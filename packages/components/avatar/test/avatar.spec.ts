import { test, expect, props, accessible } from '../../../../tests/component-fixture'
import type { Avatar } from '../src/avatar'

test('initials use the first and last name and allow an explicit override', async ({ page, renderScenario }) => {
  await renderScenario('<c2-avatar name="Ada Byron Lovelace" initial-count="2"></c2-avatar>')
  const host = page.locator('c2-avatar')
  await expect(page.getByRole('img', { name: 'Ada Byron Lovelace' })).toHaveText('AL')
  await props(host, { initials: 'AB' })
  await expect(page.getByRole('img')).toHaveText('AB')
  await accessible(page)
})
test('broken images fall back to initials and a new source recovers', async ({ page, renderScenario }) => {
  await page.route('**/missing-avatar.png', (route) => route.fulfill({ status: 404, body: '' }))
  await renderScenario('<c2-avatar name="Ada Lovelace" initial-count="2" src="/missing-avatar.png"></c2-avatar>')
  await expect(page.locator('c2-avatar img')).toHaveCount(0)
  await expect(page.getByRole('img')).toHaveText('AL')
  await props(page.locator('c2-avatar'), {
    src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>',
  })
  await expect(page.locator('c2-avatar img')).toBeVisible()
  await expect.poll(() => page.locator('c2-avatar img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(10)
})

test('editable avatars preview a selected image and emit avatar-change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-avatar editable name="Ada Lovelace" initial-count="2" style="--c2-avatar--size:72px"></c2-avatar>')
  const avatar = page.locator('c2-avatar')
  await avatar.evaluate((element: Avatar) => {
    element.addEventListener('avatar-change', (event) => {
      element.dataset.changedFile = event.detail.file.name
    })
  })

  await expect(page.getByRole('button', { name: 'Upload Ada Lovelace avatar' })).toBeVisible()
  await avatar.locator('input[type="file"]').setInputFiles({
    name: 'ada.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>'),
  })

  await expect(avatar.locator('img')).toBeVisible()
  await expect(avatar.locator('img')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByRole('button', { name: 'Change Ada Lovelace avatar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove Ada Lovelace avatar' })).toBeVisible()
  await expect(avatar).toHaveAttribute('data-changed-file', 'ada.svg')
  await expect.poll(() => avatar.evaluate((element: Avatar) => element.file?.name)).toBe('ada.svg')

  const remoteSource = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="green"/></svg>'
  await props(avatar, { src: remoteSource })
  await expect(avatar.locator('img')).toHaveAttribute('src', remoteSource)
  await expect.poll(() => avatar.evaluate((element: Avatar) => element.file)).toBeUndefined()
})

test('removing an editable avatar restores its initials and emits avatar-remove', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-avatar editable name="Ada Lovelace" initial-count="2" src="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\'></svg>" style="--c2-avatar--size:72px"></c2-avatar>',
  )
  const avatar = page.locator('c2-avatar')
  await avatar.evaluate((element: Avatar) => {
    element.addEventListener('avatar-remove', () => {
      element.dataset.removed = 'true'
    })
  })

  await page.getByRole('button', { name: 'Remove Ada Lovelace avatar' }).click()

  await expect(avatar.locator('img')).toHaveCount(0)
  await expect(avatar.locator('.c2-avatar')).toHaveText('AL')
  await expect(page.getByRole('button', { name: 'Upload Ada Lovelace avatar' })).toBeVisible()
  await expect(avatar).toHaveAttribute('data-removed', 'true')
  await expect(avatar).toHaveJSProperty('src', undefined)
})

test('editable avatars reject unsupported or oversized files', async ({ page, renderScenario }) => {
  await renderScenario('<c2-avatar editable name="Ada Lovelace" accept="image/png" max-size="4"></c2-avatar>')
  const avatar = page.locator('c2-avatar')
  await avatar.evaluate((element: Avatar) => {
    element.addEventListener('file-reject', (event) => {
      element.dataset.rejection = event.detail.reason
    })
  })
  const input = avatar.locator('input[type="file"]')

  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('ok') })
  await expect(avatar).toHaveAttribute('data-rejection', 'type')
  await input.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.from('too large') })
  await expect(avatar).toHaveAttribute('data-rejection', 'size')
  await expect(avatar.locator('img')).toHaveCount(0)
})

test('disabled editable avatars keep change and remove controls inert', async ({ page, renderScenario }) => {
  await renderScenario(
    "<c2-avatar editable disabled name=\"Ada Lovelace\" src=\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'></svg>\"></c2-avatar>",
  )
  await expect(page.getByRole('button', { name: 'Change Ada Lovelace avatar' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove Ada Lovelace avatar' })).toBeDisabled()
  await expect(page.locator('c2-avatar input[type="file"]')).toBeDisabled()
})

test('editable avatars have no detectable accessibility violations', async ({ page, renderScenario }) => {
  await renderScenario('<c2-avatar editable name="Ada Lovelace" initial-count="2" style="--c2-avatar--size:72px"></c2-avatar>')
  await accessible(page)
})

test('avatar group hides only the avatars that do not fit and responds to width changes', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-avatar-group aria-label="Contributors" style="width:78px;--c2-avatar-group--max-width:78px">
      <c2-avatar name="Ada Lovelace"></c2-avatar>
      <c2-avatar name="Grace Hopper"></c2-avatar>
      <c2-avatar name="Alan Turing"></c2-avatar>
      <c2-avatar name="Katherine Johnson"></c2-avatar>
    </c2-avatar-group>
  `)
  const group = page.locator('c2-avatar-group')

  await expect.poll(() => group.evaluate((element) => (element as HTMLElement & { visible: number }).visible)).toBe(2)
  await expect(group.locator('[part="overflow"]')).toHaveText('+2')

  await group.evaluate((element) => {
    element.style.width = '120px'
    element.style.setProperty('--c2-avatar-group--max-width', '120px')
  })
  await expect.poll(() => group.evaluate((element) => (element as HTMLElement & { hiddenCount: number }).hiddenCount)).toBe(0)
})

test('avatar group supports a hard visible limit and total count mode', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-avatar-group count-mode="total" max-visible="2" aria-label="Design team" style="--c2-avatar-group--max-width:200px">
      <c2-avatar name="Dieter Rams"></c2-avatar>
      <c2-avatar name="Susan Kare"></c2-avatar>
      <c2-avatar name="Paula Scher"></c2-avatar>
      <c2-avatar name="Don Norman"></c2-avatar>
    </c2-avatar-group>
  `)
  const group = page.locator('c2-avatar-group')

  await expect.poll(() => group.evaluate((element) => (element as HTMLElement & { hiddenCount: number }).hiddenCount)).toBe(2)
  await expect(group.locator('[part="overflow"]')).toHaveText('4')
  await expect(group.locator('[part="overflow"]')).toHaveAttribute('aria-label', '4 avatars total')
  await accessible(page)
})
