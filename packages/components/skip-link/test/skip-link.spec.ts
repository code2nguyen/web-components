import { test, expect, accessible } from '../../../../tests/component-fixture'

const page_ = `
  <c2-skip-link href="#content"></c2-skip-link>
  <nav aria-label="Site"><a href="#one">One</a> <a href="#two">Two</a></nav>
  <section id="content" aria-label="Content"><button>Inside</button></section>
`

test('stays out of sight until it takes focus', async ({ page, renderScenario, tab }) => {
  await renderScenario(page_)
  const link = page.locator('c2-skip-link').locator('[part="link"]')
  await expect(link).toHaveCSS('opacity', '0')
  await tab()
  await expect(link).toBeFocused()
  await expect(link).toHaveCSS('opacity', '1')
  await expect(link).toBeInViewport()
  await accessible(page)
  await tab()
  await expect(link).toHaveCSS('opacity', '0')
})

test('moves focus into the target, so the next Tab continues there', async ({ page, renderScenario, tab }) => {
  await renderScenario(page_)
  const url = page.url()
  const content = page.locator('#content')
  await tab()
  await page.keyboard.press('Enter')
  await expect(content).toBeFocused()
  await expect(content).toHaveAttribute('tabindex', '-1')
  await tab()
  await expect(page.getByRole('button', { name: 'Inside' })).toBeFocused()
  // The temporary tabindex goes with focus, so the section never becomes a Tab stop, and the URL is left alone.
  await expect(content).not.toHaveAttribute('tabindex')
  expect(page.url()).toBe(url)
})

test('focuses a focusable target without touching its tabindex', async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-skip-link href="#go">Skip to the action</c2-skip-link><a href="#x">Before</a><button id="go">Go</button>')
  await tab()
  await page.keyboard.press('Enter')
  await expect(page.locator('#go')).toBeFocused()
  await expect(page.locator('#go')).not.toHaveAttribute('tabindex')
})

test('leaves a target that cannot take focus as it was', async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-skip-link href="#off">Skip to the action</c2-skip-link><button id="off" disabled>Off</button>')
  await tab()
  await page.keyboard.press('Enter')
  await expect(page.locator('#off')).not.toHaveAttribute('tabindex')
  await expect(page.locator('c2-skip-link').locator('[part="link"]')).toBeFocused()
})

test("without href it targets the page's first main", async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-skip-link></c2-skip-link><a href="#x">Elsewhere</a>')
  await tab()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
})

test('a fragment that is not on the page keeps the browser navigation', async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-skip-link href="#missing"></c2-skip-link>')
  await tab()
  await page.keyboard.press('Enter')
  await expect.poll(() => new URL(page.url()).hash).toBe('#missing')
})

test('slotted text names the link', async ({ page, renderScenario }) => {
  await renderScenario('<c2-skip-link href="#results">Skip to results</c2-skip-link><div id="results"></div>')
  await expect(page.getByRole('link', { name: 'Skip to results', exact: true })).toHaveCount(1)
  await accessible(page)
})

test('the default text follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-skip-link></c2-skip-link></div>')
  await expect(page.getByRole('link', { name: 'Aller au contenu principal', exact: true })).toHaveCount(1)
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'vi'))
  await expect(page.getByRole('link', { name: 'Chuyển đến nội dung chính', exact: true })).toHaveCount(1)
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'de'))
  await expect(page.getByRole('link', { name: 'Skip to main content', exact: true })).toHaveCount(1)
})
