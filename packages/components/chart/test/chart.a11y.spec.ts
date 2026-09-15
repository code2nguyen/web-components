import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const scenarioName of ['gauge', 'scatter', 'candlestick']) {
  test(`${scenarioName} has no automated accessibility violations`, async ({ page, scenario }) => {
    await scenario(scenarioName)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
