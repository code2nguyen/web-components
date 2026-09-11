import { test, expect, props, watch, accessible, clipboard } from '../../../../tests/component-fixture'

test('highlights code, line numbers and selected lines without changing source text', async ({ page, renderScenario }) => {
  await renderScenario('<c2-code-viewer language="javascript" line-numbers highlight-lines="2" code="const a = 1;\\nconst b = 2;"></c2-code-viewer>')
  await expect(page.locator('pre.shiki:not(.plain)')).toBeVisible()
  await expect(page.locator('pre code')).toHaveText('const a = 1;\nconst b = 2;')
  await expect(page.locator('pre code .line')).toHaveCount(2)
  await accessible(page)
})
test('unrecognized languages render escaped text safely and update', async ({ page, renderScenario }) => {
  await renderScenario('<c2-code-viewer language="not-a-language" code="&lt;script&gt;bad()&lt;/script&gt;"></c2-code-viewer>')
  await expect(page.locator('pre code')).toHaveText('<script>bad()</script>')
  await expect(page.locator('c2-code-viewer script')).toHaveCount(0)
  await props(page.locator('c2-code-viewer'), { code: 'replacement', inline: true })
  await expect(page.locator('code.c2-code-viewer-inline')).toHaveText('replacement')
})
test('copy uses original source and emits code-copy', async ({ page, renderScenario }) => {
  await renderScenario('<c2-code-viewer copyable code="const answer = 42;"><span slot="title">Example</span></c2-code-viewer>')
  await clipboard(page)
  await watch(page.locator('c2-code-viewer'), 'code-copy')
  await page.getByRole('button', { name: 'Copy code' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', 'const answer = 42;')
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
})
