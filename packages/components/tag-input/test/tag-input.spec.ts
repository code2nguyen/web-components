import type { Page } from '@playwright/test'
import type { TagInput } from '../src/tag-input'
import { test, expect } from './fixture'

const input = (page: Page) => page.getByRole('textbox', { name: 'Recipients' })
const tags = (page: Page) => page.locator('c2-tag-input').getByRole('listitem')
const value = (page: Page) => page.locator('output[aria-label="Value"]')

async function paste(page: Page, text: string) {
  await input(page).evaluate((element, text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }))
  }, text)
}

test('commits the pending text on a comma and on Enter', async ({ page, scenario }) => {
  await scenario()
  await input(page).pressSequentially('ann@example.com,bob@example.com')
  await expect(tags(page)).toHaveText(['ann@example.com'])
  await expect(input(page)).toHaveValue('bob@example.com')
  await page.keyboard.press('Enter')
  await expect(tags(page)).toHaveText(['ann@example.com', 'bob@example.com'])
  await expect(input(page)).toHaveValue('')
  await expect(value(page)).toHaveText('ann@example.com|bob@example.com')
  await expect(page.locator('output[aria-label="Changes"]')).toHaveText('2')
})

test('uses every character in delimiters, and splits pasted text on them and on line breaks', async ({ page, scenario }) => {
  await scenario('email')
  await input(page).pressSequentially('a@x.io;b@x.io c@x.io ')
  await expect(tags(page)).toHaveText(['a@x.io', 'b@x.io', 'c@x.io'])
  await paste(page, 'd@x.io\ne@x.io, f@x.io')
  await expect(tags(page)).toHaveText(['a@x.io', 'b@x.io', 'c@x.io', 'd@x.io', 'e@x.io', 'f@x.io'])
})

test('split-pattern replaces the delimiters', async ({ page, scenario }) => {
  await scenario('pattern')
  await input(page).pressSequentially('red | green, blue |')
  await expect(tags(page)).toHaveText(['red', 'green, blue'])
})

test('parseTag normalizes each token', async ({ page, scenario }) => {
  await scenario('parser')
  await paste(page, 'Ann <Ann@Example.com>, BOB@example.com')
  await expect(tags(page)).toHaveText(['ann@example.com', 'bob@example.com'])
})

test('ignores duplicates', async ({ page, scenario }) => {
  await scenario()
  await input(page).pressSequentially('one,two,one,')
  await expect(tags(page)).toHaveText(['one', 'two'])
})

test('keeps invalid tags marked and the form invalid until they are removed', async ({ page, scenario }) => {
  await scenario('email')
  await input(page).pressSequentially('ann@example.com,not-an-email,')
  await expect(tags(page)).toHaveText(['ann@example.com', 'not-an-email'])
  await expect(tags(page).nth(1)).toHaveAttribute('aria-invalid', 'true')
  await expect(input(page)).toHaveAttribute('aria-invalid', 'true')
  expect(await page.locator('c2-tag-input').evaluate((element) => (element as TagInput).checkValidity())).toBe(false)
  await page.getByRole('button', { name: 'Remove not-an-email' }).click()
  await expect(tags(page)).toHaveText(['ann@example.com'])
  await expect(input(page)).not.toHaveAttribute('aria-invalid')
  expect(await page.locator('c2-tag-input').evaluate((element) => (element as TagInput).checkValidity())).toBe(true)
})

test('reject-invalid keeps invalid text in the input', async ({ page, scenario }) => {
  await scenario('reject')
  await paste(page, 'ann@example.com, oops, bob@example.com')
  await expect(tags(page)).toHaveText(['ann@example.com', 'bob@example.com'])
  await expect(input(page)).toHaveValue('oops')
  await expect(input(page)).toHaveAttribute('aria-invalid', 'true')
  await input(page).press('End')
  await input(page).pressSequentially('@example.com')
  await page.keyboard.press('Enter')
  await expect(tags(page)).toHaveText(['ann@example.com', 'bob@example.com', 'oops@example.com'])
})

test('a canceled tag-add keeps the text in the input', async ({ page, scenario }) => {
  await scenario('veto')
  await input(page).pressSequentially('fine,blocked,')
  await expect(tags(page)).toHaveText(['fine'])
  await expect(input(page)).toHaveValue('blocked')
})

test('stops adding at max and hides the input', async ({ page, scenario }) => {
  await scenario('max')
  await paste(page, 'a, b, c')
  await expect(tags(page)).toHaveText(['a', 'b'])
  await expect(input(page)).toBeHidden()
  await page.getByRole('button', { name: 'Remove b' }).click()
  await expect(input(page)).toBeVisible()
  await expect(input(page)).toHaveValue('c')
})

test('add-on-blur commits the pending text when focus leaves', async ({ page, scenario }) => {
  await scenario('blur')
  await input(page).pressSequentially('draft')
  await page.keyboard.press('Tab')
  await expect(tags(page)).toHaveText(['draft'])
})

test('keyboard walks and removes tags', async ({ page, scenario }) => {
  await scenario('prefilled')
  await input(page).focus()
  await page.keyboard.press('Backspace')
  await expect(tags(page).nth(2)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tags(page).nth(1)).toBeFocused()
  await page.keyboard.press('Backspace')
  await expect(tags(page)).toHaveText(['ann@example.com', 'cy@example.com'])
  await expect(tags(page).nth(0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(input(page)).toBeFocused()
})

test('Enter on a tag puts it back into the input for editing', async ({ page, scenario }) => {
  await scenario('prefilled')
  await input(page).focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(tags(page)).toHaveText(['ann@example.com', 'bob@example.com'])
  await expect(input(page)).toBeFocused()
  await expect(input(page)).toHaveValue('cy@example.com')
})

test('submits one form entry per tag and resets to the initial value', async ({ page, scenario }) => {
  await scenario('form')
  await input(page).pressSequentially('bob@example.com,')
  const entries = await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).getAll('to'))
  expect(entries).toEqual(['ann@example.com', 'bob@example.com'])
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(tags(page)).toHaveText(['ann@example.com'])
  await page.getByRole('button', { name: 'Remove ann@example.com' }).click()
  expect(await page.locator('c2-tag-input').evaluate((element) => (element as TagInput).validity.valueMissing)).toBe(true)
})

for (const state of ['disabled', 'readonly']) {
  test(`${state} refuses edits`, async ({ page, scenario }) => {
    await scenario(state)
    await expect(tags(page)).toHaveText(['ann@example.com'])
    await expect(page.getByRole('button', { name: 'Remove ann@example.com' })).toHaveCount(0)
  })
}
