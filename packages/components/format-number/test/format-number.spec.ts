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

test('has no axe violations', async ({ page, scenario }) => {
  await scenario('types')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
