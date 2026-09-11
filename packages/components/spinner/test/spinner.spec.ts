import { test, expect, props, accessible } from '../../../../tests/component-fixture'

test('indeterminate progress has a name without a numeric value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-spinner>Loading files</c2-spinner>')
  const progress = page.getByRole('progressbar', { name: 'Loading files' })
  await expect(progress).not.toHaveAttribute('aria-valuenow')
  await accessible(page)
})
test('determinate progress reports and updates the current value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-spinner label="Upload" value="25" max="50"></c2-spinner>')
  const progress = page.getByRole('progressbar', { name: 'Upload' })
  await expect(progress).toHaveAttribute('aria-valuenow', '25')
  await props(page.locator('c2-spinner'), { value: 50 })
  await expect(progress).toHaveAttribute('aria-valuenow', '50')
  await expect(page.locator('[part="arc"]')).toHaveCSS('stroke-dashoffset', '0px')
})
test('out-of-range progress announces the same bounds as the visual arc', async ({ page, renderScenario }) => {
  await renderScenario('<c2-spinner value="150" max="100"></c2-spinner>')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await props(page.locator('c2-spinner'), { value: -10, max: 0 })
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100')
})
