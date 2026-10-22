import type { LogViewer } from '../src/log-viewer'
import { test, expect } from './fixture'

test('shows aligned attributes, multiline content and safe text without chrome or slots', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  // A reflected default is not written onto the host (it would fail SSR hydration), so it is read as a property.
  await expect(viewer).toHaveJSProperty('tabular', true)
  await expect(viewer.locator('[part="entry"]')).toHaveCount(4)
  await expect(viewer.locator('[data-index="2"] [data-attribute="message"]')).toHaveText('<failed>')
  expect(await viewer.locator('failed, slot, nav').count()).toBe(0)
  const aligned = await viewer.evaluate((element) => {
    const cells = [...element.shadowRoot!.querySelectorAll('[data-attribute="message"]')]
    return cells.map((cell) => cell.getBoundingClientRect().left)
  })
  expect(new Set(aligned).size).toBe(1)
})

test('setFilter combines arbitrary attributes and search, retains data and filters future appends', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { source: 'api', level: ['error', 'warn'] }, search: 'FAILED' }))
  await expect(viewer.locator('[part="entry"]')).toHaveCount(1)
  await viewer.evaluate((element) =>
    (element as LogViewer).appendEntries([
      { message: 'failed again', source: 'api', level: 'warn' },
      { message: 'Hidden', source: 'worker' },
    ]),
  )
  await expect(viewer.locator('[part="entry"]')).toHaveCount(2)
  expect(await viewer.evaluate((element) => [(element as LogViewer).entryCount, (element as LogViewer).filteredCount])).toEqual([6, 2])
  await viewer.evaluate((element) => (element as LogViewer).setFilter(null))
  await expect(viewer.locator('[part="entry"]')).toHaveCount(6)
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ search: '12:03' }))
  await expect(viewer.locator('[data-index="3"]')).toHaveCount(1)
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ search: 'missing' }))
  await expect(viewer.locator('[part="empty"]')).toHaveText('No matching entries')
})

test('invalid data/filter leaves stored entries and active criteria unchanged', async ({ page, scenario }) => {
  await scenario('entries')
  const result = await page.locator('c2-log-viewer').evaluate((element) => {
    ;(element as LogViewer).setFilter({ attributes: { level: 'error' } })
    let errors = 0
    try {
      ;(element as LogViewer).appendEntries([{ message: 'valid' }, { message: 'invalid', bad: 5 } as never])
    } catch {
      errors++
    }
    try {
      ;(element as LogViewer).setFilter({ search: 4 } as never)
    } catch {
      errors++
    }
    return { errors, count: (element as LogViewer).entryCount }
  })
  expect(result).toEqual({ errors: 2, count: 4 })
  await expect(page.locator('[part="entry"]')).toHaveCount(1)
})

test('short attributes stick until their tall entry ends', async ({ page, scenario }) => {
  await scenario('tall')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = 300
  })
  const offset = await viewer.evaluate((element) => {
    const viewport = element.shadowRoot!.querySelector('[part="viewport"]')!
    const label = element.shadowRoot!.querySelector('[data-index="0"] [data-attribute="level"] [part="text"]')!
    return label.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  })
  expect(Math.abs(offset)).toBeLessThan(2)
  await viewer.evaluate((element) => (element as LogViewer).scrollToEnd())
  await expect(viewer.locator('[data-index="1"]')).toContainText('After tall row')
  const top = await viewer.locator('[data-index="0"] [data-attribute="level"] [part="text"]').boundingBox()
  const next = await viewer.locator('[data-index="1"]').boundingBox()
  expect(top!.y + top!.height).toBeLessThanOrEqual(next!.y)
})

test('plain mode is continuous text and virtualizes lines within a tall entry', async ({ page, scenario }) => {
  await scenario('tall')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.tabular = false
    log.columns = ['message']
  })
  await expect(viewer.locator('[part="entry"]')).toHaveCount(0)
  await expect(viewer.locator('.plain')).toContainText(['long line', 'After tall row'])
  const text = await viewer.locator('.plain').first().textContent()
  expect(text!.split('\n').length).toBeLessThan(50)
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = 0
  })
  await expect(viewer.locator('.plain').first()).toContainText('long line 0')
})

test('wrapping recalculates variable heights on resize and preserves the reading position', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = 1500
  })
  await expect.poll(() => viewer.locator('[part="entry"]').first().getAttribute('data-index')).not.toBe('0')
  await expect
    .poll(() =>
      viewer
        .locator('[part="entry"]')
        .first()
        .evaluate((row) => (row as HTMLElement).offsetTop),
    )
    .toBeLessThan(1500)
  const before = await viewer.evaluate((element) => {
    const viewport = element.shadowRoot!.querySelector('[part="viewport"]')!
    return [...element.shadowRoot!.querySelectorAll<HTMLElement>('[part="entry"]')].find((row) => row.offsetTop + row.offsetHeight > viewport.scrollTop)!
      .dataset.index
  })
  await viewer.evaluate((element) => {
    ;(element as LogViewer).wrap = true
    element.style.width = '400px'
  })
  await expect
    .poll(() =>
      viewer.evaluate((element) => {
        const viewport = element.shadowRoot!.querySelector('[part="viewport"]')!
        return [...element.shadowRoot!.querySelectorAll<HTMLElement>('[part="entry"]')].find((row) => row.offsetTop + row.offsetHeight > viewport.scrollTop)!
          .dataset.index
      }),
    )
    .toBe(before)
})

test('appending follows the tail only while reading the tail; clear keeps criteria', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'Newest' }))
  await expect(viewer.locator('[data-index="10000"]')).toContainText('Newest')
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = 500
  })
  await expect.poll(async () => Number(await viewer.locator('[part="entry"]').first().getAttribute('data-index'))).toBeLessThan(20)
  await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'New while reading' }))
  expect(await viewer.evaluate((element) => element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop)).toBe(500)
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.setFilter({ search: 'match' })
    log.clear()
    log.appendEntries([{ message: 'skip' }, { message: 'match' }])
  })
  await expect(viewer.locator('[part="entry"]')).toHaveCount(1)
})

test('wraps long tokens and observes boolean false strings', async ({ page, scenario }) => {
  await scenario('long')
  const viewer = page.locator('c2-log-viewer')
  const height = await viewer.locator('[part="entry"]').evaluate((entry) => entry.clientHeight)
  await viewer.evaluate((element) => {
    ;(element as LogViewer).wrap = true
  })
  await expect.poll(() => viewer.locator('[part="entry"]').evaluate((entry) => entry.clientHeight)).toBeGreaterThan(height)
  await viewer.evaluate((element) => {
    element.setAttribute('tabular', 'false')
    element.setAttribute('wrap', 'false')
  })
  await expect(viewer.locator('.plain')).toHaveCount(1)
  expect(await viewer.evaluate((element) => [(element as LogViewer).tabular, (element as LogViewer).wrap])).toEqual([false, false])
})

test('custom columns align arbitrary attributes and hidden attributes remain searchable', async ({ page, scenario }) => {
  await scenario()
  const viewer = page.locator('c2-log-viewer')
  await expect(viewer.locator('[part="empty"]')).toHaveText('No log entries')
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.columns = ['requestId', 'message']
    log.appendEntries([
      { requestId: '42', message: 'First\nSecond', privateTag: 'special' },
      { requestId: '43', message: 'Another' },
    ])
    log.setFilter({ search: 'special' })
  })
  await expect(viewer.locator('[part="cell"]')).toHaveCount(2)
  await expect(viewer.locator('[data-attribute="requestId"]')).toHaveText('42')
  await expect(viewer.locator('[data-attribute="privateTag"]')).toHaveCount(0)
  await viewer.evaluate((element) => (element as LogViewer).setFilter(null))
  await expect(viewer.locator('[part="entry"]')).toHaveCount(2)
  const heights = await viewer.locator('[part="entry"]').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height))
  expect(heights[0]).toBeGreaterThan(heights[1])
})

test('plain horizontal extent includes a long offscreen line and rows have no inter-entry gap', async ({ page, scenario }) => {
  await scenario()
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.tabular = false
    log.appendEntries([{ message: 'x'.repeat(2000) }, ...Array.from({ length: 100 }, (_, i) => ({ message: `line ${i}` }))])
  })
  await expect.poll(() => viewer.locator('[part="viewport"]').evaluate((viewport) => viewport.scrollWidth)).toBeGreaterThan(10000)
  const adjacent = await viewer.locator('.plain').evaluateAll((rows) => rows.slice(0, 2).map((row) => row.getBoundingClientRect()))
  expect(Math.abs(adjacent[0].bottom - adjacent[1].top)).toBeLessThan(1)
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = 0
  })
  await expect(viewer.locator('.plain').first()).toContainText('x'.repeat(2000))
})

test('filter changes start at the first match after reading a later entry', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.setFilter({ attributes: { level: 'error' } })
  })
  await expect(viewer.locator('[data-index="0"]')).toContainText('entry 0')
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = 5000
  })
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { level: 'info' } }))
  await expect(viewer.locator('[data-index="1"]')).toContainText('entry 1')
  expect(await viewer.locator('[part="viewport"]').evaluate((viewport) => viewport.scrollTop)).toBe(0)
})

test('highlight preserves surrounding entries and switches to matching-only filtering', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { level: 'error' } }, 'highlight'))
  await expect(viewer.locator('[part~="entry"]')).toHaveCount(4)
  await expect(viewer.locator('[part~="highlight"]')).toHaveCount(1)
  await expect(viewer.locator('[part~="highlight"]')).toHaveAttribute('data-index', '2')
  expect(await viewer.evaluate((element) => (element as LogViewer).filteredCount)).toBe(1)
  await viewer.evaluate((element) =>
    (element as LogViewer).appendEntries([
      { message: 'another error', level: 'error' },
      { message: 'context', level: 'info' },
    ]),
  )
  await expect(viewer.locator('[part~="entry"]')).toHaveCount(6)
  await expect(viewer.locator('[part~="highlight"]')).toHaveCount(2)
  expect(await viewer.evaluate((element) => (element as LogViewer).filteredCount)).toBe(2)
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { level: 'error' } }))
  await expect(viewer.locator('[part~="entry"]')).toHaveCount(2)
  await expect(viewer.locator('[part~="highlight"]')).toHaveCount(0)
  await viewer.evaluate((element) => (element as LogViewer).setFilter(null))
  await expect(viewer.locator('[part~="entry"]')).toHaveCount(6)
  await expect(viewer.locator('[part~="highlight"]')).toHaveCount(0)
})

test('plain highlight uses full text criteria and clear retains highlight mode', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.tabular = false
    log.setFilter({ search: 'retry' }, 'highlight')
  })
  await expect(viewer.locator('.plain')).toHaveCount(4)
  await expect(viewer.locator('[part~="highlight"]')).toContainText('Retry requested')
  await expect(viewer.locator('[part~="highlight"]')).toHaveCSS('background-color', 'rgb(23, 48, 76)')
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.clear()
    log.appendEntries([{ message: 'context' }, { message: 'Retry scheduled' }])
  })
  await expect(viewer.locator('.plain')).toHaveCount(2)
  await expect(viewer.locator('[part~="highlight"]')).toHaveCount(1)
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ search: 'missing' }, 'highlight'))
  await expect(viewer.locator('.plain')).toHaveCount(2)
  await expect(viewer.locator('[part~="empty"]')).toHaveCount(0)
  expect(await viewer.evaluate((element) => (element as LogViewer).filteredCount)).toBe(0)
})

test('highlight retains the reading anchor and virtualizes all entries with offscreen matches', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = 5000
  })
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { level: 'error' } }, 'highlight'))
  expect(await viewer.locator('[part="viewport"]').evaluate((viewport) => viewport.scrollTop)).toBe(5000)
  expect(await viewer.evaluate((element) => [(element as LogViewer).entryCount, (element as LogViewer).filteredCount])).toEqual([10000, 5000])
  expect(await viewer.locator('[part~="entry"]').count()).toBeLessThan(60)
  await viewer.evaluate((element) => (element as LogViewer).scrollToEnd())
  await expect(viewer.locator('[data-index="9998"][part~="highlight"]')).toContainText('entry 9998')
  await expect(viewer.locator('[data-index="9999"]')).toContainText('entry 9999')
})

test('invalid filter mode is atomic and highlight appearance remains customizable', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  const result = await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.setFilter({ search: 'failed' }, 'highlight')
    element.style.setProperty('--c2-log-viewer__entry__highlighted--background', 'rgb(31, 45, 61)')
    try {
      log.setFilter({ search: 'Ready' }, 'bad' as never)
    } catch {
      return true
    }
    return false
  })
  expect(result).toBe(true)
  await expect(viewer.locator('[part~="entry"]')).toHaveCount(4)
  await expect(viewer.locator('[part~="highlight"]')).toHaveAttribute('data-index', '2')
  await expect(viewer.locator('[part~="highlight"]')).toHaveCSS('background-color', 'rgb(31, 45, 61)')
})

test('attribute columns fit their widest values and only message fills remaining width', async ({ page, scenario }) => {
  await scenario()
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.wrap = true
    log.columns = ['level', 'source', 'message']
    log.appendEntries([
      { level: 'INFO', source: 'api', message: 'small' },
      { level: 'ERROR', source: 'payment-worker-eu-west', message: 'x'.repeat(200) },
    ])
    log.setFilter(null)
  })
  const sizes = await viewer.evaluate((element) => {
    const root = element.shadowRoot!
    const cells = [...root.querySelectorAll('[data-index="0"] [part="cell"]')]
    const widths = cells.map((cell) => cell.getBoundingClientRect().width)
    const canvas = document.createElement('canvas').getContext('2d')!
    const style = getComputedStyle(cells[0])
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    return {
      widths,
      expected: [Math.ceil(canvas.measureText('ERROR').width) + 24, Math.ceil(canvas.measureText('payment-worker-eu-west').width) + 24],
      viewport: root.querySelector('[part="viewport"]')!.clientWidth,
    }
  })
  expect(sizes.widths.slice(0, 2)).toEqual(sizes.expected)
  expect(sizes.widths.reduce((sum, width) => sum + width, 0)).toBe(sizes.viewport)
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { source: 'api' } }))
  expect(await viewer.locator('[part="cell"]').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))).toEqual(sizes.widths)
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.setFilter(null)
    log.wrap = false
  })
  await expect
    .poll(() => viewer.locator('[data-index="0"] [data-attribute="message"]').evaluate((cell) => cell.getBoundingClientRect().width))
    .toBe(sizes.widths[2])
  expect(await viewer.locator('[part="viewport"]').evaluate((viewport) => viewport.scrollWidth)).toBeGreaterThan(sizes.viewport)
  await viewer.evaluate((element) =>
    (element as LogViewer).appendEntries({ level: 'INFO', source: 'a-much-longer-worker-name-for-the-next-region', message: 'new' }),
  )
  await expect
    .poll(() => viewer.locator('[data-index="0"] [data-attribute="source"]').evaluate((cell) => cell.getBoundingClientRect().width))
    .toBeGreaterThan(sizes.widths[1])
})

test('scrollToStart opens a replaced buffer at the first entry and keeps it there while appending', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  const scrollTop = () => viewer.evaluate((element) => element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop)
  await expect.poll(scrollTop).toBeGreaterThan(0)
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.clear()
    log.appendEntries(Array.from({ length: 2000 }, (_, index) => ({ message: `replaced ${index}` })))
    log.scrollToStart()
  })
  await expect(viewer.locator('[data-index="0"]')).toContainText('replaced 0')
  expect(await scrollTop()).toBe(0)
  await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'later' }))
  await viewer.evaluate((element) => (element as LogViewer).updateComplete)
  expect(await scrollTop()).toBe(0)

  // An empty viewport is also its own end: a pinned start still holds while a stream fills it.
  await viewer.evaluate((element) => {
    const log = element as LogViewer
    log.clear()
    log.scrollToStart()
  })
  for (let batch = 0; batch < 3; batch++) {
    await viewer.evaluate(
      (element, batch) => (element as LogViewer).appendEntries(Array.from({ length: 200 }, (_, index) => ({ message: `stream ${batch}-${index}` }))),
      batch,
    )
    await viewer.evaluate((element) => (element as LogViewer).updateComplete)
  }
  expect(await scrollTop()).toBe(0)
  await viewer.evaluate((element) => (element as LogViewer).scrollToEnd())
  await expect.poll(scrollTop).toBeGreaterThan(0)
})

test('entry-click reports the clicked entry and its retained index, not the copy button', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    const events: unknown[] = []
    ;(window as unknown as { entryClicks: unknown[] }).entryClicks = events
    document.addEventListener('entry-click', (event) => events.push((event as CustomEvent).detail))
    ;(element as LogViewer).setFilter({ attributes: { source: 'api' } })
  })
  const clicks = () => page.evaluate(() => (window as unknown as { entryClicks: unknown[] }).entryClicks)
  await viewer.locator('[data-index="2"] [data-attribute="message"]').click()
  await expect.poll(clicks).toEqual([{ entry: { timestamp: '12:02', level: 'error', source: 'api', message: '<failed>' }, index: 2 }])
  await page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'])
    .catch(() => {})
  await viewer.locator('[data-index="3"]').hover()
  await viewer.locator('[data-index="3"] [part="copy-button"]').click()
  expect(await clicks()).toHaveLength(1)
})

test('the arrow keys move the active entry and Enter fires entry-activate', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await page.evaluate(() => {
    const events: unknown[] = []
    ;(window as unknown as { activations: unknown[] }).activations = events
    document.addEventListener('entry-activate', (event) => events.push((event as CustomEvent).detail))
  })
  const activations = () => page.evaluate(() => (window as unknown as { activations: unknown[] }).activations)
  const viewport = viewer.locator('[part="viewport"]')
  await viewport.focus()
  // Nothing is active until the keyboard (or a click) picks an entry, so Enter does nothing yet.
  await page.keyboard.press('Enter')
  await expect(viewport).not.toHaveAttribute('aria-activedescendant')
  await page.keyboard.press('ArrowDown')
  await expect(viewport).toHaveAttribute('aria-activedescendant', 'entry-0')
  await expect(viewer.locator('#entry-0')).toHaveAttribute('data-active', '')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await expect(viewport).toHaveAttribute('aria-activedescendant', 'entry-1')
  await page.keyboard.press('Enter')
  const entry = await viewer.evaluate((element) => ({ ...(element as unknown as { entries: object[] }).entries[1] }))
  await expect.poll(activations).toEqual([{ entry, index: 1 }])

  // A click makes that entry the active one, so the keyboard carries on from it.
  await viewer.locator('[data-index="3"] [data-attribute="message"]').click()
  await expect(viewport).toHaveAttribute('aria-activedescendant', 'entry-3')
  await page.keyboard.press('ArrowUp')
  await expect(viewport).toHaveAttribute('aria-activedescendant', 'entry-2')
})

test('a drag that selects text inside an entry does not report entry-click', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await page.evaluate(() => {
    const events: unknown[] = []
    ;(window as unknown as { entryClicks: unknown[] }).entryClicks = events
    document.addEventListener('entry-click', (event) => events.push((event as CustomEvent).detail))
  })
  const message = viewer.locator('[data-index="0"] [data-attribute="message"] [part="text"]')
  const box = (await message.boundingBox())!
  await page.mouse.move(box.x + 1, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await message.click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { entryClicks: unknown[] }).entryClicks.length)).toBe(1)
})

test('scrollToStart jumps instantly under smooth scroll-behavior and stays pinned', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector<HTMLElement>('[part="viewport"]')!.style.scrollBehavior = 'smooth'
  })
  const box = (await viewer.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(viewer.locator('[data-copy-hover="true"]')).toHaveCount(1)
  const scrollTop = await viewer.evaluate(async (element) => {
    const log = element as LogViewer
    log.scrollToStart()
    await log.updateComplete
    return element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop
  })
  expect(scrollTop).toBe(0)
  await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'later' }))
  await viewer.evaluate((element) => (element as LogViewer).updateComplete)
  expect(await viewer.evaluate((element) => element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop)).toBe(0)
})
