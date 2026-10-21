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
test('draws no border by default and the themed border on hover, when selected and not when disabled', async ({ page, renderScenario }) => {
  const border =
    '--c2-link-button__container--border: 1px solid rgb(10, 20, 30); --c2-link-button__container__hover--border: 1px solid rgb(40, 50, 60); --c2-link-button__container__selected--border: 1px solid rgb(70, 80, 90)'
  await renderScenario(`
    <c2-link-button>Plain</c2-link-button>
    <c2-link-button style="${border}">Outlined</c2-link-button>
    <c2-link-button style="${border}" selected>Current</c2-link-button>
    <c2-link-button style="${border}" disabled>Off</c2-link-button>
  `)
  await expect(page.getByRole('button', { name: 'Plain' })).toHaveCSS('border-top-style', 'none')
  const outlined = page.getByRole('button', { name: 'Outlined' })
  await expect(outlined).toHaveCSS('border-top', '1px solid rgb(10, 20, 30)')
  await outlined.hover()
  await expect(outlined).toHaveCSS('border-top', '1px solid rgb(40, 50, 60)')
  const current = page.getByRole('button', { name: 'Current' })
  await expect(current).toHaveCSS('border-top', '1px solid rgb(70, 80, 90)')
  await current.hover()
  await expect(current).toHaveCSS('border-top', '1px solid rgb(70, 80, 90)')
  const off = page.getByRole('button', { name: 'Off' })
  await off.hover({ force: true })
  await expect(off).toHaveCSS('border-top', '1px solid rgb(10, 20, 30)')
})
