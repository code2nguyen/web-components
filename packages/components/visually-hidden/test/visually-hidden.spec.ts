import { test, expect, accessible } from '../../../../tests/component-fixture'

test('draws nothing but keeps its text for assistive technology', async ({ page, renderScenario }) => {
  await renderScenario('<button id="close"><span aria-hidden="true">✕</span><c2-visually-hidden>Close dialog</c2-visually-hidden></button>')
  const hidden = page.locator('c2-visually-hidden')
  const box = await hidden.boundingBox()
  expect(box?.width).toBeLessThanOrEqual(1)
  expect(box?.height).toBeLessThanOrEqual(1)
  await expect(hidden).toHaveCSS('position', 'absolute')
  await expect(page.getByRole('button', { name: 'Close dialog' })).toBeVisible()
  await expect(page.locator('#close')).toHaveAccessibleName('Close dialog')
  await accessible(page)
})

test('names and describes through id references', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-visually-hidden id="name">Search the catalog</c2-visually-hidden>
    <c2-visually-hidden id="hint">Results update as you type</c2-visually-hidden>
    <input aria-labelledby="name" aria-describedby="hint" />
  `)
  const input = page.locator('input')
  await expect(input).toHaveAccessibleName('Search the catalog')
  await expect(input).toHaveAccessibleDescription('Results update as you type')
})

test('takes no space in the layout', async ({ page, renderScenario }) => {
  await renderScenario(
    '<p id="row" style="display:inline-block">A<c2-visually-hidden>long hidden explanation</c2-visually-hidden>B</p><p id="plain" style="display:inline-block">AB</p>',
  )
  const [row, plain] = await Promise.all([page.locator('#row').boundingBox(), page.locator('#plain').boundingBox()])
  expect(row?.width).toBe(plain?.width)
  expect(row?.height).toBe(plain?.height)
})

test('page styles on the tag cannot unhide it', async ({ page, renderScenario }) => {
  await renderScenario(`
    <style>c2-visually-hidden { position: static !important; width: 200px !important; height: 40px !important; clip-path: none !important }</style>
    <c2-visually-hidden style="overflow: visible !important">Still hidden</c2-visually-hidden>
  `)
  const hidden = page.locator('c2-visually-hidden')
  await expect(hidden).toHaveCSS('position', 'absolute')
  await expect(hidden).toHaveCSS('overflow', 'hidden')
  const box = await hidden.boundingBox()
  expect(box?.width).toBeLessThanOrEqual(1)
})

test('keeps a live region announced', async ({ page, renderScenario }) => {
  await renderScenario('<c2-visually-hidden role="status" aria-live="polite">3 results</c2-visually-hidden>')
  await expect(page.getByRole('status')).toHaveText('3 results')
})

test('focusable content shows while focus is inside it', async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-visually-hidden focusable><a href="#comments">Skip to comments</a></c2-visually-hidden><a href="#next">Next</a>')
  const hidden = page.locator('c2-visually-hidden')
  const link = page.getByRole('link', { name: 'Skip to comments' })
  expect((await hidden.boundingBox())?.width).toBeLessThanOrEqual(1)
  await tab()
  await expect(link).toBeFocused()
  await expect(hidden).toHaveCSS('position', 'static')
  expect((await link.boundingBox())?.width).toBeGreaterThan(20)
  await accessible(page)
  await tab()
  await expect(page.getByRole('link', { name: 'Next' })).toBeFocused()
  await expect(hidden).toHaveCSS('position', 'absolute')
})

test('without focusable, focused content stays hidden', async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-visually-hidden><a href="#x">Hidden link</a></c2-visually-hidden>')
  await tab()
  await expect(page.getByRole('link', { name: 'Hidden link' })).toBeFocused()
  await expect(page.locator('c2-visually-hidden')).toHaveCSS('position', 'absolute')
})

test('focusable="false", as a framework writes it, stays hidden', async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-visually-hidden focusable="false"><a href="#x">Hidden link</a></c2-visually-hidden>')
  await tab()
  await expect(page.getByRole('link', { name: 'Hidden link' })).toBeFocused()
  await expect(page.locator('c2-visually-hidden')).toHaveCSS('position', 'absolute')
})

test('hidden removes it from the accessibility tree', async ({ page, renderScenario }) => {
  await renderScenario('<button>✕<c2-visually-hidden hidden>Close</c2-visually-hidden></button>')
  await expect(page.locator('c2-visually-hidden')).toHaveCSS('display', 'none')
  await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0)
})
