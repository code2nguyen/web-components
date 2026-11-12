import { test, expect, watch, accessible, clipboard } from '../../../../tests/component-fixture'

test('copy writes the explicit value and announces completion', async ({ page, renderScenario }) => {
  await renderScenario('<c2-copy-button value="hello" reveal="always" copied-duration="100">Copy text</c2-copy-button>')
  await clipboard(page)
  const host = page.locator('c2-copy-button')
  await watch(host, 'copied')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', 'hello')
  await expect(host).toHaveAttribute('data-events', '[{"text":"hello"}]')
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible()
  await accessible(page)
})
test('for reads the current input value and excludes copy-button labels from parent text', async ({ page, renderScenario }) => {
  await renderScenario('<input id="source" aria-label="Source" value="old" /><c2-copy-button for="source" reveal="always"></c2-copy-button>')
  await clipboard(page)
  await page.getByRole('textbox').fill('edited')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', 'edited')
  await renderScenario('<div>Source text<c2-copy-button reveal="always">Do not copy me</c2-copy-button></div>')
  await clipboard(page)
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', 'Source text')
})
test('clipboard rejection announces failure without claiming success', async ({ page, renderScenario }) => {
  await renderScenario('<c2-copy-button value="hello" reveal="always"></c2-copy-button>')
  await clipboard(page, true)
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Copy failed')
  await expect(page.locator('c2-copy-button')).toHaveJSProperty('copied', false)
})

test('a repeated copy announces again, differing by a no-break space', async ({ page, renderScenario }) => {
  await renderScenario('<c2-copy-button value="hello" reveal="always"></c2-copy-button>')
  await clipboard(page)
  const status = page.locator('c2-copy-button').locator('[role="status"]')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect.poll(() => status.evaluate((el) => el.textContent)).toBe('Copied')
  await page.getByRole('button', { name: 'Copied', exact: true }).click()
  await expect.poll(() => status.evaluate((el) => el.textContent)).toBe('Copied\u00a0')
})

test('the button and its announcements follow the nearest lang; an explicit label wins', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div lang="fr"><c2-copy-button value="hello" reveal="always"></c2-copy-button><c2-copy-button value="x" reveal="always" label="Dupliquer"></c2-copy-button></div>',
  )
  await clipboard(page)
  await expect(page.getByRole('button', { name: 'Dupliquer', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Copier', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copié', exact: true })).toBeVisible()
  await expect(page.locator('c2-copy-button').first().locator('[role="status"]')).toHaveText('Copié')
})

test('a pinned button stays in its corner while the source scrolls, without styling its host', async ({ page, renderScenario }) => {
  await renderScenario(`
    <pre id="code" style="position: relative; height: 80px; width: 200px; overflow: auto; margin: 0">${'line\n'.repeat(40)}<c2-copy-button pin reveal="always"></c2-copy-button></pre>`)
  const host = page.locator('c2-copy-button')
  const button = page.getByRole('button', { name: 'Copy', exact: true })
  const before = (await button.boundingBox())!
  await page.locator('#code').evaluate((el) => (el.scrollTop = 200))
  await expect.poll(async () => (await button.boundingBox())!.y).toBeCloseTo(before.y, 0)
  await expect(host).not.toHaveAttribute('style')
})
