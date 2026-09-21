import { test, expect, props, watch, accessible, clipboard } from '../../../../tests/component-fixture'

test('initial title and source discovery do not schedule a second Lit update', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('c2-code-viewer scheduled an update')) warnings.push(message.text())
  })
  await renderScenario('<c2-code-viewer><span slot="title">Example</span><template>const ready = true</template></c2-code-viewer>')
  await expect(page.getByText('Example', { exact: true })).toBeVisible()
  expect(warnings).toEqual([])
})

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

test('terminal variant adds window controls, language and copy action', async ({ page, renderScenario }) => {
  await renderScenario('<c2-code-viewer variant="terminal" language="bash" code="curl https://example.com"></c2-code-viewer>')
  await expect(page.locator('.terminal-dots i')).toHaveCount(3)
  await expect(page.getByText('bash', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy code' })).toBeVisible()
})

test('public parts style title, header, body and copy button regions', async ({ page, renderScenario }) => {
  await renderScenario('<c2-code-viewer copyable code="const value = 1"><span slot="title">example.ts</span></c2-code-viewer>')
  await page.addStyleTag({
    content:
      'c2-code-viewer::part(header){background:rgb(1,2,3)}c2-code-viewer::part(title){background:rgb(4,5,6)}c2-code-viewer::part(body){background:rgb(7,8,9)}c2-code-viewer::part(copy-button){background:rgb(10,11,12)}',
  })
  const host = page.locator('c2-code-viewer')
  await expect(host.locator('.c2-code-viewer-header')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('slot[name="title"]')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.c2-code-viewer-body')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
  await expect(host.locator('.c2-code-viewer-copy')).toHaveCSS('background-color', 'rgb(10, 11, 12)')
})
