import { test, expect } from './fixture'
import { accessible } from '../../../../tests/component-fixture'

test('moves through single and multiple questions while preserving answers', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-questionnaire')
  await page.getByRole('radio', { name: /Approval checkpoints/ }).check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(host).toHaveJSProperty('current', 1)
  await page.getByRole('checkbox', { name: 'Decisions' }).check()
  await page.getByRole('checkbox', { name: 'Risks' }).check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(host).toHaveJSProperty('current', 2)
  await page.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByRole('checkbox', { name: 'Decisions' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Risks' })).toBeChecked()
  await accessible(page)
})

test('shows validation and lets a skippable question continue explicitly', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-questionnaire')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('alert')).toHaveText('Choose an answer to continue.')
  await page.getByRole('radio', { name: /Tool call timeline/ }).check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('alert')).toHaveText('Choose an answer or skip this question.')
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(host).toHaveJSProperty('current', 2)
})

test('emits complete with the accumulated answers', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-questionnaire')
  await page.getByRole('radio', { name: /Tool call timeline/ }).check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('radio', { name: 'Next development cycle' }).check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(host).toHaveAttribute('data-events', /"type":"complete"/)
  await expect(host).toHaveAttribute('data-events', /"direction":"timeline"/)
  await expect(host).toHaveAttribute('data-events', /"timing":"cycle"/)
})

test('serializes answers into form data and resets with the form', async ({ page, scenario }) => {
  await scenario('form')
  const host = page.locator('c2-questionnaire')
  await page.getByRole('radio', { name: /Approval checkpoints/ }).check()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('plan'))).toBe('{"direction":"approvals"}')
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(host).toHaveJSProperty('current', 0)
  await expect(page.getByRole('radio', { name: /Approval checkpoints/ })).not.toBeChecked()
})

test('disables every interactive control', async ({ page, scenario }) => {
  await scenario('disabled')
  for (const control of await page.getByRole('radio').all()) await expect(control).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
})

test('uses questionItemRender without replacing native selection behavior', async ({ page, scenario }) => {
  await scenario('custom-render')
  await expect(page.locator('c2-questionnaire').locator('[data-custom-item]')).toHaveCount(3)
  await page.getByRole('radio', { name: /Approval checkpoints/ }).check()
  await expect(page.locator('c2-questionnaire').locator('[data-custom-item]').nth(1)).toContainText('Selected')
  await expect(page.locator('c2-questionnaire')).toHaveJSProperty('answers', { direction: 'approvals' })
})

test('slotted action buttons retain the questionnaire navigation behavior', async ({ page, scenario }) => {
  await scenario('custom-actions')
  const host = page.locator('c2-questionnaire')
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(host).toHaveJSProperty('current', 2)
  await expect(page.getByRole('button', { name: 'Finish plan' })).toBeVisible()
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(host).toHaveJSProperty('current', 1)
  await page.getByRole('checkbox', { name: 'Progress' }).check()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(host).toHaveJSProperty('current', 2)
})

test('shows the default or slotted summary after submit', async ({ page, scenario }) => {
  await scenario('custom-summary')
  const host = page.locator('c2-questionnaire')
  await page.getByRole('radio', { name: /Tool call timeline/ }).check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('radio', { name: 'Start now' }).check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(host).toHaveAttribute('completed')
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible()
  await expect(page.getByText('Custom answer summary')).toBeVisible()
})
