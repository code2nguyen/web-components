import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const header = (attributes = '', frame = '', actions?: string, after = '') => `
  <div class="frame ${frame}">
    <c2-page-header ${attributes}>
      <c2-breadcrumb slot="breadcrumb">
        <c2-link-button href="#payouts">Payouts</c2-link-button>
        <c2-link-button href="#batches">Batches</c2-link-button>
        <c2-link-button>B-0412</c2-link-button>
      </c2-breadcrumb>
      <span slot="leading" aria-hidden="true">▣</span>
      <h1>October supplier run</h1>
      <c2-badge slot="title-suffix" tone="warning">Awaiting approval</c2-badge>
      <p slot="description">12 payouts to EU suppliers, due before the SEPA cut-off.</p>
      <span slot="meta">Total €1,284,300.00</span>
      ${
        actions ??
        `<c2-link-button slot="actions" href="#export">Export</c2-link-button>
         <c2-button slot="actions" overflow-priority="2" class="reject">Reject</c2-button>
         <c2-button slot="actions" primary>Approve batch</c2-button>`
      }
      <nav slot="navigation" aria-label="Batch"><a href="#p" aria-current="page">Payouts</a> <a href="#a">Activity</a></nav>
      <div slot="toolbar"><input aria-label="Search payouts" /></div>
    </c2-page-header>
    ${after}
  </div>`

// Menu rows state their role through ElementInternals, which getByRole does not read.
const row = (page: Page, name: string) => page.locator('c2-menu-item', { hasText: name })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('renders every part with the author heading', async ({ page, renderScenario }) => {
  await renderScenario(header())
  await expect(page.getByRole('heading', { level: 1, name: 'October supplier run' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  await expect(page.getByText('Awaiting approval')).toBeVisible()
  await expect(page.getByText('12 payouts')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Batch' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search payouts' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Batches' })).toBeHidden()
  // The heading takes the title style, from the shadow root.
  expect(await page.locator('h1').evaluate((h1) => getComputedStyle(h1).fontSize)).toBe('24px')
  // The primary action is drawn last whatever its position in the markup.
  const order = await page
    .locator('c2-page-header [slot="actions"]')
    .evaluateAll((actions) =>
      actions.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((action) => action.textContent?.trim()),
    )
  expect(order).toEqual(['Export', 'Reject', 'Approve batch'])
})

test('narrow: the parent link replaces the breadcrumb, derived or slotted', async ({ page, renderScenario }) => {
  await renderScenario(header('', 'narrow'))
  const host = page.locator('c2-page-header')
  await expect(host).toHaveState('narrow')
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeHidden()
  const back = page.getByRole('link', { name: 'Back to Batches' })
  await expect(back).toBeVisible()
  await expect(back).toHaveAttribute('href', '#batches')
  await host.evaluate((element) => element.setAttribute('parent-label', 'All batches'))
  await expect(page.getByRole('link', { name: 'Back to All batches' })).toBeVisible()
  await host.evaluate((element) => element.insertAdjacentHTML('afterbegin', '<a slot="parent" href="#up">Up one level</a>'))
  await expect(page.getByRole('link', { name: 'Up one level' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Back to/ })).toHaveCount(0)
})

test('actions fold into More actions by priority; the primary never folds', async ({ page, renderScenario }) => {
  const actions = `
    <c2-button slot="actions" overflow-priority="1" class="a">Duplicate</c2-button>
    <c2-link-button slot="actions" href="#export" class="b">Export</c2-link-button>
    <c2-button slot="actions" overflow-priority="5" class="c" disabled>Archive</c2-button>
    <c2-button slot="actions" primary>Approve batch</c2-button>`
  await renderScenario(header('', '', actions))
  const host = page.locator('c2-page-header')
  await host.evaluate((element) =>
    element.addEventListener('overflow-change', (event) =>
      element.setAttribute('data-folded', (event as CustomEvent<{ folded: Element[] }>).detail.folded.map((action) => action.textContent?.trim()).join('|')),
    ),
  )
  await expect(page.getByRole('button', { name: 'More actions' })).toBeHidden()

  const width = (value: string) => host.evaluate((element, w) => ((element as HTMLElement).style.width = w), value)
  await width('640px')
  await expect(host).toHaveState('has-folded')
  const folded = () =>
    host.evaluate((element) => (element as HTMLElement & { foldedActions: Element[] }).foldedActions.map((action) => action.textContent?.trim()))
  // No priority folds first, then the lowest priority.
  await expect.poll(folded).toContain('Export')
  expect(await folded()).not.toContain('Approve batch')
  await expect(page.locator('.b')).toBeHidden()

  await width('300px')
  await expect(host).toHaveState('narrow')
  await expect.poll(folded).toEqual(expect.arrayContaining(['Duplicate', 'Export']))
  await expect(page.getByRole('button', { name: 'Approve batch' })).toBeVisible()
  await expect(host).toHaveAttribute('data-folded', /Duplicate/)

  await page.getByRole('button', { name: 'More actions' }).click()
  const exportRow = row(page, 'Export')
  await expect(exportRow).toBeVisible()
  if ((await folded()).includes('Archive')) await expect(row(page, 'Archive')).toHaveAttribute('disabled', '')
  await page.locator('.a').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicked', '')))
  await row(page, 'Duplicate').click()
  await expect(page.locator('.a')).toHaveAttribute('data-clicked', '')
  await page.getByRole('button', { name: 'More actions' }).click()
  await row(page, 'Export').click()
  await expect(page).toHaveURL(/#export$/)
})

test('a folded submit button submits its form; the menu event stays inside', async ({ page, renderScenario }) => {
  const actions = `
    <c2-button slot="actions" type="submit" class="save">Save draft</c2-button>
    <c2-button slot="actions" class="x">Preview</c2-button>
    <c2-button slot="actions" primary>Publish</c2-button>`
  await renderScenario(`<form onsubmit="event.preventDefault(); this.dataset.submitted = 'yes'">${header('', 'narrow', actions)}</form>`)
  await page.locator('form').evaluate((form) => form.addEventListener('menu-select', () => form.setAttribute('data-leaked', '')))
  await page.locator('c2-page-header').evaluate((element) => ((element as HTMLElement).style.width = '260px'))
  await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible()
  await page.getByRole('button', { name: 'More actions' }).click()
  await row(page, 'Save draft').click()
  await expect(page.locator('form')).toHaveAttribute('data-submitted', 'yes')
  await expect(page.locator('form')).not.toHaveAttribute('data-leaked', '')
})

test('sticky: the condensed bar keeps the title and the primary action until the end of the page', async ({ page, renderScenario }) => {
  await renderScenario(header('sticky', '', undefined, '<div class="tall"></div>'))
  const host = page.locator('c2-page-header')
  await watch(host, 'condensed-change')
  const primary = page.getByRole('button', { name: 'Approve batch' })
  const node = await primary.elementHandle()
  await page.mouse.wheel(0, 600)
  await expect(host).toHaveState('condensed')
  await expect(page.locator('h1')).not.toBeInViewport()
  await expect(primary).toBeInViewport()
  expect(await primary.evaluate((element, original) => element === original, node)).toBe(true)
  await page.mouse.wheel(0, 1400)
  await expect(primary).toBeInViewport()
  await expect(host.locator('[part="condensed"]')).toBeInViewport()
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(host).not.toHaveState('condensed')
  await expect(host).toHaveAttribute('data-events', '[{"condensed":true},{"condensed":false}]')
})

test('not sticky: never condenses', async ({ page, renderScenario }) => {
  await renderScenario(header('', '', undefined, '<div class="tall"></div>'))
  await page.mouse.wheel(0, 800)
  await expect(page.locator('h1')).not.toBeInViewport()
  await expect(page.locator('c2-page-header')).not.toHaveState('condensed')
})

test('inside a shell that scrolls main, the bar sticks to the top of main', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-app-shell scrolling="main" style="--c2-app-shell--height: 600px">
      <header slot="header" style="height: 56px">App</header>
      ${header('sticky', '', undefined, '<div class="tall"></div>')}
    </c2-app-shell>`)
  const host = page.locator('c2-page-header')
  await host.hover()
  await page.mouse.wheel(0, 700)
  await expect(host).toHaveState('condensed')
  await expect.poll(async () => Math.round((await host.locator('[part="condensed"]').boundingBox())?.y ?? -1)).toBe(56)
  await expect(page.getByRole('button', { name: 'Approve batch' })).toBeInViewport()
})

test('nothing is written on the host or the actions', async ({ page, renderScenario }) => {
  await renderScenario(header('', 'narrow'))
  expect(await page.locator('c2-page-header').evaluate((element) => element.getAttributeNames())).toEqual([])
  expect(await page.locator('[slot="actions"]').evaluateAll((actions) => actions.map((action) => action.getAttribute('slot')))).toEqual([
    'actions',
    'actions',
    'actions',
  ])
})

test('localised More actions and Back to', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr">${header('', 'narrow', '<c2-button slot="actions">Un</c2-button><c2-button slot="actions">Deux</c2-button><c2-button slot="actions">Trois</c2-button><c2-button slot="actions">Quatre</c2-button><c2-button slot="actions" primary>Valider</c2-button>')}</div>`,
  )
  await page.evaluate(async () => {
    const { addTranslations } = await import('/packages/core/src/localize.ts')
    addTranslations({ fr: { 'page-header': { moreActions: "Plus d'actions", backTo: 'Retour à {0}' } } })
  })
  await expect(page.getByRole('link', { name: 'Retour à Batches' })).toBeVisible()
  await page.locator('c2-page-header').evaluate((element) => ((element as HTMLElement).style.width = '300px'))
  await expect(page.getByRole('button', { name: "Plus d'actions" })).toBeVisible()
})

test('accessible, wide and narrow', async ({ page, renderScenario }) => {
  await renderScenario(header())
  await accessible(page)
  await renderScenario(header('', 'narrow'))
  await accessible(page)
})

test('a server-rendered (declarative) shadow root shows every part, wraps instead of folding and writes nothing', async ({ page, renderScenario }) => {
  await renderScenario('<div id="mount" style="width: 300px"></div>')
  await page.locator('#mount').evaluate((mount) =>
    mount.setHTMLUnsafe(`<c2-page-header><template shadowrootmode="open"></template>
      <c2-breadcrumb slot="breadcrumb"><c2-link-button href="#payouts">Payouts</c2-link-button><c2-link-button href="#batches">Batches</c2-link-button><c2-link-button>B-0412</c2-link-button></c2-breadcrumb>
      <h1>October supplier run</h1>
      <c2-badge slot="title-suffix">Draft</c2-badge>
      <c2-button slot="actions">Duplicate</c2-button><c2-button slot="actions">Export</c2-button><c2-button slot="actions" primary>Approve batch</c2-button>
    </c2-page-header>`),
  )
  const host = page.locator('c2-page-header')
  await expect(page.getByRole('heading', { name: 'October supplier run' })).toBeVisible()
  await expect(page.getByText('Draft')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Batches' })).toBeVisible()
  for (const name of ['Duplicate', 'Export', 'Approve batch']) await expect(page.getByRole('button', { name })).toBeVisible()
  await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0)
  expect(await page.locator('[slot="actions"]').evaluateAll((actions) => actions.map((action) => action.getAttribute('slot')))).toEqual([
    'actions',
    'actions',
    'actions',
  ])
  expect(await host.evaluate((element) => element.getAttributeNames())).toEqual([])
})

test('the condensed bar follows a title that changes', async ({ page, renderScenario }) => {
  await renderScenario(header('sticky', '', undefined, '<div class="tall"></div>'))
  const host = page.locator('c2-page-header')
  await page.mouse.wheel(0, 600)
  await expect(host).toHaveState('condensed')
  await page.locator('h1').evaluate((h1) => (h1.textContent = 'November supplier run'))
  await expect(host.locator('[part="condensed"]')).toContainText('November supplier run')
})

test('inside a shell that scrolls the page, the bar sits under the shell header', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-app-shell>
      <header slot="header" style="height: 56px; background: white">App</header>
      ${header('sticky', '', undefined, '<div class="tall"></div>')}
    </c2-app-shell>`)
  const host = page.locator('c2-page-header')
  await expect.poll(() => host.evaluate((element) => getComputedStyle(element).getPropertyValue('--c2-app-shell--sticky-offset').trim())).toBe('56px')
  await page.mouse.wheel(0, 700)
  await expect(host).toHaveState('condensed')
  await expect.poll(async () => Math.round((await host.locator('[part="condensed"]').boundingBox())?.y ?? -1)).toBe(56)
})

test('actions that grow after the first measurement (a late upgrade) fold', async ({ page, renderScenario }) => {
  await renderScenario(
    header(
      '',
      '',
      '<button slot="actions" class="late">A</button><button slot="actions" class="late">B</button><button slot="actions" primary>Approve</button>',
    ),
  )
  const host = page.locator('c2-page-header')
  await host.evaluate((element) => ((element as HTMLElement).style.width = '420px'))
  await expect(host).toHaveState('narrow')
  await expect(page.getByRole('button', { name: 'More actions' })).toBeHidden()
  await page.locator('.late').evaluateAll((buttons) => buttons.forEach((button) => ((button as HTMLElement).style.width = '200px')))
  await expect(host).toHaveState('has-folded')
  await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible()
})
