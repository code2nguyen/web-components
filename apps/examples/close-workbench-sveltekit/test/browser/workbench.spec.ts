import { expect, test, type Page } from '@playwright/test'

/** Collects console errors and uncaught exceptions; a hydration mismatch or a failed upgrade shows up here. */
function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

const header = (page: Page) => page.locator('c2-header')

/**
 * Navigates and waits until SvelteKit has hydrated the prerendered page. Before that the markup is visible but no
 * handler is attached, so an interaction would be lost.
 */
async function open(page: Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
}

// `index.html` is the URL the docs site's iframe loads.
for (const route of ['./', './index.html', './reconcile/', './exceptions/', './journal/']) {
  test(`${route} hydrates the prerendered page without errors`, async ({ page }) => {
    const errors = trackErrors(page)
    await open(page, route)
    await expect(page.locator('h1')).toBeVisible()
    // hooks.client.ts registers the elements before hydration; the toast region is the layout's last element.
    await page.waitForFunction(() => customElements.get('c2-toast-region') !== undefined)
    // Every c2-* tag on the page is a registered element.
    const undefinedTags = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('*')].map((element) => element.localName))].filter(
        (name) => name.startsWith('c2-') && !customElements.get(name),
      ),
    )
    expect(undefinedTags).toEqual([])
    expect(errors).toEqual([])
  })
}

test('arrays reach the components as data, not as "[object Object]"', async ({ page }) => {
  await open(page, './reconcile/')
  const table = page.locator('c2-table[aria-label="Bank statement lines"]')
  // The query starts at status:unmatched, which leaves the nine open bank lines.
  await expect.poll(() => table.evaluate((element) => (element as unknown as { rows?: unknown }).rows)).toHaveLength(9)
})

test('widening the date window catches the late mobile deposit', async ({ page }) => {
  await open(page, './reconcile/')
  await expect(page.getByText(/^42 matches/)).toBeVisible()
  const window = page.locator('c2-number-input').locator('input')
  await window.fill('10')
  await window.press('Enter')
  await expect(page.getByText(/^43 matches/)).toBeVisible()
  await expect(page.locator('c2-toast-region')).toContainText('1 more match')
})

test('a manual match survives a reload', async ({ page }) => {
  await open(page, './reconcile/')
  await page.locator('c2-table[aria-label="Bank statement lines"]').getByText('MOBILE DEPOSIT').click()
  await page.locator('c2-table[aria-label="Ledger entries"]').getByText('Receipt Lindqvist Catering · INV-1059').click()
  await expect(page.getByText('The two sides agree: 9 days apart, no shared reference.')).toBeVisible()
  await page.getByRole('button', { name: 'Match selected' }).click()
  await expect(page.getByText(/^43 matches/)).toBeVisible()

  await page.reload()
  await expect(page.getByText(/^43 matches/)).toBeVisible()
})

test('the board refuses a move that would break the books', async ({ page }) => {
  await open(page, './exceptions/')
  // Pick the timing card up with the keyboard and drop it two columns over, on Needs adjustment.
  const card = page.locator('c2-kanban').locator('[part~="card"]', { hasText: 'Check 10251 · Alder Electric' })
  await card.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  await expect(page.locator('c2-toast-region')).toContainText('changes nothing in the books')
})

const NEEDS_ENTRY = [
  'OUTGOING WIRE TRANSFER FEE',
  'Payment Cascade Dairy · PAY-7748',
  'RETURNED ITEM NSF BLUEBIRD CAFE INV-1061',
  'RETURN ITEM FEE',
  'POS PURCHASE OFFICE DEPOT #2291',
  'INV-1066: bank $4,875.00, books $5,000.00',
  'CHK-10244: bank -$1,352.00, books -$1,532.00',
  'MONTHLY SERVICE CHARGE',
  'INTEREST PAID',
]
const TIMING = ['Check 10251 · Alder Electric', 'Check 10252 · Coastal Signs', 'Card sales deposit 09']

async function move(page: Page, title: string, column: string) {
  await page.getByRole('button', { name: `Open ${title}` }).click()
  const sheet = page.locator('c2-sheet')
  await sheet.getByRole('button', { name: `Move to ${column}` }).click()
  await page.keyboard.press('Escape')
  await expect(sheet).not.toHaveAttribute('open')
}

test('the whole close: match, work the board, post, sign off', async ({ page }) => {
  test.slow()
  const errors = trackErrors(page)

  await open(page, './')
  await expect(header(page)).toContainText('Off by $623.74')

  // 1. The one pairing the engine cannot make on its own.
  await open(page, './reconcile/')
  await page.locator('c2-table[aria-label="Bank statement lines"]').getByText('MOBILE DEPOSIT').click()
  await page.locator('c2-table[aria-label="Ledger entries"]').getByText('Receipt Lindqvist Catering · INV-1059').click()
  await page.getByRole('button', { name: 'Match selected' }).click()

  // 2. Every exception that changes cash gets an entry; the timing differences are explained.
  await open(page, './exceptions/')
  for (const title of NEEDS_ENTRY) await move(page, title, 'Needs adjustment')
  for (const title of TIMING) await move(page, title, 'Resolved')

  // 3. Post the proposed journal.
  await open(page, './journal/')
  await expect(page.locator('c2-card').first()).toContainText('Difference after posting $0.00')
  await page.getByRole('button', { name: 'Post journal' }).click()
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(page.locator('c2-toast-region')).toContainText('Journal posted')
  await expect(header(page)).toContainText('Balanced')

  // 4. Sign off.
  await open(page, './')
  await page.getByRole('button', { name: 'Sign off as Priya Raman' }).click()
  await page.getByRole('button', { name: 'Sign off', exact: true }).click()
  await expect(page.getByText('Signed off by Priya Raman.')).toBeVisible()

  // A posted card stays put: moving it back would post its entry twice.
  await open(page, './exceptions/')
  await page.getByRole('button', { name: 'Open MONTHLY SERVICE CHARGE' }).click()
  await expect(page.locator('c2-sheet')).toContainText('Its entry is posted.')
  await expect(page.locator('c2-sheet').getByRole('button', { name: 'Back to Unreviewed' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Re-running auto-match changes the matches, so the sign-off no longer holds.
  await open(page, './reconcile/')
  const window = page.locator('c2-number-input').locator('input')
  await window.fill('0')
  await window.press('Enter')
  await open(page, './')
  await expect(page.getByText('Signed off by Priya Raman.')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('the navigation menu routes client-side through its shadow root', async ({ page }) => {
  await open(page, './')
  await page.waitForFunction(() => customElements.get('c2-navigation-menu-item') !== undefined)
  await page.evaluate(() => ((window as unknown as { marker: boolean }).marker = true))
  await page.locator('c2-navigation-menu-item', { hasText: 'Exceptions' }).click()
  await expect(page).toHaveURL(/\/exceptions\/$/)
  await expect(page.locator('h1')).toHaveText('Exceptions')
  // Still the same document: SvelteKit's router took the click on the anchor inside the item's shadow root.
  expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true)
})

test('the theme the docs site hands over survives the theme switcher upgrading', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page, './?theme=dark')
  await page.waitForFunction(() => customElements.get('c2-theme-select') !== undefined)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // The docs site's own switcher key, on the same origin, is left alone.
  expect(await page.evaluate(() => localStorage.getItem('c2n-theme'))).toBeNull()
})

test('OR in the query shows either kind of line', async ({ page }) => {
  await open(page, './reconcile/')
  await page.waitForFunction(() => customElements.get('c2-table') !== undefined && customElements.get('c2-query-input') !== undefined)
  const table = page.locator('c2-table[aria-label="Bank statement lines"]')
  // `rows` is undefined until the element has upgraded: read it as -1 then, so the poll retries instead of throwing.
  const rowCount = () => table.evaluate((element) => (element as unknown as { rows?: unknown[] }).rows?.length ?? -1)
  await expect.poll(rowCount).toBe(9)
  const field = page.locator('c2-query-input').locator('input')
  await field.click()
  await field.pressSequentially('channel:check OR channel:fee')
  await field.press('Enter')
  // status:unmatched AND channel:check (check 10244), or any fee line (wire fee, return fee, service charge).
  await expect.poll(rowCount).toBe(4)
})
