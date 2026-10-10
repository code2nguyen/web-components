import type { Locator, Page } from '@playwright/test'
import type { MathFormula } from '../src/math'
import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

/** Local names of every element inside the rendered `<math>`, in document order. */
const tags = (locator: Locator) =>
  locator.evaluate((element) => [...(element.shadowRoot!.querySelector('math')?.querySelectorAll('*') ?? [])].map((node) => node.localName))

const mathAttr = (locator: Locator, name: string) =>
  locator.evaluate((element, attr) => element.shadowRoot!.querySelector('math')?.getAttribute(attr) ?? null, name)

const hasError = (locator: Locator) => locator.evaluate((element) => element.shadowRoot!.querySelector('.error') !== null)

test('renders inline TeX as native MathML with its source annotated', async ({ page, renderScenario }) => {
  await renderScenario('<p>The ratio is <c2-math value="\\frac{a}{b}"></c2-math> here.</p>')
  const formula = page.locator('c2-math')
  expect(await tags(formula)).toEqual(expect.arrayContaining(['semantics', 'mfrac', 'annotation']))
  expect(await mathAttr(formula, 'display')).toBeNull()
  expect(await formula.evaluate((element) => element.shadowRoot!.querySelector('annotation')!.textContent)).toBe('\\frac{a}{b}')
  expect(await formula.evaluate((element: MathFormula) => element.mathml.startsWith('<math'))).toBe(true)
  await expect(formula).toHaveCSS('display', 'inline')
  await accessible(page)
})

test('display renders a block formula', async ({ page, renderScenario }) => {
  await renderScenario('<c2-math display value="\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt\\pi}{2}"></c2-math>')
  const formula = page.locator('c2-math')
  expect(await mathAttr(formula, 'display')).toBe('block')
  await expect(formula).toHaveCSS('display', 'block')
  expect(await tags(formula)).toEqual(expect.arrayContaining(['msubsup', 'msqrt', 'mfrac']))
})

test('reads its text content or a math/tex script, and follows edits', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-math id="text">E = mc^2</c2-math>
    <c2-math id="script" display><script type="math/tex">
      a^2 + b^2 = c^2
    </script></c2-math>`)
  expect(await page.locator('#text').evaluate((element: MathFormula) => element.text)).toBe('E = mc^2')
  expect(await tags(page.locator('#text'))).toContain('msup')
  expect(await page.locator('#script').evaluate((element: MathFormula) => element.text)).toBe('a^2 + b^2 = c^2')

  await page.locator('#text').evaluate(async (element: MathFormula) => {
    element.textContent = '\\sqrt{2}'
    await new Promise(requestAnimationFrame)
    await element.updateComplete
  })
  await expect.poll(() => tags(page.locator('#text'))).toContain('msqrt')
})

test('common constructs render the expected MathML', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-math id="matrix" value="\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}"></c2-math>
    <c2-math id="aligned" display value="\\begin{aligned} a &= b + c \\\\ d &= e \\end{aligned}"></c2-math>
    <c2-math id="accent" value="\\hat{x} + \\vec{v}"></c2-math>
    <c2-math id="operator" value="\\operatorname{rank}(A) + \\RR"></c2-math>`)
  expect(await tags(page.locator('#matrix'))).toEqual(expect.arrayContaining(['mtable', 'mtr', 'mtd']))
  expect(await tags(page.locator('#aligned'))).toEqual(expect.arrayContaining(['mtable']))
  expect(await tags(page.locator('#accent'))).toContain('mover')
  const operator = await page.locator('#operator').evaluate((element) => element.shadowRoot!.querySelector('math')!.textContent)
  // \operatorname keeps the word, and the page-wide \RR macro from configureMath expands to a double-struck R.
  expect(operator).toContain('rank')
  expect(operator).toContain('ℝ')
})

test('untrusted commands are rejected: no links, images, classes or styles', async ({ page, renderScenario }) => {
  const sources = [
    '\\href{javascript:alert(1)}{click}',
    '\\url{https://attacker.test/?q=secret}',
    '\\includegraphics{https://attacker.test/pixel.png}',
    '\\style{background:url(https://attacker.test/x)}{x}',
    '\\class{evil}{x}',
    '\\htmlId{evil}{x}',
  ]
  await renderScenario(sources.map((source, index) => `<c2-math id="m${index}" value="${source.replaceAll('"', '&quot;')}"></c2-math>`).join(''))
  for (let index = 0; index < sources.length; index++) {
    const formula = page.locator(`#m${index}`)
    expect(await hasError(formula), sources[index]).toBe(true)
    expect(await formula.evaluate((element) => element.shadowRoot!.querySelectorAll('a, img, [href], [style], .evil, #evil').length), sources[index]).toBe(0)
  }
})

test('a macro bomb fails fast with math-error instead of hanging', async ({ page, renderScenario }) => {
  await renderScenario('<c2-math></c2-math>')
  const formula = page.locator('c2-math')
  await watch(formula, 'math-error')
  const started = Date.now()
  await props(formula, { value: '\\def\\a{\\a\\a}\\a' })
  expect(Date.now() - started).toBeLessThan(2000)
  expect(await hasError(formula)).toBe(true)
  const events = JSON.parse((await formula.getAttribute('data-events')) ?? '[]') as { message: string }[]
  expect(events).toHaveLength(1)
  expect(events[0].message).toMatch(/expansion|maxExpand/i)
})

test('a parse error shows the source, then a corrected value renders again', async ({ page, renderScenario }) => {
  await renderScenario('<c2-math value="\\frac{1}{"></c2-math>')
  const formula = page.locator('c2-math')
  expect(await hasError(formula)).toBe(true)
  expect(await formula.evaluate((element) => element.shadowRoot!.querySelector('.error')!.textContent)).toBe('\\frac{1}{')
  await props(formula, { value: '\\frac{1}{2}' })
  await expect.poll(() => tags(formula)).toContain('mfrac')
  expect(await hasError(formula)).toBe(false)
})

test('element macros override page-wide ones', async ({ page, renderScenario }) => {
  await renderScenario('<c2-math value="\\RR"></c2-math>')
  const formula = page.locator('c2-math')
  await props(formula, { macros: { '\\RR': '\\mathrm{reals}' } })
  await expect.poll(() => formula.evaluate((element) => element.shadowRoot!.querySelector('math')!.textContent)).toContain('reals')
})

async function copyText(page: Page) {
  return page.evaluate(() => {
    let plain = ''
    let rich = ''
    document.addEventListener(
      'copy',
      (event) => {
        plain = event.clipboardData!.getData('text/plain')
        rich = event.clipboardData!.getData('text/html')
      },
      { once: true },
    )
    const host = document.querySelector('c2-math')!
    const range = document.createRange()
    range.selectNodeContents(host.shadowRoot!.querySelector('math')!)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
    document.execCommand('copy')
    return { plain, rich }
  })
}

test('copying a formula puts its TeX on the clipboard as text and its MathML as HTML', async ({ page, renderScenario, browserName }) => {
  test.skip(browserName !== 'chromium', 'execCommand copy with a selection inside a shadow root is Chromium-only')
  await renderScenario('<c2-math value="x^2 + 1"></c2-math>')
  const copied = await copyText(page)
  expect(copied.plain).toBe('x^2 + 1')
  expect(copied.rich).toContain('<math')
})

test('an overflowing display formula scrolls and becomes focusable', async ({ page, renderScenario }) => {
  const long = Array.from({ length: 40 }, (_, i) => `x_{${i}}`).join(' + ')
  await renderScenario(`<div style="width: 200px"><c2-math display value="${long}"></c2-math></div>`)
  await expect.poll(() => page.locator('c2-math').evaluate((element) => element.shadowRoot!.querySelector('.scroller')!.getAttribute('tabindex'))).toBe('0')
})
