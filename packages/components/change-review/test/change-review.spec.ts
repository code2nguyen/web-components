import { test, expect, accessible, watch, props } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

type Decision = 'accepted' | 'rejected' | null
type Api = {
  reviewHunks(original: string, modified: string, context?: number): { hunks: Record<string, unknown>[]; rows: { kind: string; count?: number }[] }
  applyDecisions(review: unknown, decisions: Decision[], undecided?: 'original' | 'modified'): string
}
type Sample = { original: string; modified: string }
declare global {
  interface Window {
    reviewApi: Api
    sample: Sample
  }
}

const review = (page: Page) => page.locator('c2-change-review')
const bar = (page: Page) => review(page).locator('[part="bar"]')
const hunk = (page: Page, number: number) => review(page).locator(`[data-hunk="${number - 1}"]`)
const button = (page: Page, name: string) => review(page).getByRole('button', { name, exact: true })
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]') as Record<string, unknown>[]
const decisions = (page: Page) => review(page).evaluate((element) => (element as HTMLElement & { decisions: Decision[] }).decisions)
const result = (page: Page) => review(page).evaluate((element) => (element as HTMLElement & { result: string }).result)
const focused = (page: Page) =>
  review(page).evaluate((element) => {
    const active = element.shadowRoot!.activeElement as HTMLElement | null
    return active ? (active.getAttribute('aria-label') ?? active.textContent!.trim()) : null
  })

async function render(page: Page, renderScenario: (html: string) => Promise<void>, extra = '') {
  await renderScenario(`<c2-change-review label="Suggested edit" file-name="src/lines.txt" ${extra}></c2-change-review>`)
  await review(page).evaluate(async (element) => {
    Object.assign(element, window.sample)
    await (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
  })
}

test('reviewHunks splits the diff into hunks with context and gaps; applyDecisions builds the text each choice gives', async ({ page, renderScenario }) => {
  await renderScenario('')
  const out = await page.evaluate(() => {
    const { reviewHunks, applyDecisions } = window.reviewApi
    const { original, modified } = window.sample
    const review = reviewHunks(original, modified)
    const shape = review.hunks.map((hunk) => ({
      before: (hunk.before as unknown[]).length,
      removed: (hunk.removed as { text: string }[]).map((line) => line.text),
      added: (hunk.added as { text: string }[]).map((line) => line.text),
      after: (hunk.after as unknown[]).length,
      original: [hunk.originalStart, hunk.originalEnd],
    }))
    const rows = review.rows.map((row) => (row.kind === 'gap' ? row.count : 'hunk'))
    const noBreak = reviewHunks('a\nb', 'a\nc')
    return {
      shape,
      rows,
      none: applyDecisions(review, [null, null, null]) === original,
      all: applyDecisions(review, ['accepted', 'accepted', 'accepted']) === modified,
      openAsModified: applyDecisions(review, [null, null, null], 'modified') === modified,
      firstOnly: applyDecisions(review, ['accepted', 'rejected', null]).split('\n').slice(2, 5),
      lastOnly: applyDecisions(review, [null, null, 'accepted']).includes('line 27'),
      noBreak: [applyDecisions(noBreak, ['accepted']), applyDecisions(noBreak, ['rejected'])],
      context0: reviewHunks(original, modified, 0).rows.map((row) => (row.kind === 'gap' ? row.count : 'hunk')),
      same: reviewHunks('x\n', 'x\n').hunks.length,
    }
  })
  expect(out.shape).toEqual([
    { before: 3, removed: ['line 4'], added: ['line 4 edited'], after: 3, original: [4, 4] },
    { before: 3, removed: ['line 15', 'line 16'], added: ['new 15', 'new 16', 'new 16b'], after: 3, original: [15, 16] },
    { before: 3, removed: ['line 27'], added: [], after: 3, original: [27, 27] },
  ])
  expect(out.rows).toEqual(['hunk', 4, 'hunk', 4, 'hunk'])
  expect(out.none).toBe(true)
  expect(out.all).toBe(true)
  expect(out.openAsModified).toBe(true)
  expect(out.firstOnly).toEqual(['line 3', 'line 4 edited', 'line 5'])
  expect(out.lastOnly).toBe(false)
  expect(out.noBreak).toEqual(['a\nc', 'a\nb'])
  expect(out.context0).toEqual([3, 'hunk', 10, 'hunk', 10, 'hunk', 3])
  expect(out.same).toBe(0)
})

test('each hunk is a named group with Accept and Reject; a decision collapses it, moves on and reports the result', async ({ page, renderScenario }) => {
  await render(page, renderScenario)
  await watch(review(page), 'review-change')
  await expect(review(page).locator('[part="header"]')).toContainText('Suggested edit')
  await expect(review(page).locator('[part="header"]')).toContainText('src/lines.txt')
  await expect(review(page).locator('.stats [aria-hidden="true"]')).toHaveText('+4 −4')
  await expect(bar(page)).toContainText('Hunk 1 of 3')
  await expect(bar(page)).toContainText('3 left')
  await expect(review(page).getByRole('group', { name: 'Change 2 of 3: 2 lines removed, 3 added' })).toBeVisible()
  await expect(review(page).getByRole('group', { name: 'Change 3 of 3: 1 line removed, nothing added' })).toBeVisible()
  await expect(hunk(page, 1).locator('ins')).toHaveText(' edited')
  await expect(review(page).locator('.gap').first()).toHaveText('⋯ 4 unchanged lines')
  await expect(button(page, 'Accept change 1')).toHaveAttribute('title', 'Accept (Ctrl+Enter)')
  await accessible(page)

  await button(page, 'Accept change 1').click()
  await expect(hunk(page, 1).locator('.status')).toHaveText(/Accepted/)
  await expect(hunk(page, 1).locator('.line')).toHaveText(['4line 4 edited'])
  await expect(bar(page)).toContainText('Hunk 2 of 3')
  await expect(bar(page)).toContainText('2 left')
  expect(await focused(page)).toBe('Accept change 2')
  await expect(review(page).getByRole('status')).toHaveText('Change 1 accepted. 2 left.')
  expect(await decisions(page)).toEqual(['accepted', null, null])
  const [first] = await events(review(page))
  expect(first).toMatchObject({ decisions: ['accepted', null, null], index: 0 })
  expect((first.result as string).split('\n')[3]).toBe('line 4 edited')

  await button(page, 'Reject change 2').click()
  await expect(hunk(page, 2).locator('.status')).toHaveText(/Rejected/)
  await expect(hunk(page, 2).locator('.line')).toHaveText(['15line 15', '16line 16'])
  await button(page, 'Undo change 1').click()
  expect(await decisions(page)).toEqual([null, 'rejected', null])
  expect(await focused(page)).toBe('Accept change 1')
  await expect(review(page).getByRole('status')).toHaveText('Change 1 is open again.')
  // An accepted pure removal says so instead of drawing nothing.
  await button(page, 'Accept change 3').click()
  await expect(hunk(page, 3).locator('.none')).toHaveText('1 line removed')
  await accessible(page)
})

test('the keyboard moves between hunks and decides them; the last decision shows the summary and fires review-complete', async ({ page, renderScenario }) => {
  await render(page, renderScenario)
  await page.evaluate(() => {
    document.querySelector('c2-change-review')!.innerHTML = '<button slot="actions" id="apply">Apply</button>'
  })
  await watch(review(page), 'review-complete')
  await button(page, 'Accept change 1').focus()
  await page.keyboard.press('Alt+ArrowDown')
  expect(await focused(page)).toBe('Accept change 2')
  await expect(bar(page)).toContainText('Hunk 2 of 3')
  await expect(hunk(page, 2)).toHaveClass(/current/)
  await page.keyboard.press('Alt+ArrowUp')
  expect(await focused(page)).toBe('Accept change 1')
  await page.keyboard.press('Alt+ArrowDown')
  await page.keyboard.press('Control+Enter')
  expect(await decisions(page)).toEqual([null, 'accepted', null])
  expect(await focused(page)).toBe('Accept change 3')
  await page.keyboard.press('Control+Backspace')
  expect(await decisions(page)).toEqual([null, 'accepted', 'rejected'])
  // Wraps round to the hunk still open.
  expect(await focused(page)).toBe('Accept change 1')
  await page.keyboard.press('Control+Enter')
  await expect(bar(page)).toContainText('All 3 changes reviewed')
  await expect(bar(page)).toContainText('2 accepted · 1 rejected')
  await expect(page.locator('#apply')).toBeVisible()
  expect(await focused(page)).toBe('Start over')
  await expect(review(page).getByRole('status')).toHaveText('All changes reviewed: 2 accepted, 1 rejected.')
  const complete = await events(review(page))
  expect(complete).toHaveLength(1)
  expect(complete[0].decisions).toEqual(['accepted', 'accepted', 'rejected'])
  expect(complete[0].result).toBe(await result(page))
  expect(await result(page)).toContain('new 16b')
  expect(await result(page)).toContain('line 27')
  await accessible(page)

  await page.keyboard.press('Enter')
  expect(await decisions(page)).toEqual([null, null, null])
  await expect(bar(page)).toContainText('Hunk 1 of 3')
  expect(await focused(page)).toBe('Accept change 1')
})

test('Accept all and Reject all decide only the open hunks; decisions restore a review and new texts start a fresh one', async ({ page, renderScenario }) => {
  await render(page, renderScenario)
  await watch(review(page), 'review-change')
  await button(page, 'Reject change 1').click()
  await button(page, 'Accept all').click()
  expect(await decisions(page)).toEqual(['rejected', 'accepted', 'accepted'])
  expect((await events(review(page))).at(-1)).toMatchObject({ index: -1 })
  await expect(bar(page)).toContainText('2 accepted · 1 rejected')
  await button(page, 'Start over').click()
  await button(page, 'Reject all').click()
  expect(await result(page)).toBe(await page.evaluate(() => window.sample.original))

  await props(review(page), { decisions: ['accepted', null, 'accepted'] })
  await expect(bar(page)).toContainText('1 left')
  await expect(hunk(page, 1).locator('.status')).toHaveText(/Accepted/)
  await props(review(page), { undecided: 'modified' })
  expect(await result(page)).toBe(await page.evaluate(() => window.sample.modified))

  await props(review(page), { original: 'one\ntwo\n', modified: 'one\n2\n' })
  expect(await decisions(page)).toEqual([null])
  await expect(bar(page)).toContainText('Hunk 1 of 1')
  await props(review(page), { modified: 'one\ntwo\n' })
  await expect(bar(page)).toHaveText('No changes')
  await expect(review(page).locator('[part="hunk"]')).toHaveCount(0)
})

test('the review is a group named by its label, and a long review scrolls under its sticky bar', async ({ page, renderScenario }) => {
  await render(page, renderScenario, 'style="--c2-change-review--max-height: 240px"')
  await expect(review(page)).toHaveHostAria('role', 'group')
  await expect(review(page)).toHaveHostAria('aria-label', 'Suggested edit')
  const body = review(page).locator('.body')
  await body.evaluate((element) => (element.scrollTop = 200))
  const top = await body.evaluate((element) => element.getBoundingClientRect().top)
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.y)).toBe(Math.round(top))
  // The keyboard brings a hunk out of view into it.
  await button(page, 'Accept change 1').focus()
  await page.keyboard.press('Alt+ArrowDown')
  await page.keyboard.press('Alt+ArrowDown')
  await expect(button(page, 'Accept change 3')).toBeInViewport()
})

test('keys typed in slotted content keep their meaning; a shortcut with nothing to do is left to the page', async ({ page, renderScenario }) => {
  await render(page, renderScenario)
  await page.evaluate(() => {
    document.querySelector('c2-change-review')!.innerHTML = '<input slot="actions" id="message" aria-label="Commit message" />'
    // Records which keydowns reached the document still allowed to do their default.
    ;(window as unknown as { kept: string[] }).kept = []
    document.addEventListener('keydown', (event) => {
      if (!event.defaultPrevented && !['Control', 'Alt', 'Shift', 'Meta'].includes(event.key))
        (window as unknown as { kept: string[] }).kept.push(`${event.ctrlKey ? 'Control+' : ''}${event.altKey ? 'Alt+' : ''}${event.key}`)
    })
  })
  const kept = () => page.evaluate(() => (window as unknown as { kept: string[] }).kept.splice(0))
  // Every hunk decided: the summary shows the author's input.
  await button(page, 'Accept all').click()
  const input = page.locator('#message')
  await expect(input).toBeVisible()
  await input.fill('fix total rounding')
  await input.press('Control+Backspace')
  await expect(input).toHaveValue('fix total ')
  await input.press('Alt+ArrowDown')
  await input.press('Control+Enter')
  expect(await kept()).toEqual(['Control+Backspace', 'Alt+ArrowDown', 'Control+Enter'])
  expect(await decisions(page)).toEqual(['accepted', 'accepted', 'accepted'])

  // On the hunks the shortcuts still work, and one with nothing to do is not swallowed.
  await review(page).evaluate((element) => (element as HTMLElement & { reset(): void }).reset())
  await button(page, 'Accept change 1').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await page.keyboard.press('Control+Enter')
  expect(await decisions(page)).toEqual(['accepted', null, null])
  expect(await kept()).toEqual(['Alt+ArrowUp'])
})
