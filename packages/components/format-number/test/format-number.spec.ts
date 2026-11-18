import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

const number = (id: string) => `#${id} [part="number"]`

test('formats a decimal with the locale grouping and keeps the raw value', async ({ page, scenario }) => {
  await scenario()
  const data = page.locator(number('subject'))
  await expect(data).toHaveText('1,234,567.891')
  await expect(data).toHaveAttribute('value', '1234567.891')
  await expect(data).not.toHaveAttribute('title')
})

test('formats currency, percent and units', async ({ page, scenario }) => {
  await scenario('types')
  await expect(page.locator(number('currency'))).toHaveText('€1,234.50')
  await expect(page.locator(number('yen'))).toHaveText('¥1,235')
  await expect(page.locator(number('accounting'))).toHaveText('($1,234.50)')
  await expect(page.locator(number('code'))).toHaveText(/^USD\s12\.00$/)
  await expect(page.locator(number('percent'))).toHaveText('12.3%')
  await expect(page.locator(number('unit'))).toHaveText('88 km/h')
  await expect(page.locator(number('unit-long'))).toHaveText('21 degrees Celsius')
  // The symbol, sign and unit name are the `unit` part, the digits are not.
  await expect(page.locator('#currency [part="unit"]')).toHaveText('€')
  await expect(page.locator('#percent [part="unit"]')).toHaveText('%')
  await expect(page.locator('#unit [part="unit"]')).toHaveText('km/h')
})

test('shortens with compact notation and puts the full figure in the title', async ({ page, scenario }) => {
  await scenario('notation')
  await expect(page.locator(number('compact'))).toHaveText('1.2M')
  await expect(page.locator(number('compact'))).toHaveAttribute('title', '1,234,567')
  await expect(page.locator('#compact [part="unit"]')).toHaveText('M')
  await expect(page.locator(number('compact-long'))).toHaveText('1.2 million')
  await expect(page.locator(number('scientific'))).toHaveText('1.235E5')
  await expect(page.locator(number('compact-currency'))).toHaveText('$2.5M')
  await expect(page.locator(number('compact-currency'))).toHaveAttribute('title', '$2,500,000.00')
})

test('scales byte sizes to the largest unit that fits', async ({ page, scenario }) => {
  await scenario('bytes')
  await expect(page.locator(number('b'))).toHaveText('512 byte')
  await expect(page.locator(number('kb'))).toHaveText('1.5 kB')
  await expect(page.locator(number('kb'))).toHaveAttribute('title', '1,536 bytes')
  await expect(page.locator(number('mb'))).toHaveText('2 MB')
  await expect(page.locator(number('round-up'))).toHaveText('1 MB')
  await expect(page.locator(number('binary'))).toHaveText('1 MB')
  await expect(page.locator(number('bits'))).toHaveText('1.5 Gb')
})

test('follows the digit, grouping and sign options', async ({ page, scenario }) => {
  await scenario('digits')
  await expect(page.locator(number('min-fraction'))).toHaveText('5.00')
  await expect(page.locator(number('significant'))).toHaveText('123,000')
  await expect(page.locator(number('integer'))).toHaveText('007')
  await expect(page.locator(number('no-grouping'))).toHaveText('2026')
  await expect(page.locator(number('sign'))).toHaveText('+42')
  await expect(page.locator(number('zero'))).toHaveText('0')
})

test('takes the locale from the nearest lang attribute and follows a change', async ({ page, scenario }) => {
  await scenario('lang')
  const data = page.locator(number('subject'))
  await expect(data).toHaveText(/^1\.234,50\s€$/)
  await page.locator('p').evaluate((element) => element.setAttribute('lang', 'en-US'))
  await expect(data).toHaveText('€1,234.50')
})

test('shows the default slot until it holds a number, and survives a bad currency', async ({ page, scenario }) => {
  await scenario('fallback')
  await expect(page.locator('#unset')).toHaveText('—')
  await expect(page.locator(number('unset'))).toHaveCount(0)
  await expect(page.locator('#invalid')).toHaveText('n/a')
  await expect(page.locator(number('bad-currency'))).toHaveText('1,234.5')

  await page.locator('#unset').evaluate((element) => ((element as HTMLElementTagNameMap['c2-format-number']).value = 42.5))
  await expect(page.locator(number('unset'))).toHaveText('42.5')
})

test('colours gains, losses and the unit through its variables', async ({ page, scenario }) => {
  await scenario('colour')
  await expect(page.locator(number('gain'))).toHaveCSS('color', 'rgb(22, 163, 74)')
  await expect(page.locator(number('loss'))).toHaveCSS('color', 'rgb(220, 38, 38)')
  await expect(page.locator(number('flat'))).toHaveCSS('color', 'rgb(0, 0, 0)')
  await expect(page.locator('#gain [part="unit"]')).toHaveCSS('color', 'rgb(113, 113, 122)')
})

test('c2-delta draws an arrow, the sign and the good or bad colour of a change', async ({ page, scenario }) => {
  await scenario('delta')
  await expect(page.locator(number('rise'))).toHaveText('+12.4%')
  await expect(page.locator(number('rise'))).toHaveClass(/\bgood\b/)
  await expect(page.locator('#rise .arrow')).toHaveAttribute('aria-label', 'Increase, better')
  await expect(page.locator('#rise [slot="comparison"]')).toBeVisible()
  await expect(page.locator('#rise [slot="comparison"]')).toHaveCSS('margin-inline-start', /^[1-9]/)

  await expect(page.locator(number('fall'))).toHaveClass(/\bbad\b/)
  await expect(page.locator('#fall .arrow')).toHaveAttribute('aria-label', 'Decrease, worse')
  await expect(page.locator(number('fall'))).toHaveText('-3.1%')

  // 0.01% shows as "0%": flat, with no arrow.
  await expect(page.locator(number('rounds-flat'))).toHaveText('0%')
  await expect(page.locator(number('rounds-flat'))).toHaveClass(/\bflat\b/)
  await expect(page.locator('#rounds-flat [part="arrow"]')).toHaveCount(0)
})

test('better="lower" makes a fall good and a rise bad', async ({ page, scenario }) => {
  await scenario('delta')
  await expect(page.locator(number('cost-up'))).toHaveClass(/\bbad\b/)
  await expect(page.locator('#cost-up .arrow')).toHaveAttribute('aria-label', 'Increase, worse')
  await expect(page.locator(number('cost-down'))).toHaveClass(/\bgood\b/)
  await expect(page.locator('#cost-down .arrow')).toHaveAttribute('aria-label', 'Decrease, better')
})

test('c2-format-number draws no arrow, tone or comparison, and c2-delta takes its sign-display', async ({ page, scenario }) => {
  await scenario('delta')
  const plain = page.locator(number('plain'))
  await expect(plain).toHaveText('-5')
  await expect(plain).toHaveClass(/^\s*negative\s*$/)
  await expect(page.locator('#plain [part="arrow"]')).toHaveCount(0)
  await expect(page.locator('#plain [part="comparison"]')).toHaveCount(0)
  await expect(page.locator(number('sign-auto'))).toHaveText('5')
})

test('the increase-icon slot replaces the arrow', async ({ page, scenario }) => {
  await scenario('delta')
  await expect(page.locator('#custom-icon [part="arrow"] svg')).toBeHidden()
  await expect(page.locator('#custom-icon b')).toBeVisible()
  await expect(page.locator('#custom-icon .arrow')).toHaveAttribute('aria-label', 'Increase, better')
})

test('--c2-delta__arrow--display: none hides the arrow and its gap but keeps its name', async ({ page, scenario }) => {
  await scenario('delta')
  await expect(page.locator(number('no-arrow'))).toHaveText('7')
  await expect(page.locator('#no-arrow svg')).toBeHidden()
  const arrow = page.locator('#no-arrow .arrow')
  await expect(arrow).toHaveAttribute('aria-label', 'Increase, better')
  expect(await arrow.evaluate((element) => element.getBoundingClientRect().width)).toBe(0)
  await expect(page.locator('#no-arrow').getByRole('img', { name: 'Increase, better' })).toHaveCount(1)
})

test('hiding the arrow part keeps its name, and ::part(arrow) still sets its gap', async ({ page, scenario }) => {
  await scenario('delta')
  await page.addStyleTag({ content: '#fall::part(arrow) { display: none } #rise::part(arrow) { margin-inline-end: 0px }' })
  await expect(page.locator('#fall').getByRole('img', { name: 'Decrease, worse' })).toHaveCount(1)
  await expect(page.locator('#fall svg')).toBeHidden()
  await expect(page.locator('#rise [part="arrow"]')).toHaveCSS('margin-inline-end', '0px')
})

test('colours a change and its comparison label through their variables', async ({ page, scenario }) => {
  await scenario('delta-colour')
  await expect(page.locator(number('good'))).toHaveCSS('color', 'rgb(0, 128, 0)')
  await expect(page.locator('#good [part="arrow"] path')).toHaveCSS('fill', 'rgb(0, 128, 0)')
  // The tone wins over the sign colour.
  await expect(page.locator(number('bad'))).toHaveCSS('color', 'rgb(200, 0, 0)')
  await expect(page.locator(number('flat'))).toHaveCSS('color', 'rgb(100, 100, 100)')
  await expect(page.locator('#good [slot="comparison"]')).toHaveCSS('color', 'rgb(10, 20, 30)')
})

test('keeps the comparison beside the fallback while there is no number', async ({ page, scenario }) => {
  await scenario('delta')
  await expect(page.locator('#pending [part="number"]')).toHaveCount(0)
  await expect(page.locator('#pending [slot="comparison"]')).toBeVisible()
})

test('names the arrow in the language of the page', async ({ page, scenario }) => {
  await scenario('delta-fr')
  await expect(page.locator('#subject .arrow')).toHaveAttribute('aria-label', 'Hausse, mieux')
})

test('has no axe violations with c2-delta', async ({ page, scenario }) => {
  await scenario('delta')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('has no axe violations', async ({ page, scenario }) => {
  await scenario('types')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
