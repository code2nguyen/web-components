import type { Locator, Page } from '@playwright/test'
import { test as base, expect, accessible } from '../../../../tests/component-fixture'
import type { TextAnnotator } from '../src/text-annotator'

const test = base.extend<{ scenario: (name?: string) => Promise<void> }>({
  scenario: async ({ page }, use) => {
    await use(async (name = 'default') => {
      await page.goto(`/packages/components/highlight/test/text-annotator.html?scenario=${encodeURIComponent(name)}`)
      await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
    })
  },
})

/** The drawn text: `[…]` a span, `{…}` a tag, `<…>` a query match. */
const drawn = (host: Locator) =>
  host.evaluate((element) => {
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
      if (!(node instanceof Element)) return ''
      const inner = Array.from(node.childNodes, walk).join('')
      if (node.part.contains('tag')) return `{${inner}}`
      if (node.part.contains('span')) return `[${inner}]`
      if (node.part.contains('mark')) return `<${inner}>`
      return inner
    }
    return walk(element.shadowRoot!.querySelector('[part~="text"]')!)
  })

const events = (page: Page) => page.getByRole('status', { name: 'Events' })

/** Drags across `phrase` in the drawn text, from the first character's left edge to the last one's right edge. */
async function select(page: Page, host: Locator, phrase: string) {
  const box = await host.evaluate((element, phrase) => {
    const root = element.shadowRoot!.querySelector('[part~="text"]')!
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!node.parentElement!.closest('[part~="tag"]')) nodes.push(node as Text)
    const full = nodes.map((node) => node.data).join('')
    const rect = (offset: number) => {
      let at = offset
      const node = nodes.find((candidate) => (at < candidate.length ? true : ((at -= candidate.length), false)))!
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + 1)
      return range.getBoundingClientRect()
    }
    const start = full.indexOf(phrase)
    const first = rect(start)
    const last = rect(start + phrase.length - 1)
    return { x1: first.left + 1, y1: first.top + first.height / 2, x2: last.right - 1, y2: last.top + last.height / 2 }
  }, phrase)
  await page.mouse.move(box.x1, box.y1)
  await page.mouse.down()
  await page.mouse.move(box.x2, box.y2, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => document.getSelection()!.toString().trim())).toBe(phrase)
}

test('draws each range as a span followed by its label tag', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-text-annotator')
  expect(await drawn(host)).toBe('[Ada Lovelace]{Person} worked with Charles Babbage in London on the Analytical Engine.')
  expect(await host.evaluate((element) => element.shadowRoot!.querySelector('[part~="span"]')!.getAttribute('data-tone'))).toBe('0')
  await accessible(page)
})

test('nests overlapping spans, shortest inside, and colours each by its label', async ({ page, scenario }) => {
  await scenario('overlap')
  const host = page.locator('c2-text-annotator')
  expect(await drawn(host)).toBe('Ada Lovelace worked with Charles [Babbage]{Person} in London on the [Analytical ][[Engine]{Person}]{Thing}.')
  const tones = await host.evaluate((element) => Array.from(element.shadowRoot!.querySelectorAll('[part~="span"]'), (span) => span.getAttribute('data-tone')))
  expect(tones).toEqual(['0', '2', '2', '0'])
  // Nested tints add up, so the overlap reads darker than either span alone.
  const backgrounds = await host.evaluate((element) =>
    Array.from(element.shadowRoot!.querySelectorAll('[part~="span"]'), (span) => getComputedStyle(span).backgroundColor),
  )
  expect(backgrounds[1]).toBe(backgrounds[2])
  expect(backgrounds[0]).not.toBe(backgrounds[1])
})

test('skips ranges outside the text and labels it does not know', async ({ page, scenario }) => {
  await scenario('invalid')
  expect(await drawn(page.locator('c2-text-annotator'))).toBe('Ada Lovelace worked with Charles Babbage in [London]{Place} on the Analytical Engine.')
  await scenario('unknown')
  const host = page.locator('c2-text-annotator')
  expect(await drawn(host)).toBe('Ada Lovelace worked with Charles Babbage in [London]{city} on the Analytical Engine.')
  expect(await host.evaluate((element) => element.shadowRoot!.querySelector('[part~="span"]')!.getAttribute('data-tone'))).toBe('0')
})

test('a label key labels the selected text, and again inside the span removes it', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-text-annotator')
  await select(page, host, 'Charles Babbage')
  await page.keyboard.press('p')
  await expect.poll(() => drawn(host)).toBe('[Ada Lovelace]{Person} worked with [Charles Babbage]{Person} in London on the Analytical Engine.')
  expect(await page.evaluate(() => document.getSelection()!.isCollapsed)).toBe(true)
  await expect(events(page)).toHaveText('Ada Lovelace:person|Charles Babbage:person')

  await select(page, host, 'London')
  await page.keyboard.press('Shift+L')
  await expect.poll(() => drawn(host)).toBe('[Ada Lovelace]{Person} worked with [Charles Babbage]{Person} in [London]{Place} on the Analytical Engine.')

  // A selection inside a span with the same label removes that span.
  await select(page, host, 'Babbage')
  await page.keyboard.press('p')
  await expect.poll(() => drawn(host)).toBe('[Ada Lovelace]{Person} worked with Charles Babbage in [London]{Place} on the Analytical Engine.')
  await expect(host).toHaveJSProperty('ranges', [
    { start: 0, end: 12, label: 'person' },
    { start: 44, end: 50, label: 'place' },
  ])
})

test('a different label on the same text adds an overlapping span', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-text-annotator')
  await select(page, host, 'Lovelace')
  await page.keyboard.press('t')
  await expect.poll(() => drawn(host)).toBe('[Ada ][[Lovelace]{Thing}]{Person} worked with Charles Babbage in London on the Analytical Engine.')
})

test('a selection overlapping spans of its label merges them into one', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-text-annotator')
  await select(page, host, 'Lovelace worked')
  await page.keyboard.press('p')
  await expect.poll(() => drawn(host)).toBe('[Ada Lovelace worked]{Person} with Charles Babbage in London on the Analytical Engine.')
  await expect(host).toHaveJSProperty('ranges', [{ start: 0, end: 19, label: 'person' }])
})

test('renderTag draws the content of each tag', async ({ page, scenario }) => {
  await scenario('overlap')
  const host = page.locator('c2-text-annotator')
  await host.evaluate((element: TextAnnotator) => {
    element.renderTag = ({ range, label }) => `${label?.key ?? '?'}:${range.end - range.start}`
  })
  await expect.poll(() => drawn(host)).toBe('Ada Lovelace worked with Charles [Babbage]{p:7} in London on the [Analytical ][[Engine]{p:6}]{t:17}.')
})

test('keys do nothing without a selection, with a modifier, in a field or for an unknown key', async ({ page, scenario }) => {
  await scenario('field')
  const host = page.locator('c2-text-annotator')
  const before = await drawn(host)
  await page.keyboard.press('p')
  await select(page, host, 'London')
  await page.keyboard.press('Control+l')
  await page.keyboard.press('x')
  expect(await drawn(host)).toBe(before)
  await page.getByRole('textbox', { name: 'Note' }).click()
  await page.keyboard.type('plt')
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('plt')
  expect(await drawn(host)).toBe(before)
  await expect(events(page)).toHaveText('')
})

test('a key labels only the annotator holding the selection', async ({ page, scenario }) => {
  await scenario('two')
  const [first, second] = [page.locator('#first c2-text-annotator'), page.locator('#second c2-text-annotator')]
  await select(page, second, 'London')
  await page.keyboard.press('l')
  await expect.poll(() => drawn(second)).toBe('Ada Lovelace worked with Charles Babbage in [London]{Place} on the Analytical Engine.')
  expect(await drawn(first)).toBe('[Ada Lovelace]{Person} worked with Charles Babbage in London on the Analytical Engine.')
})

test('annotate() trims white space and resolves false without a selection inside', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-text-annotator')
  expect(await host.evaluate((element: TextAnnotator) => element.annotate('place'))).toBe(false)
  await host.evaluate((element) => {
    const text = Array.from(element.shadowRoot!.querySelector('[part~="text"]')!.childNodes).find((node) => node.textContent?.includes('London'))!
    const offset = text.textContent!.indexOf(' London ')
    document.getSelection()!.setBaseAndExtent(text, offset, text, offset + ' London '.length)
  })
  expect(await host.evaluate((element: TextAnnotator) => element.annotate('place'))).toBe(true)
  expect(await drawn(host)).toBe('[Ada Lovelace]{Person} worked with Charles Babbage in [London]{Place} on the Analytical Engine.')
})

test('readonly shows the spans but ignores keys and annotate()', async ({ page, scenario }) => {
  await scenario('readonly')
  const host = page.locator('c2-text-annotator')
  const before = await drawn(host)
  expect(before).toBe('[Ada Lovelace]{Person} worked with Charles Babbage in [London]{Place} on the Analytical Engine.')
  await select(page, host, 'Charles Babbage')
  await page.keyboard.press('p')
  expect(await host.evaluate((element: TextAnnotator) => element.annotate('person'))).toBe(false)
  expect(await drawn(host)).toBe(before)
  await accessible(page)
})

test('query matches are still marked inside and outside the spans', async ({ page, scenario }) => {
  await scenario('query')
  expect(await drawn(page.locator('c2-text-annotator'))).toBe('Ada Lovelace worked with Charles Babbage in London on <the> [Analytical Engine]{Thing}.')
  await expect(page.locator('c2-text-annotator')).toHaveJSProperty('matchCount', 1)
})

test('tags follow the labels given for the page language', async ({ page, scenario }) => {
  await scenario('french')
  expect(await drawn(page.locator('c2-text-annotator'))).toBe('[Ada Lovelace]{Personne} a travaillé à Londres.')
})

test('buttons outside the text label the selection when pressing them keeps it', async ({ page, scenario }) => {
  await scenario('legend')
  const host = page.locator('c2-text-annotator')
  await select(page, host, 'Analytical Engine')
  await page.getByRole('group', { name: 'Labels' }).getByRole('button', { name: 'Thing' }).click()
  await expect.poll(() => drawn(host)).toBe('Ada Lovelace worked with Charles Babbage in London on the [Analytical Engine]{Thing}.')
  await expect(events(page)).toHaveText('Analytical Engine:thing')
})
