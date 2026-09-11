import { test, expect, props, accessible } from '../../../../tests/component-fixture'

test('links navigate and selected links expose the current page', async ({ page, renderScenario }) => {
  await renderScenario('<c2-link-button href="#destination" selected>Docs</c2-link-button>')
  const link = page.getByRole('link', { name: 'Docs' })
  await expect(link).toHaveAttribute('aria-current', 'page')
  await link.click()
  await expect(page).toHaveURL(/#destination$/)
  await accessible(page)
})
test('disabled links cannot navigate and an absent href renders an action', async ({ page, renderScenario }) => {
  await renderScenario('<c2-link-button href="#destination" disabled>Docs</c2-link-button>')
  await expect(page.getByRole('link')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Docs' })).toBeDisabled()
  await props(page.locator('c2-link-button'), { disabled: false, href: undefined })
  await expect(page.getByRole('button', { name: 'Docs' })).toBeEnabled()
})
test('external links protect the opener and forward download', async ({ page, renderScenario }) => {
  await renderScenario('<c2-link-button href="#file" external download="example.txt">Download</c2-link-button>')
  const link = page.getByRole('link')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(link).toHaveAttribute('download', 'example.txt')
})
