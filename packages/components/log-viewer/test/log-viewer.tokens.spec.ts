import { test, expect } from './fixture'
import { logTokens, LogTokenLines } from '../src/log-tokens'
import { textLayout } from '../src/log-position'
import type { LogViewer } from '../src/log-viewer'

const message =
  '2026-09-26T10:42:01Z INFO WARN warning ERROR fatal DEBUG TRACE Payment ORD-10428 took 125ms for "ERROR" at https://shop.example/orders/10428\n<svg onload="alert(1)"> information errorCode warningly'

test('tokenizer preserves text and distinguishes severity from values and ordinary words', () => {
  const tokens = logTokens(message)
  expect(tokens.map((token) => token.text).join('')).toBe(message)
  expect(tokens.filter((token) => token.kind === 'error').map((token) => token.text)).toEqual(['ERROR', 'fatal'])
  expect(tokens.find((token) => token.text === '"ERROR"')?.kind).toBe('value')
  expect(tokens.find((token) => token.text === 'ORD-10428')?.kind).toBe('value')
  expect(tokens.find((token) => token.text === 'https://shop.example/orders/10428')?.kind).toBe('value')
  expect(tokens.find((token) => token.text === '2026-09-26T10:42:01Z')?.kind).toBe('muted')
  for (const word of ['information', 'errorCode', 'warningly']) expect(tokens.some((token) => token.kind && token.text === word)).toBe(false)
  expect(logTokens('')).toEqual([])
})

for (const tabular of [true, false]) {
  test(`log colors preserve safe text and filter highlighting (${tabular ? 'tabular' : 'plain'})`, async ({ page, scenario }) => {
    await scenario()
    const viewer = page.locator('c2-log-viewer')
    await viewer.evaluate(
      (element, input) => {
        const log = element as LogViewer
        log.tabular = input.tabular
        log.columns = ['message']
        log.appendEntries({ message: input.message })
        log.setFilter({ search: 'Payment' }, 'highlight')
      },
      { tabular, message },
    )
    const text = viewer.locator('[part~="text"]').first()
    await expect(text).toHaveText(message)
    await expect(viewer.locator('[data-token="error"]').first()).toHaveCSS('color', 'rgb(253, 164, 175)')
    await expect(viewer.locator('[data-token="warning"]').first()).toHaveCSS('color', 'rgb(252, 211, 77)')
    await expect(viewer.locator('[data-token="info"]').first()).toHaveCSS('color', 'rgb(110, 231, 183)')
    await expect(viewer.locator('[data-token="muted"]').first()).toHaveCSS('color', 'rgb(148, 163, 184)')
    await expect(viewer.locator('[data-token="value"]').first()).toHaveCSS('color', 'rgb(147, 197, 253)')
    await expect(text.locator('svg')).toHaveCount(0)
    await expect(viewer.locator('[part~="highlight"]').first()).toHaveCSS('background-color', 'rgb(23, 48, 76)')
    const height = await text.evaluate((element) => element.getBoundingClientRect().height)
    await viewer.evaluate((element) => element.style.setProperty('--c2-log-viewer__token--color', 'rgb(180, 190, 200)'))
    await expect(viewer.locator('[data-token="value"]').first()).toHaveCSS('color', 'rgb(180, 190, 200)')
    expect(await text.evaluate((element) => element.getBoundingClientRect().height)).toBe(height)
    await viewer.evaluate((element) => {
      ;(element as LogViewer).wrap = true
    })
    await expect.poll(async () => (await text.textContent())?.replace(/\n/g, '')).toBe(message.replace(/\n/g, ''))
  })
}

for (const tabular of [true, false]) {
  test(`token classes survive wrapping and virtual slices (${tabular ? 'tabular' : 'plain'})`, async ({ page, scenario }) => {
    await scenario()
    const viewer = page.locator('c2-log-viewer')
    const message = 'ERROR "not ERROR just a quoted value" https://shop.example/orders/10428 ORD-10428'
    await viewer.evaluate(
      (element, input) => {
        const log = element as LogViewer
        log.style.width = '80px'
        log.style.setProperty('--c2-log-viewer__message--min-width', '1px')
        log.columns = ['message']
        log.tabular = input.tabular
        log.wrap = true
        log.appendEntries({ message: input.message })
        log.setFilter(null)
      },
      { tabular, message },
    )
    await expect.poll(async () => (await viewer.locator('[data-token="error"]').allTextContents()).join('')).toBe('ERROR')
    await expect
      .poll(async () => (await viewer.locator('[data-token="value"]').allTextContents()).join(''))
      .toBe('"not ERROR just a quoted value"https://shop.example/orders/10428ORD-10428')
    const text = viewer.locator('[part~="text"]').first()
    await expect.poll(async () => (await text.textContent())?.replace(/\n/g, '')).toBe(message)
    if (!tabular) {
      const longMessage = '"' + 'quoted ERROR https://shop.example ORD-10428 '.repeat(500) + '"'
      await viewer.evaluate((element, value) => {
        const log = element as LogViewer
        log.clear()
        log.appendEntries({ message: value })
        log.setFilter(null)
      }, longMessage)
      await viewer.locator('[part="viewport"]').evaluate((element) => {
        element.scrollTop = 8000
      })
      await expect.poll(async () => (await viewer.locator('[part="text highlight"], .plain').first().textContent())?.length ?? 0).toBeLessThan(1000)
      await expect(viewer.locator('[data-token="error"]')).toHaveCount(0)
      expect(await viewer.locator('[data-token="value"]').count()).toBeGreaterThan(0)
      await expect(viewer.locator('[data-token="value"]').first()).toHaveCSS('color', 'rgb(147, 197, 253)')
      await viewer.getByRole('button', { name: 'Copy message 1', exact: true }).focus()
      await page.evaluate(() =>
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              Object.assign(window, { tokenCopiedText: text })
            },
          },
        }),
      )
      await page.keyboard.press('Enter')
      expect(await page.evaluate(() => (window as unknown as { tokenCopiedText: string }).tokenCopiedText)).toBe(longMessage)
    }
  })
}

test('logical token projection preserves unicode, explicit breaks and clipped values', () => {
  const original = 'ERROR 😀\r\n\r\n"quoted ERROR"\thttps://shop.example/ORD-10428 ORD-10428'
  for (const width of [1, 3, 7, 1000]) {
    const layout = textLayout(original, width, (text) => [...text].length, true)
    const tokens = new LogTokenLines(layout)
    expect(
      tokens
        .slice()
        .map((token) => token.text)
        .join(''),
    ).toBe(layout.lines.join('\n'))
    expect(
      tokens
        .slice()
        .filter((token) => token.kind === 'error')
        .map((token) => token.text)
        .join(''),
    ).toBe('ERROR')
    for (let line = 0; line < layout.lines.length; line++) {
      const slice = tokens.slice(line, line + 1)
      expect(slice.map((token) => token.text).join('')).toBe(layout.lines[line])
      const source = layout.logicalLines[layout.sources[line]]
      if (source.startsWith('"')) expect(slice.every((token) => token.kind !== 'error')).toBe(true)
    }
  }
})
