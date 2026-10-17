import type { Locator, Page } from '@playwright/test'
import type { DiffLine } from '../src/diff'
import { test, expect, accessible } from './fixture'

/**
 * What the table draws, one string per row: `+text` added, `-text` removed, ` text` unchanged, `~N` a fold of N lines.
 * In the split layout a row is `left | right`, each side in the same notation and empty when the side is blank.
 */
const rows = (host: Locator) =>
  host.evaluate((el) => {
    const side = (cells: Element[]) => {
      const marker = cells.find((cell) => cell.classList.contains('marker'))
      const content = cells.find((cell) => cell.classList.contains('content'))
      if (!content || content.classList.contains('empty-side')) return ''
      const sign = marker?.classList.contains('added') ? '+' : marker?.classList.contains('removed') ? '-' : ' '
      const text = Array.from(content.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE || (node instanceof Element && !node.classList.contains('no-newline')))
        .map((node) => node.textContent)
        .join('')
      return sign + text
    }
    return Array.from(el.shadowRoot!.querySelectorAll('tbody tr'), (tr) => {
      const fold = tr.querySelector('.fold')
      if (fold) return `~${/\d+/.exec(fold.textContent ?? '')?.[0]}`
      const cells = Array.from(tr.children)
      const contents = cells.filter((cell) => cell.classList.contains('content'))
      if (contents.length === 2) {
        const split = cells.indexOf(contents[0]) + 1
        return `${side(cells.slice(0, split))} | ${side(cells.slice(split))}`
      }
      return side(cells)
    })
  })

/** Line numbers of each drawn line row, `original/modified`, blank when the line is not in that text. */
const numbers = (host: Locator) =>
  host.evaluate((el) =>
    Array.from(el.shadowRoot!.querySelectorAll('tbody tr.line'), (tr) =>
      Array.from(tr.querySelectorAll('.number'), (cell) => cell.textContent!.trim()).join('/'),
    ),
  )

const words = (host: Locator) =>
  host.evaluate((el) => Array.from(el.shadowRoot!.querySelectorAll('.word'), (word) => `${word.classList.contains('added') ? '+' : '-'}${word.textContent}`))

const subject = (page: Page) => page.locator('c2-diff-viewer')

test('an inserted line is drawn between its unchanged neighbours, with both line numbers', async ({ page, scenario }) => {
  await scenario('insert')
  expect(await rows(subject(page))).toEqual([' a', ' b', '+X', ' c'])
  expect(await numbers(subject(page))).toEqual(['1/1', '2/2', '/3', '3/4'])
  await expect(subject(page)).toHaveJSProperty('stats', { additions: 1, deletions: 0 })
})

test('a deleted line keeps its original number only', async ({ page, scenario }) => {
  await scenario('delete')
  expect(await rows(subject(page))).toEqual([' a', '-b', ' c'])
  expect(await numbers(subject(page))).toEqual(['1/1', '2/', '3/2'])
  await expect(subject(page)).toHaveJSProperty('stats', { additions: 0, deletions: 1 })
})

test('a changed line is removed then added, with the changed words marked', async ({ page, scenario }) => {
  await scenario('change')
  expect(await rows(subject(page))).toEqual(['-price: 10', '+price: 12'])
  expect(await words(subject(page))).toEqual(['-10', '+12'])
})

test('a rewritten line with little in common is marked as a whole, without word highlights', async ({ page, scenario }) => {
  await scenario('rewrite')
  expect(await rows(subject(page))).toEqual(['-alpha beta', '+something else entirely'])
  expect(await words(subject(page))).toEqual([])
})

test('a multi-line change reads removals before additions, with the labels and counts in the header', async ({ page, scenario }) => {
  await scenario()
  const host = subject(page)
  expect(await rows(host)).toEqual([
    ' name: shop',
    ' start_url: https://shop.example/list',
    ' selectors:',
    '-  item: .card',
    '+  item: article.product',
    '   price: .price',
    '+  title: h2',
  ])
  // Changed words separated by one shared character read as one change.
  expect(await words(host)).toEqual(['-card', '+article.product'])
  const header = host.locator('[part="header"]')
  await expect(header.locator('[part="original-label"]')).toHaveText('Current plan')
  await expect(header.locator('[part="modified-label"]')).toHaveText('Repaired plan')
  await expect(header.locator('[part="stats"]')).toHaveText('+2 −1')
  await expect(host.locator('caption')).toHaveText('2 additions, 1 deletion')
  await expect(host).toHaveState('changed')
})

test('identical texts say there are no changes and fold every line', async ({ page, scenario }) => {
  await scenario('identical')
  const host = subject(page)
  await expect(host.locator('[part="empty"]')).toHaveText('No changes')
  expect(await rows(host)).toEqual(['~20'])
  await expect(host).not.toHaveState('changed')
  await expect(host).toHaveJSProperty('stats', { additions: 0, deletions: 0 })
  await host.getByRole('button', { name: 'Show 20 unchanged lines' }).click()
  expect(await rows(host)).toHaveLength(20)
})

test('an empty original shows every line as added, an empty modified text every line as removed', async ({ page, scenario }) => {
  await scenario('empty-original')
  expect(await rows(subject(page))).toEqual(['+a', '+b'])
  expect(await numbers(subject(page))).toEqual(['/1', '/2'])
  await scenario('empty-modified')
  expect(await rows(subject(page))).toEqual(['-a', '-b'])
  // The original's last line had no final line break.
  await expect(subject(page).locator('[part="no-newline"]')).toHaveText('No newline at end of file')
})

test('two empty texts draw the message and no table', async ({ page, scenario }) => {
  await scenario('both-empty')
  await expect(subject(page).locator('[part="empty"]')).toHaveText('No changes')
  await expect(subject(page).locator('table')).toHaveCount(0)
})

test('adding a final line break changes the last line, and the side without it says so', async ({ page, scenario }) => {
  await scenario('newline')
  const host = subject(page)
  expect(await rows(host)).toEqual([' a', '-b', '+b'])
  const notes = host.locator('[part="no-newline"]')
  await expect(notes).toHaveCount(1)
  await expect(host.locator('tr.removed [part="no-newline"]')).toHaveCount(1)
})

test('Windows line breaks compare equal to Unix ones', async ({ page, scenario }) => {
  await scenario('crlf')
  await expect(subject(page).locator('[part="empty"]')).toHaveText('No changes')
})

test('long unchanged runs fold around the change and open from the keyboard or a click', async ({ page, scenario }) => {
  await scenario('fold')
  const host = subject(page)
  expect(await rows(host)).toEqual(['~6', ' line 7', ' line 8', ' line 9', '-line 10', '+line ten', ' line 11', ' line 12', ' line 13', '~7'])
  await host.getByRole('button', { name: 'Show 6 unchanged lines' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('expand:1/1/6')
  expect((await rows(host)).slice(0, 7)).toEqual([' line 1', ' line 2', ' line 3', ' line 4', ' line 5', ' line 6', ' line 7'])
  await host.getByRole('button', { name: 'Show 7 unchanged lines' }).click()
  await expect(page.getByRole('status')).toHaveText('expand:1/1/6 expand:14/14/7')
  expect(await rows(host)).toHaveLength(21)
})

test('expandAll opens every fold without an event, and new texts fold again', async ({ page, scenario }) => {
  await scenario('fold')
  const host = subject(page)
  await page.getByRole('button', { name: 'Expand all' }).click()
  await expect.poll(() => rows(host)).toHaveLength(21)
  await expect(page.getByRole('status')).toHaveText('')
  await page.getByRole('button', { name: 'Replace texts' }).click()
  await expect.poll(() => rows(host)).toEqual(['-one', '+two'])
})

test('context sets how many unchanged lines stay around a change; a negative one folds nothing', async ({ page, scenario }) => {
  await scenario('context-0')
  expect(await rows(subject(page))).toEqual(['~9', '-line 10', '+line ten', '~10'])
  await scenario('context-all')
  expect(await rows(subject(page))).toHaveLength(21)
})

test('split mode puts the original on the left and the modified text on the right', async ({ page, scenario }) => {
  await scenario('split')
  const host = subject(page)
  await expect(host).toHaveState('split')
  expect(await rows(host)).toEqual([
    ' name: shop |  name: shop',
    ' start_url: https://shop.example/list |  start_url: https://shop.example/list',
    ' selectors: |  selectors:',
    '-  item: .card | +  item: article.product',
    '   price: .price |    price: .price',
    ' | +  title: h2',
  ])
  expect(await numbers(host)).toEqual(['1/1', '2/2', '3/3', '4/4', '5/5', '/6'])
  await page.getByRole('button', { name: 'Toggle layout' }).click()
  await expect(host).not.toHaveState('split')
  expect((await rows(host))[3]).toBe('-  item: .card')
})

test('folds span both sides of the split layout', async ({ page, scenario }) => {
  await scenario('fold-split')
  const host = subject(page)
  expect(await rows(host)).toEqual([
    '~6',
    ' line 7 |  line 7',
    ' line 8 |  line 8',
    ' line 9 |  line 9',
    '-line 10 | +line ten',
    ' line 11 |  line 11',
    ' line 12 |  line 12',
    ' line 13 |  line 13',
    '~7',
  ])
  await expect(host.locator('.fold-row td').first()).toHaveAttribute('colspan', '6')
})

test('split mode draws the unified layout while the element is narrower than its minimum width', async ({ page, scenario }) => {
  await scenario('narrow')
  const host = subject(page)
  await expect.poll(() => rows(host)).toContain('-  item: .card')
  await expect(host).not.toHaveState('split')
  await host.evaluate((el) => el.style.setProperty('--c2-diff-viewer--split-min-width', '300px'))
  // The threshold is read when the element resizes.
  await page.locator('main').evaluate((main) => (main.style.width = '420px'))
  await expect(host).toHaveState('split')
})

test('changed lines tell screen readers whether they were added or removed', async ({ page, scenario }) => {
  await scenario('change')
  const host = subject(page)
  await expect(host.locator('.marker.removed')).toHaveText('−Removed')
  await expect(host.locator('.marker.added')).toHaveText('+Added')
  await expect(host.locator('.marker.added [aria-hidden="true"]')).toHaveText('+')
  await expect(host).toHaveHostAria('role', 'figure')
  await expect(host).toHaveHostAria('aria-label', 'Changes')
})

test('label names the diff', async ({ page, scenario }) => {
  await scenario('fold')
  await expect(subject(page)).toHaveHostAria('aria-label', 'Plan changes')
})

test('a body that scrolls takes keyboard focus', async ({ page, scenario }) => {
  await scenario('scroll')
  const body = subject(page).locator('[part="body"]')
  await expect(body).toHaveAttribute('tabindex', '0')
  await expect(body).toHaveAttribute('role', 'group')
  await scenario('insert')
  await expect(subject(page).locator('[part="body"]')).not.toHaveAttribute('tabindex')
})

test('added and removed rows are themed through CSS variables', async ({ page, scenario }) => {
  await scenario('change')
  const host = subject(page)
  const background = (selector: string) => host.evaluate((el, s) => getComputedStyle(el.shadowRoot!.querySelector(s)!).backgroundColor, selector)
  expect(await background('.content.added')).toBe('rgba(22, 163, 74, 0.12)')
  expect(await background('.content.removed')).toBe('rgba(220, 38, 38, 0.12)')
  await host.evaluate((el) => {
    el.style.setProperty('--c2-diff-viewer__line__added--background-color', 'rgb(0, 0, 255)')
    el.style.setProperty('--c2-diff-viewer__word__removed--background-color', 'rgb(255, 0, 0)')
  })
  expect(await background('.content.added')).toBe('rgb(0, 0, 255)')
  expect(await background('.word.removed')).toBe('rgb(255, 0, 0)')
})

test('diffLines handles the edge cases of the line model', async ({ page, scenario }) => {
  await scenario()
  const run = (original: string, modified: string) =>
    page.evaluate(
      ([a, b]) =>
        (window as unknown as { diffLines: (a: string, b: string) => DiffLine[] })
          .diffLines(a, b)
          .map((line) => `${line.type[0]}${line.text}${line.noNewline ? '$' : ''}`),
      [original, modified] as const,
    )
  expect(await run('', '')).toEqual([])
  expect(await run('\n', '')).toEqual(['d'])
  expect(await run('a', 'a')).toEqual(['ea$'])
  expect(await run('a\n', 'a')).toEqual(['da', 'ia$'])
  // Repeated lines: the shortest edit keeps as many as it can.
  expect(await run('x\nx\nx\n', 'x\nx\n')).toEqual(['ex', 'ex', 'dx'])
  expect(await run('a\nb\nc\nd\n', 'b\nd\na\n')).toEqual(['da', 'eb', 'dc', 'ed', 'ia'])
  // A large edit stays exact: every third of 3000 lines removed.
  const big = Array.from({ length: 3000 }, (_, i) => `row ${i}`)
  const edited = big.filter((_, i) => i % 3 !== 0)
  const removed = await page.evaluate(
    ([a, b]) => (window as unknown as { diffLines: (a: string, b: string) => DiffLine[] }).diffLines(a, b).filter((line) => line.type === 'delete').length,
    [big.join('\n'), edited.join('\n')] as const,
  )
  expect(removed).toBe(1000)
})

test('writes no attribute on the host it was not given', async ({ page, scenario }) => {
  await scenario('insert')
  expect(await subject(page).evaluate((host) => host.getAttributeNames().sort())).toEqual(['id', 'line-numbers'])
})

for (const state of ['default', 'split', 'identical', 'fold', 'scroll']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    await accessible(page)
  })
}
