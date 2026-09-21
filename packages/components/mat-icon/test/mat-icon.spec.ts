import { test, expect, accessible } from '../../../../tests/component-fixture'

test('ligature content and consumer size are rendered', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mat-icon aria-hidden="true" style="--c2-mat-icon--font-size: 28px">home</c2-mat-icon>')
  await expect(page.locator('c2-mat-icon')).toHaveText('home')
  await expect(page.locator('c2-mat-icon')).toHaveCSS('font-size', '28px')
  await accessible(page)
})
test('slotted icon content can change without replacing the element', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mat-icon aria-hidden="true">home</c2-mat-icon>')
  await page.locator('c2-mat-icon').evaluate((el) => (el.textContent = 'settings'))
  await expect(page.locator('c2-mat-icon')).toHaveText('settings')
})

test('bare ligature text inherits the host public styling hook without a redundant part', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mat-icon class="consumer-icon" aria-hidden="true">home</c2-mat-icon>')
  await page.addStyleTag({ content: '.consumer-icon{--c2-mat-icon--color:rgb(1,2,3)}' })
  const host = page.locator('c2-mat-icon')
  await expect(host).toHaveCSS('color', 'rgb(1, 2, 3)')
  await expect(host.locator('[part]')).toHaveCount(0)
})
