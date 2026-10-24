import type { Page } from '@playwright/test'
import type { TableOfContents } from '../src/table-of-contents'
import { test, expect, accessible, watch } from '../../../../tests/component-fixture'

const article = `
  <article>
    <h1 id="title">Guide</h1>
    <section><h2 id="install">Install</h2><p>Install the package.</p></section>
    <section><h2 id="usage">Usage</h2><p>Use it.</p></section>
    <section><h3 id="usage-forms">With forms</h3><p>Forms.</p></section>
    <section><h3 id="usage-tables" data-toc-label="Tables">With tables and grids</h3><p>Tables.</p></section>
    <section><h2 id="theming">Theming</h2><p>Theme it.</p></section>
    <section><h2>No id, not listed</h2></section>
    <section><h2 id="hidden" data-toc-ignore>Ignored</h2></section>
    <section><h2 id="faq">FAQ</h2><p>Questions.</p></section>
  </article>
`

const toc = (page: Page) => page.locator('c2-table-of-contents')
const link = (page: Page, name: string) => page.getByRole('link', { name, exact: true })
const current = (page: Page) => toc(page).locator('a[aria-current="true"]')

test('lists the headings of the page, nested by level', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents>${article}`)
  const nav = page.getByRole('navigation', { name: 'On this page' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link')).toHaveText(['Install', 'Usage', 'With forms', 'Tables', 'Theming', 'FAQ'])
  // h3 entries sit in a list nested inside the h2 entry's item.
  await expect(
    nav
      .getByRole('listitem')
      .filter({ has: link(page, 'Usage') })
      .getByRole('list')
      .getByRole('link'),
  ).toHaveText(['With forms', 'Tables'])
  await expect(link(page, 'Install')).toHaveAttribute('href', '#install')
  await expect(current(page)).toHaveText('Install')
  await accessible(page)
})

test('follows the reader as the page scrolls', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents>${article}`)
  await watch(toc(page), 'active-change')
  await page.locator('#theming').evaluate((heading) => heading.scrollIntoView({ block: 'start' }))
  await expect(current(page)).toHaveText('Theming')
  await expect(link(page, 'Theming')).toHaveCSS('color', 'rgb(2, 101, 220)')
  await expect(link(page, 'Install')).not.toHaveAttribute('aria-current')
  await page.mouse.wheel(0, -400)
  await expect(current(page)).toHaveText('Tables')
  await expect.poll(() => toc(page).evaluate((el) => (el as TableOfContents).activeId)).toBe('usage-tables')
  const events = JSON.parse((await toc(page).getAttribute('data-events')) ?? '[]') as { id: string }[]
  expect(events.at(-1)?.id).toBe('usage-tables')
})

test('the last section is current at the end of the page', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents>${article}<div style="height: 120px"></div>`)
  await page.mouse.wheel(0, 100000)
  await expect(current(page)).toHaveText('FAQ')
})

test('the indicator slides to the current entry', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents>${article}`)
  const indicator = toc(page).locator('[part="indicator"]')
  const linkBox = async (name: string) => (await link(page, name).boundingBox())!
  await expect.poll(async () => Math.round((await indicator.boundingBox())!.y - (await linkBox('Install')).y)).toBe(0)
  await page.locator('#faq').evaluate((heading) => heading.scrollIntoView({ block: 'start' }))
  await expect.poll(async () => Math.round((await indicator.boundingBox())!.y - (await linkBox('FAQ')).y)).toBe(0)
})

test('activating a link scrolls to its section, focuses it and updates the URL', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents>${article}`)
  await link(page, 'Theming').click()
  const heading = page.locator('#theming')
  await expect(heading).toBeFocused()
  await expect(heading).toHaveAttribute('tabindex', '-1')
  await expect(current(page)).toHaveText('Theming')
  await expect.poll(() => heading.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0)
  await expect.poll(() => new URL(page.url()).hash).toBe('#theming')
  // Sections passed on the way never become current, and the temporary tabindex leaves with focus.
  await expect(current(page)).toHaveText('Theming')
  await page.keyboard.press('Tab')
  await expect(heading).not.toHaveAttribute('tabindex')
})

test('a clicked section near the end stays current once the scroll ends', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents>${article}`)
  // Theming cannot reach the top: only the short FAQ section follows it.
  await page.locator('#faq').evaluate((heading) => (heading.parentElement!.style.minHeight = '0'))
  await page.evaluate(() => {
    const ended = new Promise((resolve) => document.addEventListener('scrollend', () => setTimeout(resolve), { once: true, capture: true }))
    Object.assign(window, { ended })
  })
  await link(page, 'Theming').click()
  await page.evaluate(() => (window as unknown as { ended: Promise<void> }).ended)
  await expect(current(page)).toHaveText('Theming')
  // Scrolling again hands the list back to the spy: Theming never reached the line, so the section above it is current.
  await page.mouse.wheel(0, -100)
  await expect(current(page)).toHaveText('Tables')
})

test('works from the keyboard', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents>${article}`)
  await tab()
  await expect(link(page, 'Install')).toBeFocused()
  await tab()
  await tab()
  await expect(link(page, 'With forms')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#usage-forms')).toBeFocused()
  await expect(current(page)).toHaveText('With forms')
})

test('offset accounts for a sticky header, for the spy and for the scroll', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents offset="60"></c2-table-of-contents><article><header class="sticky">Header</header>${article}</article>`)
  await link(page, 'FAQ').click()
  await expect.poll(() => page.locator('#faq').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(60)
  await page.mouse.wheel(0, -40)
  await expect.poll(() => page.locator('#faq').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeGreaterThan(61)
  await expect(current(page)).not.toHaveText('FAQ')
})

test('keep-url leaves the address alone', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents keep-url></c2-table-of-contents>${article}`)
  const url = page.url()
  await link(page, 'Usage').click()
  await expect(page.locator('#usage')).toBeFocused()
  expect(page.url()).toBe(url)
})

test('reads only the element named by for, with a custom selector', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-table-of-contents for="api" selector="h3, [role=heading]"></c2-table-of-contents>
    <article>
      <h2 id="outside">Outside</h2>
      <div id="api">
        <h3 id="props">Properties</h3>
        <div role="heading" aria-level="4" id="props-value">value</div>
        <h3 id="events">Events</h3>
      </div>
    </article>
  `)
  await expect(toc(page).getByRole('link')).toHaveText(['Properties', 'value', 'Events'])
  await expect(
    page
      .getByRole('listitem')
      .filter({ has: link(page, 'Properties') })
      .getByRole('list')
      .getByRole('link'),
  ).toHaveText(['value'])
})

test('follows the page as headings are added, renamed and removed', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents>${article}`)
  await page.locator('article').evaluate((el) => {
    el.querySelector('#install')!.textContent = 'Installation'
    el.querySelector('#faq')!.remove()
    el.insertAdjacentHTML('beforeend', '<section><h2 id="changelog">Changelog</h2></section>')
  })
  await expect(toc(page).getByRole('link')).toHaveText(['Installation', 'Usage', 'With forms', 'Tables', 'Theming', 'Changelog'])
})

test('items lists sections given by the author', async ({ page, renderScenario }) => {
  const items = JSON.stringify([
    { id: 'usage', label: 'How to use', level: 3 },
    { id: 'usage-forms', label: 'Forms', level: 5 },
    { id: 'faq', label: 'Questions', level: 3 },
  ])
  await renderScenario(`<c2-table-of-contents items='${items}' label="Contents"></c2-table-of-contents>${article}`)
  const nav = page.getByRole('navigation', { name: 'Contents' })
  await expect(nav.getByRole('link')).toHaveText(['How to use', 'Forms', 'Questions'])
  // A level that skips one nests a single step.
  await expect(
    nav
      .getByRole('listitem')
      .filter({ has: link(page, 'How to use') })
      .getByRole('list')
      .getByRole('link'),
  ).toHaveText(['Forms'])
  await link(page, 'Questions').click()
  await expect(page.locator('#faq')).toBeFocused()
})

test('content shown after the list settles is followed from its top', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table-of-contents></c2-table-of-contents><div hidden id="panel">${article}</div>`)
  // While hidden no heading has a position, so none counts as read.
  await expect(current(page)).toHaveText('Install')
  await page.locator('#panel').evaluate((panel) => panel.removeAttribute('hidden'))
  await expect(current(page)).toHaveText('Install')
  await page.locator('#usage').evaluate((heading) => heading.scrollIntoView({ block: 'start' }))
  await expect(current(page)).toHaveText('Usage')
})

test('renders nothing without sections', async ({ page, renderScenario }) => {
  await renderScenario('<c2-table-of-contents></c2-table-of-contents><article><p>No headings.</p></article>')
  await expect(page.getByRole('navigation')).toHaveCount(0)
})

test('the default title follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-table-of-contents></c2-table-of-contents></div>${article}`)
  await expect(page.getByRole('navigation', { name: 'Sur cette page' })).toBeVisible()
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'vi'))
  await expect(page.getByRole('navigation', { name: 'Trên trang này' })).toBeVisible()
})
