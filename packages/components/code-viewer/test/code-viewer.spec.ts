import type { Page } from '@playwright/test'
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

test('the css-variables theme colours tokens and the frame from the --c2-code-viewer__theme--* variables', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-code-viewer theme="css-variables" language="javascript" code="const a = 1;" style="--c2-code-viewer__theme--token-keyword: rgb(1, 2, 3); --c2-code-viewer__theme--background: rgb(250, 240, 230)"></c2-code-viewer>',
  )
  await expect(page.locator('pre.shiki:not(.plain)')).toBeVisible()
  await expect(page.locator('pre code span', { hasText: /^const$/ })).toHaveCSS('color', 'rgb(1, 2, 3)')
  await expect(page.locator('c2-code-viewer .c2-code-viewer')).toHaveCSS('background-color', 'rgb(250, 240, 230)')
})

const LIGHT_BG = 'rgb(255, 255, 255)' // github-light
const DARK_BG = 'rgb(13, 17, 23)' // github-dark-default
const dual = (scheme: string) =>
  `<c2-code-viewer data-scheme="${scheme}" ${scheme === 'auto' ? '' : `color-scheme="${scheme}"`} language="ts" theme="github-light" dark-theme="github-dark-default" code="const a = 1"></c2-code-viewer>`
const frame = (page: Page, scheme: string) => page.locator(`c2-code-viewer[data-scheme="${scheme}"] .c2-code-viewer`)
const keyword = (page: Page, scheme: string) => page.locator(`c2-code-viewer[data-scheme="${scheme}"] pre.shiki span`, { hasText: /^const$/ })

test.describe('color-scheme="auto"', () => {
  test('follows a dark color-scheme on the root, on a light OS', async ({ page, renderScenario }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await renderScenario(`<style>:root { color-scheme: dark }</style>${dual('auto')}${dual('dark')}`)
    await expect(page.locator('pre.shiki:not(.plain)')).toHaveCount(2)
    await expect(frame(page, 'auto')).toHaveCSS('background-color', DARK_BG)
    const darkKeyword = await keyword(page, 'dark').evaluate((el) => getComputedStyle(el).color)
    await expect(keyword(page, 'auto')).toHaveCSS('color', darkKeyword)
    await accessible(page)
  })

  test('follows a light color-scheme on the root, on a dark OS', async ({ page, renderScenario }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await renderScenario(`<style>:root { color-scheme: light }</style>${dual('auto')}${dual('light')}`)
    await expect(page.locator('pre.shiki:not(.plain)')).toHaveCount(2)
    await expect(frame(page, 'auto')).toHaveCSS('background-color', LIGHT_BG)
    const lightKeyword = await keyword(page, 'light').evaluate((el) => getComputedStyle(el).color)
    await expect(keyword(page, 'auto')).toHaveCSS('color', lightKeyword)
  })

  test('follows the color-scheme of an ancestor', async ({ page, renderScenario }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await renderScenario(`<style>:root { color-scheme: light }</style><div style="color-scheme: dark; background: #000">${dual('auto')}</div>`)
    await expect(frame(page, 'auto')).toHaveCSS('background-color', DARK_BG)
  })

  test('switches live with the page theme', async ({ page, renderScenario }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await renderScenario(`<style>:root { color-scheme: light } :root[data-theme='dark'] { color-scheme: dark }</style>${dual('auto')}`)
    await expect(frame(page, 'auto')).toHaveCSS('background-color', LIGHT_BG)
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
    await expect(frame(page, 'auto')).toHaveCSS('background-color', DARK_BG)
    await page.evaluate(() => delete document.documentElement.dataset.theme)
    await expect(frame(page, 'auto')).toHaveCSS('background-color', LIGHT_BG)
  })

  test('follows the OS preference while nothing on the page sets color-scheme', async ({ page, renderScenario }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await renderScenario(dual('auto'))
    await expect(frame(page, 'auto')).toHaveCSS('background-color', DARK_BG)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(frame(page, 'auto')).toHaveCSS('background-color', LIGHT_BG)
    await accessible(page)
  })

  test('only a viewer with a dark-theme falls back to the OS, and setting one later opts it in', async ({ page, renderScenario }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await renderScenario('<c2-code-viewer data-scheme="single" language="ts" theme="github-light" code="const a = 1"></c2-code-viewer>')
    const host = page.locator('c2-code-viewer')
    await expect(page.locator('pre.shiki:not(.plain)')).toBeVisible()
    // A single light theme keeps its light frame, and its scrollbars are not turned dark under it.
    await expect(frame(page, 'single')).toHaveCSS('background-color', LIGHT_BG)
    await expect(frame(page, 'single')).toHaveCSS('color-scheme', 'normal')
    expect(await host.evaluate((el) => el.matches(':state(scheme-from-os)'))).toBe(false)
    await props(host, { darkTheme: 'github-dark-default' })
    await expect.poll(() => host.evaluate((el) => el.matches(':state(scheme-from-os)'))).toBe(true)
    await expect(frame(page, 'single')).toHaveCSS('background-color', DARK_BG)
  })

  test('an author background that is not a colour still applies', async ({ page, renderScenario }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await renderScenario(`<style>c2-code-viewer { --c2-code-viewer--background: linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6)) }</style>${dual('auto')}`)
    await expect(page.locator('pre.shiki:not(.plain)')).toBeVisible()
    await expect(frame(page, 'auto')).toHaveCSS('background-image', /linear-gradient/)
  })

  test('picks up a color-scheme the page sets after the viewer connected', async ({ page, renderScenario }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await renderScenario(dual('auto'))
    await expect(frame(page, 'auto')).toHaveCSS('background-color', DARK_BG)
    // A theme stylesheet that arrives late pins the page to light: the OS fallback must step aside.
    await page.addStyleTag({ content: ':root { color-scheme: light }' })
    await expect(frame(page, 'auto')).toHaveCSS('background-color', LIGHT_BG)
    // And a theme set through an attribute on <html>, with the rule already in place.
    await page.addStyleTag({ content: ':root[data-theme="dark"] { color-scheme: dark }' })
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
    await expect(frame(page, 'auto')).toHaveCSS('background-color', DARK_BG)
  })
})

test('explicit color-scheme values ignore the page and the OS', async ({ page, renderScenario }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await renderScenario(`<style>:root { color-scheme: dark }</style>${dual('light')}<div style="color-scheme: light">${dual('dark')}</div>`)
  await expect(page.locator('pre.shiki:not(.plain)')).toHaveCount(2)
  await expect(frame(page, 'light')).toHaveCSS('background-color', LIGHT_BG)
  await expect(frame(page, 'dark')).toHaveCSS('background-color', DARK_BG)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => (document.documentElement.style.colorScheme = 'light'))
  await expect(frame(page, 'light')).toHaveCSS('background-color', LIGHT_BG)
  await expect(frame(page, 'dark')).toHaveCSS('background-color', DARK_BG)
})
