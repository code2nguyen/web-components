import { test, expect, accessible } from '../../../../tests/component-fixture'
import { readFileSync } from 'node:fs'

const rows = `
  <div id="first" data-reorder-key="first" data-reorder-label="First task" style="height:60px">First</div>
  <div id="second" data-reorder-key="second" data-reorder-label="Second task" style="height:60px">Second</div>
  <div id="third" data-reorder-key="third" data-reorder-label="Third task" style="height:60px">Third</div>
`

async function visualIds(host: import('@playwright/test').Locator): Promise<string[]> {
  return host.evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.list-item[data-assignment-id]')].map(
      (wrapper) => (wrapper.querySelector('slot') as HTMLSlotElement).assignedElements()[0]?.id ?? '',
    ),
  )
}

async function drag(page: import('@playwright/test').Page, from: string, to: string): Promise<void> {
  const source = await page.locator(from).boundingBox()
  const destination = await page.locator(to).boundingBox()
  if (!source || !destination) throw new Error('Missing drag geometry')
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + source.width / 2 + 16, source.y + source.height / 2 + 8, { steps: 3 })
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height - 4, { steps: 8 })
  await page.mouse.up()
}

async function startPointerDrag(page: import('@playwright/test').Page, from = '#first'): Promise<void> {
  const source = await page.locator(from).boundingBox()
  if (!source) throw new Error('Missing drag source geometry')
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + source.width / 2 + 18, source.y + source.height / 2 + 12, { steps: 3 })
}

async function startSyntheticPointerDrag(host: import('@playwright/test').Locator, pointerId: number): Promise<void> {
  await host.evaluate((element, id) => {
    const container = element.shadowRoot!.querySelector<HTMLElement>('.c2-reorder-list-container')!
    const source = element.shadowRoot!.querySelector<HTMLElement>('.list-item[data-assignment-id]')!
    const capturedPointers = new Set<number>()
    Object.defineProperties(container, {
      setPointerCapture: { configurable: true, value: (pointerId: number) => capturedPointers.add(pointerId) },
      releasePointerCapture: { configurable: true, value: (pointerId: number) => capturedPointers.delete(pointerId) },
      hasPointerCapture: { configurable: true, value: (pointerId: number) => capturedPointers.has(pointerId) },
    })
    const rect = source.getBoundingClientRect()
    source.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        pointerId: id,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        clientX: rect.left + 4,
        clientY: rect.top + 4,
      }),
    )
    container.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        composed: true,
        pointerId: id,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        clientX: rect.left + 24,
        clientY: rect.top + 24,
      }),
    )
  }, pointerId)
  await expect(host.locator('[part="placeholder"]')).toBeVisible()
}

async function expectCleanPointerState(host: import('@playwright/test').Locator, pointerId = 1): Promise<void> {
  await expect(host.locator('[part="placeholder"]')).toHaveCount(0)
  await expect(host.locator('[part="dragging-item"]')).not.toBeVisible()
  await expect
    .poll(() =>
      host.evaluate((element, id) => {
        const container = element.shadowRoot!.querySelector<HTMLElement>('.c2-reorder-list-container')!
        const preview = element.shadowRoot!.querySelector<HTMLElement>('[part="dragging-item"]')!
        return {
          captured: container.hasPointerCapture(id),
          left: preview.style.left,
          top: preview.style.top,
          width: preview.style.width,
          height: preview.style.height,
        }
      }, pointerId),
    )
    .toEqual({ captured: false, left: '', top: '', width: '', height: '' })
}

async function installLifecycleProbe(page: import('@playwright/test').Page, host: import('@playwright/test').Locator): Promise<void> {
  await host.evaluate((element) => {
    const probeWindow = window as Window & {
      __reorderLifecycleProbe?: {
        capturedIds: Set<number>
        container: HTMLElement
        documentKeydownListeners: number
        pendingFrames: Set<number>
        scrollListeners: number
        restore(): void
      }
    }
    probeWindow.__reorderLifecycleProbe?.restore()
    const container = element.shadowRoot!.querySelector<HTMLElement>('.c2-reorder-list-container')!
    const scroller = element.parentElement!
    const capturedIds = new Set<number>()
    const pendingFrames = new Set<number>()
    const originalSetPointerCapture = container.setPointerCapture.bind(container)
    const originalDocumentAdd = document.addEventListener.bind(document)
    const originalDocumentRemove = document.removeEventListener.bind(document)
    const originalScrollerAdd = scroller.addEventListener.bind(scroller)
    const originalScrollerRemove = scroller.removeEventListener.bind(scroller)
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    const originalCancelFrame = window.cancelAnimationFrame.bind(window)
    const probe = {
      capturedIds,
      container,
      documentKeydownListeners: 0,
      pendingFrames,
      scrollListeners: 0,
      restore() {
        container.setPointerCapture = originalSetPointerCapture
        document.addEventListener = originalDocumentAdd
        document.removeEventListener = originalDocumentRemove
        scroller.addEventListener = originalScrollerAdd
        scroller.removeEventListener = originalScrollerRemove
        window.requestAnimationFrame = originalRequestFrame
        window.cancelAnimationFrame = originalCancelFrame
        delete probeWindow.__reorderLifecycleProbe
      },
    }
    container.setPointerCapture = (pointerId: number) => {
      capturedIds.add(pointerId)
      originalSetPointerCapture(pointerId)
    }
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
      if (type === 'keydown') probe.documentKeydownListeners++
      originalDocumentAdd(type, listener, options)
    }) as typeof document.addEventListener
    document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
      if (type === 'keydown') probe.documentKeydownListeners--
      originalDocumentRemove(type, listener, options)
    }) as typeof document.removeEventListener
    scroller.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
      if (type === 'scroll') probe.scrollListeners++
      originalScrollerAdd(type, listener, options)
    }) as typeof scroller.addEventListener
    scroller.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
      if (type === 'scroll') probe.scrollListeners--
      originalScrollerRemove(type, listener, options)
    }) as typeof scroller.removeEventListener
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      let frame = 0
      frame = originalRequestFrame((time) => {
        pendingFrames.delete(frame)
        callback(time)
      })
      pendingFrames.add(frame)
      return frame
    }
    window.cancelAnimationFrame = (frame: number) => {
      pendingFrames.delete(frame)
      originalCancelFrame(frame)
    }
    probeWindow.__reorderLifecycleProbe = probe
  })
}

async function lifecycleProbeSnapshot(page: import('@playwright/test').Page): Promise<{
  captured: number
  capturedIds: number[]
  documentKeydownListeners: number
  pendingFrames: number
  scrollListeners: number
}> {
  return page.evaluate(() => {
    const probe = (
      window as Window & {
        __reorderLifecycleProbe?: {
          capturedIds: Set<number>
          container: HTMLElement
          documentKeydownListeners: number
          pendingFrames: Set<number>
          scrollListeners: number
        }
      }
    ).__reorderLifecycleProbe
    if (!probe) throw new Error('Lifecycle probe is not installed')
    return {
      captured: [...probe.capturedIds].filter((pointerId) => probe.container.hasPointerCapture(pointerId)).length,
      capturedIds: [...probe.capturedIds],
      documentKeydownListeners: probe.documentKeydownListeners,
      pendingFrames: probe.pendingFrames.size,
      scrollListeners: probe.scrollListeners,
    }
  })
}

async function restoreLifecycleProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() =>
    (
      window as Window & {
        __reorderLifecycleProbe?: { restore(): void }
      }
    ).__reorderLifecycleProbe?.restore(),
  )
}

test('initializes from authored ordinary children without success events or public numeric slots', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-reorder-list aria-label="Tasks">
      <div id="first">First</div>
      <div id="placeholder" slot="placeholder">Place here</div>
      <div id="second">Second</div>
      <div id="preview" slot="dragging-item">Preview</div>
    </c2-reorder-list>
  `)
  const host = page.locator('c2-reorder-list')
  expect(await visualIds(host)).toEqual(['first', 'second'])
  await expect(host.locator('[part="container"]')).toHaveAttribute('role', 'list')
  await expect(host.locator('[role="listitem"]')).toHaveCount(2)
  await expect(page.locator('#first')).toHaveAttribute('slot', /^c2-reorder-item-/)
  expect(await host.evaluate((element) => [...element.children].filter((child) => /^\d+$/.test((child as HTMLElement).slot)).length)).toBe(0)
})

test('reconciles inserted, removed, and externally reordered children without firing success events', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list aria-label="Tasks">${rows}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  await host.evaluate((element) => {
    let count = 0
    element.addEventListener('reorder', () => count++)
    const fourth = document.createElement('div')
    fourth.id = 'fourth'
    fourth.textContent = 'Fourth'
    element.insertBefore(fourth, element.firstElementChild)
    element.append(element.querySelector('#second')!)
    element.querySelector('#third')!.remove()
    ;(element as HTMLElement).dataset.reorderCount = String(count)
  })
  await expect.poll(() => visualIds(host)).toEqual(['fourth', 'first', 'second'])
  await expect(host).toHaveAttribute('data-reorder-count', '0')
})

test('commits the displayed pointer destination once and publishes canonical and legacy details', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  await host.evaluate((element) => {
    element.addEventListener('reorder', (event) => {
      const detail = (event as CustomEvent).detail
      element.setAttribute(
        'data-reorder-result',
        JSON.stringify({
          id: detail.item.element.id,
          key: detail.item.key,
          from: detail.fromIndex,
          to: detail.toIndex,
          order: detail.order.map((item: { element: HTMLElement }) => item.element.id),
          input: detail.inputMethod,
          bubbles: event.bubbles,
          composed: event.composed,
          cancelable: event.cancelable,
        }),
      )
    })
    element.addEventListener('change', (event) => element.setAttribute('data-change-result', JSON.stringify((event as CustomEvent).detail)))
  })
  await drag(page, '#first', '#third')
  await expect.poll(() => visualIds(host)).toEqual(['second', 'third', 'first'])
  await expect(host).toHaveAttribute(
    'data-reorder-result',
    JSON.stringify({
      id: 'first',
      key: 'first',
      from: 0,
      to: 2,
      order: ['second', 'third', 'first'],
      input: 'mouse',
      bubbles: true,
      composed: true,
      cancelable: false,
    }),
  )
  await expect(host).toHaveAttribute('data-change-result', '[2,0,1]')
})

test('keeps threshold, no-op, readonly, and nested-control interactions event-free', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-reorder-list aria-label="Tasks">
      <div id="first" style="height:60px">First <button id="action" type="button">Open</button></div>
      <div id="second" style="height:60px">Second</div>
    </c2-reorder-list>
  `)
  const host = page.locator('c2-reorder-list')
  await host.evaluate((element) => {
    element.dataset.events = '0'
    element.addEventListener('reorder', () => (element.dataset.events = String(Number(element.dataset.events) + 1)))
  })
  await page.locator('#action').click()
  const first = await page.locator('#first').boundingBox()
  if (!first) throw new Error('Missing row')
  await page.mouse.move(first.x + 10, first.y + 10)
  await page.mouse.down()
  await page.mouse.move(first.x + 14, first.y + 12)
  await page.mouse.up()
  await expect(host).toHaveAttribute('data-events', '0')
  expect(await visualIds(host)).toEqual(['first', 'second'])
})

test('cancels pointer reorder on Escape and clears transient feedback', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  const first = await page.locator('#first').boundingBox()
  if (!first) throw new Error('Missing row')
  await page.mouse.move(first.x + 20, first.y + 20)
  await page.mouse.down()
  await page.mouse.move(first.x + 40, first.y + 40, { steps: 3 })
  await expect(host.locator('[part="placeholder"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(host.locator('[part="placeholder"]')).toHaveCount(0)
  await expect(host.locator('[part="dragging-item"]')).not.toBeVisible()
  expect(await visualIds(host)).toEqual(['first', 'second', 'third'])
})

test('supports keyboard pickup, movement, commit, focus retention, and cancellation', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  const firstWrapper = host.locator('.list-item[data-assignment-id]').first()
  const firstAssignmentId = await firstWrapper.getAttribute('data-assignment-id')
  if (!firstAssignmentId) throw new Error('Missing stable assignment id')
  const movedItemWrapper = host.locator(`.list-item[data-assignment-id="${firstAssignmentId}"]`)
  await firstWrapper.focus()
  await firstWrapper.press('Space')
  await movedItemWrapper.press('ArrowDown')
  await movedItemWrapper.press('End')
  await movedItemWrapper.press('Space')
  await expect.poll(() => visualIds(host)).toEqual(['second', 'third', 'first'])
  await expect(host.locator('.list-item[data-assignment-id]').last()).toBeFocused()
  await expect(host.locator('[role="status"]')).toContainText('moved from position 1 to 3')

  await movedItemWrapper.press('Space')
  await movedItemWrapper.press('Home')
  await movedItemWrapper.press('Escape')
  expect(await visualIds(host)).toEqual(['second', 'third', 'first'])
  await expect(host.locator('[role="status"]')).toContainText('returned to position 3')
})

test('keeps fixed rows at absolute positions while movable rows cross them', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-reorder-list editable aria-label="Tasks">
      <div id="a">A</div><div id="fixed" data-fixed>Fixed</div><div id="b">B</div><div id="c">C</div>
    </c2-reorder-list>
  `)
  const host = page.locator('c2-reorder-list')
  const first = host.locator('.list-item[data-assignment-id]').first()
  await first.focus()
  await first.press('Space')
  await first.press('End')
  await first.press('Space')
  expect(await visualIds(host)).toEqual(['b', 'fixed', 'c', 'a'])
  await expect(host.locator('.list-item[data-assignment-id]').nth(1)).toHaveAttribute('tabindex', '-1')
})

test('treats data-fixed false and zero as movable', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-reorder-list editable aria-label="Tasks">
      <div id="a" data-fixed="false">A</div><div id="b" data-fixed="0">B</div><div id="fixed" data-fixed>Fixed</div>
    </c2-reorder-list>
  `)
  const wrappers = page.locator('c2-reorder-list').locator('.list-item[data-assignment-id]')
  await expect(wrappers.nth(0)).toHaveAttribute('tabindex', '0')
  await wrappers.nth(1).focus()
  await expect(wrappers.nth(1)).toHaveAttribute('tabindex', '0')
  await expect(wrappers.nth(2)).toHaveAttribute('tabindex', '-1')
})

test('rejects duplicate keys with one actionable error and no success event', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-reorder-list editable aria-label="Tasks">
      <div data-reorder-key="same">A</div><div data-reorder-key="same">B</div>
    </c2-reorder-list>
  `)
  const host = page.locator('c2-reorder-list')
  await host.evaluate((element) => {
    element.dataset.errors = '0'
    element.dataset.success = '0'
    element.addEventListener('reorder-error', (event) => {
      element.dataset.errors = String(Number(element.dataset.errors) + 1)
      element.dataset.errorKey = (event as CustomEvent).detail.key
    })
    element.addEventListener('reorder', () => (element.dataset.success = String(Number(element.dataset.success) + 1)))
  })
  const first = host.locator('.list-item[data-assignment-id]').first()
  await first.focus()
  await first.press('Space')
  await expect(host).toHaveAttribute('data-errors', '1')
  await expect(host).toHaveAttribute('data-error-key', 'same')
  await expect(host).toHaveAttribute('data-success', '0')
  await expect(host.locator('[role="status"]')).toContainText('used more than once')
})

test('maps touch and pen pointer contracts to canonical input methods', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  for (const pointerType of ['touch', 'pen']) {
    await host.evaluate((element, type) => {
      const container = element.shadowRoot!.querySelector<HTMLElement>('.c2-reorder-list-container')!
      const wrappers = element.shadowRoot!.querySelectorAll<HTMLElement>('.list-item[data-assignment-id]')
      Object.defineProperties(container, {
        setPointerCapture: { configurable: true, value: () => undefined },
        hasPointerCapture: { configurable: true, value: () => false },
      })
      const source = wrappers[0].getBoundingClientRect()
      const target = wrappers[2].getBoundingClientRect()
      const emit = (targetElement: Element, name: string, x: number, y: number) =>
        targetElement.dispatchEvent(
          new PointerEvent(name, { bubbles: true, composed: true, pointerId: 42, pointerType: type, isPrimary: true, button: 0, clientX: x, clientY: y }),
        )
      element.addEventListener(
        'reorder',
        (event) => {
          element.setAttribute('data-input-method', (event as CustomEvent).detail.inputMethod)
        },
        { once: true },
      )
      emit(wrappers[0], 'pointerdown', source.left + 5, source.top + 5)
      emit(container, 'pointermove', source.left + 24, source.top + 24)
      emit(container, 'pointermove', target.left + 5, target.bottom - 2)
      emit(container, 'pointerup', target.left + 5, target.bottom - 2)
    }, pointerType)
    await expect(host).toHaveAttribute('data-input-method', pointerType)
    await host.evaluate((element) => {
      const children = [...element.children].filter((child) => !['placeholder', 'dragging-item'].includes((child as HTMLElement).slot))
      children.sort((left, right) => ['first', 'second', 'third'].indexOf(left.id) - ['first', 'second', 'third'].indexOf(right.id))
      for (const child of children) element.append(child)
    })
    await expect.poll(() => visualIds(host)).toEqual(['first', 'second', 'third'])
  }
})

test('auto-scrolls the nearest eligible ancestor and honors autoscrolldisabled', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div id="scroller" style="height:150px;overflow-y:auto;margin-top:80px">
      <c2-reorder-list editable aria-label="Tasks">
        ${Array.from({ length: 8 }, (_, index) => `<div id="row-${index}" style="height:${44 + (index % 3) * 12}px">Row ${index}</div>`).join('')}
      </c2-reorder-list>
    </div>
  `)
  const scroller = page.locator('#scroller')
  const first = await page.locator('#row-0').boundingBox()
  const box = await scroller.boundingBox()
  if (!first || !box) throw new Error('Missing scroll geometry')
  await page.mouse.move(first.x + 10, first.y + 10)
  await page.mouse.down()
  await page.mouse.move(first.x + 30, first.y + 30)
  await page.mouse.move(box.x + 20, box.y + box.height - 2)
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await page.mouse.up()

  await scroller.evaluate((element) => (element.scrollTop = 0))
  await page.locator('c2-reorder-list').evaluate((element) => element.setAttribute('autoscrolldisabled', ''))
  const resetFirst = await page.locator('#row-0').boundingBox()
  if (!resetFirst) throw new Error('Missing reset row')
  await page.mouse.move(resetFirst.x + 10, resetFirst.y + 10)
  await page.mouse.down()
  await page.mouse.move(resetFirst.x + 30, resetFirst.y + 30)
  await page.mouse.move(box.x + 20, box.y + box.height - 2)
  await page.waitForTimeout(100)
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(0)
  await page.mouse.up()
})

test('cancels cleanly when children mutate or editing becomes unavailable', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  const start = async () => {
    const first = await page.locator('#first').boundingBox()
    if (!first) throw new Error('Missing active row')
    await page.mouse.move(first.x + 10, first.y + 10)
    await page.mouse.down()
    await page.mouse.move(first.x + 30, first.y + 30)
    await expect(host.locator('[part="placeholder"]')).toBeVisible()
  }

  await start()
  await host.evaluate((element) => element.append(document.createElement('div')))
  await expect(host.locator('[part="placeholder"]')).toHaveCount(0)
  await page.mouse.up()
  expect((await visualIds(host)).filter(Boolean)).toEqual(['first', 'second', 'third'])

  await start()
  await host.evaluate(async (element) => {
    ;(element as HTMLElement & { editable: boolean; updateComplete: Promise<boolean> }).editable = false
    await (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
  })
  await expect(host.locator('[part="placeholder"]')).toHaveCount(0)
  await page.mouse.up()
  expect((await visualIds(host)).filter(Boolean)).toEqual(['first', 'second', 'third'])
})

test('keeps event cardinality exact across 100 completed, canceled, and no-op keyboard attempts', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`)
  const result = await page.locator('c2-reorder-list').evaluate(async (element) => {
    const host = element as HTMLElement & { updateComplete: Promise<boolean> }
    let reorders = 0
    let changes = 0
    host.addEventListener('reorder', () => reorders++)
    host.addEventListener('change', () => changes++)
    const key = async (wrapper: HTMLElement, value: string, code = value) => {
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, key: value, code }))
      await host.updateComplete
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      const wrapper = host.shadowRoot!.querySelector<HTMLElement>('.list-item[data-assignment-id][tabindex="0"]')!
      if (attempt % 3 === 0) {
        const atEnd = wrapper.getAttribute('aria-posinset') === wrapper.getAttribute('aria-setsize')
        await key(wrapper, ' ', 'Space')
        await key(wrapper, atEnd ? 'Home' : 'End')
        await key(wrapper, ' ', 'Space')
      } else if (attempt % 3 === 1) {
        await key(wrapper, ' ', 'Space')
        await key(wrapper, 'Escape')
      } else {
        await key(wrapper, ' ', 'Space')
        await key(wrapper, ' ', 'Space')
      }
    }
    return { reorders, changes }
  })
  expect(result).toEqual({ reorders: 34, changes: 34 })
})

test('moves an item across a 20-item list by keyboard within the success budget', async ({ page, renderScenario }) => {
  const twenty = Array.from({ length: 20 }, (_, index) => `<div id="item-${index}" data-reorder-key="${index}">Item ${index}</div>`).join('')
  await renderScenario(`<c2-reorder-list editable aria-label="Twenty tasks">${twenty}</c2-reorder-list>`)
  const elapsed = await page.locator('c2-reorder-list').evaluate(async (element) => {
    const host = element as HTMLElement & { updateComplete: Promise<boolean> }
    const wrapper = host.shadowRoot!.querySelector<HTMLElement>('.list-item[data-assignment-id][tabindex="0"]')!
    const key = async (value: string, code = value) => {
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, key: value, code }))
      await host.updateComplete
    }
    const started = performance.now()
    await key(' ', 'Space')
    await key('End')
    await key(' ', 'Space')
    return performance.now() - started
  })
  expect(elapsed).toBeLessThan(10_000)
  await expect.poll(() => visualIds(page.locator('c2-reorder-list'))).toEqual([...Array.from({ length: 19 }, (_, index) => `item-${index + 1}`), 'item-0'])
})

test('resolves aria-labelledby into a shadow-list accessible name', async ({ page, renderScenario }) => {
  await renderScenario(`<h2 id="queue-title">Release priorities</h2><c2-reorder-list editable aria-labelledby="queue-title">${rows}</c2-reorder-list>`)
  await expect(page.locator('c2-reorder-list').locator('[part="container"]')).toHaveAttribute('aria-label', 'Release priorities')
})

test('exposes public parts, variables, default feedback, and reduced-motion behavior', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  await expect(host.locator('[part="container"]')).toBeVisible()
  await expect(host.locator('[part="item"]')).toHaveCount(3)
  await page.addStyleTag({
    content: `c2-reorder-list { --c2-reorder-list__item__focus--outline-color: rgb(1, 2, 3); --c2-reorder-list__placeholder--border-color: rgb(4, 5, 6); }`,
  })
  const wrapper = host.locator('[part="item"]').first()
  await wrapper.focus()
  await expect(wrapper).toHaveCSS('outline-color', 'rgb(1, 2, 3)')
  await expect(wrapper).toHaveCSS('transition-duration', '0s')
  await startSyntheticPointerDrag(host, 61)
  const placeholder = host.locator('[part="placeholder"]')
  await expect(placeholder).toHaveCSS('border-bottom-width', '2px')
  await expect(placeholder).toHaveCSS('border-bottom-style', 'dashed')
  await expect(placeholder).toHaveCSS('border-bottom-color', 'rgb(4, 5, 6)')
})

test('has no representative WCAG A/AA violations and preserves nested controls', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-reorder-list editable aria-label="Task priority">
      <div data-reorder-label="Review task">Review <button type="button">Open details</button></div>
      <div data-reorder-label="Publish task">Publish</div>
    </c2-reorder-list>
  `)
  await accessible(page)
  await page.getByRole('button', { name: 'Open details' }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Open details' })).toBeFocused()
  expect(await visualIds(page.locator('c2-reorder-list'))).toEqual(['', ''])
})

test('keeps generated manifest property and attribute defaults literal and synchronized', () => {
  const manifest = JSON.parse(readFileSync(new URL('../custom-elements.json', import.meta.url), 'utf8')) as {
    modules: Array<{
      declarations: Array<{
        tagName?: string
        members?: Array<{ name: string; default?: string }>
        attributes?: Array<{ name: string; default?: string }>
      }>
    }>
  }
  const declaration = manifest.modules.flatMap((module) => module.declarations).find((candidate) => candidate.tagName === 'c2-reorder-list')
  expect(declaration?.members?.find((member) => member.name === 'dragStartThreshold')?.default).toBe('10')
  expect(declaration?.attributes?.find((attribute) => attribute.name === 'dragstartthreshold')?.default).toBe('10')
})

test('keeps interactive custom feedback inert and outside the focus order', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-reorder-list editable aria-label="Tasks">
      ${rows}
      <button id="placeholder-action" slot="placeholder" type="button">Choose destination</button>
      <a id="preview-action" slot="dragging-item" href="#preview">Preview details</a>
    </c2-reorder-list>
  `)
  const host = page.locator('c2-reorder-list')
  await host.evaluate((element) => {
    element.dataset.activations = '0'
    for (const child of element.querySelectorAll('#placeholder-action, #preview-action')) {
      child.addEventListener('click', () => (element.dataset.activations = String(Number(element.dataset.activations) + 1)))
    }
  })
  await startSyntheticPointerDrag(host, 52)
  await expect(host.locator('[part="placeholder"]')).toBeVisible()
  await expect(host.locator('[part="placeholder"]')).toHaveAttribute('inert', '')
  await expect(host.locator('[part="dragging-item"]')).toHaveAttribute('inert', '')

  for (const selector of ['#placeholder-action', '#preview-action']) {
    await page.locator(selector).evaluate((element) => (element as HTMLElement).focus())
    await expect(page.locator(selector)).not.toBeFocused()
  }

  const activeTargets = await Promise.all(['#placeholder-action', '#preview-action'].map((selector) => page.locator(selector).boundingBox()))
  for (const target of activeTargets) {
    if (!target) throw new Error('Missing active feedback geometry')
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2)
  }
  await expect(host).toHaveAttribute('data-activations', '0')
  expect(page.url()).not.toContain('#preview')

  await host.locator('[part="container"]').dispatchEvent('pointercancel', { pointerId: 52, pointerType: 'mouse', isPrimary: true })
  await expectCleanPointerState(host, 52)
  for (const target of activeTargets) {
    if (!target) continue
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2)
  }
  await expect(host).toHaveAttribute('data-activations', '0')
  expect(page.url()).not.toContain('#preview')
})

test('cancels pointer and keyboard sessions for hidden and zero-sized required regions', async ({ page, renderScenario }) => {
  const cases = ['host', 'container', 'item', 'wrapper'] as const
  const states = ['hidden', 'zero-sized'] as const
  const inputs = ['pointer', 'keyboard'] as const

  for (const input of inputs) {
    for (const target of cases) {
      for (const state of states) {
        await test.step(`${input} ${target} ${state}`, async () => {
          await renderScenario(`<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`)
          const host = page.locator('c2-reorder-list')
          await host.evaluate((element) => {
            element.dataset.successes = '0'
            element.addEventListener('reorder', () => (element.dataset.successes = String(Number(element.dataset.successes) + 1)))
          })
          if (input === 'pointer') await startPointerDrag(page)
          else {
            const wrapper = host.locator('.list-item[data-assignment-id]').first()
            await wrapper.focus()
            await wrapper.press('Space')
          }

          await host.evaluate(
            (element, value) => {
              const [targetName, stateName, inputName] = value as [typeof target, typeof state, typeof input]
              const activeItem = element.querySelector<HTMLElement>('#first')!
              const container = element.shadowRoot!.querySelector<HTMLElement>('[part="container"]')!
              const activeWrapper = element.shadowRoot!.querySelector<HTMLElement>(
                inputName === 'pointer' ? '[part="placeholder"]' : '.list-item[data-assignment-id]',
              )!
              const targetElement =
                targetName === 'host' ? (element as HTMLElement) : targetName === 'container' ? container : targetName === 'item' ? activeItem : activeWrapper
              if (stateName === 'hidden') targetElement.style.visibility = 'hidden'
              else {
                targetElement.style.width = '0px'
                targetElement.style.height = '0px'
                targetElement.style.padding = '0px'
                targetElement.style.border = '0px'
                targetElement.style.overflow = 'hidden'
              }
            },
            [target, state, input],
          )
          await expect
            .poll(() =>
              host.evaluate((element) => ({
                status: element.shadowRoot!.querySelector('[role="status"]')?.textContent ?? '',
                placeholders: element.shadowRoot!.querySelectorAll('[part="placeholder"]').length,
              })),
            )
            .toEqual({
              status: 'Reordering canceled because the item or list is not visible.',
              placeholders: 0,
            })
          await host.evaluate((element) => {
            for (const targetElement of [
              element as HTMLElement,
              element.querySelector<HTMLElement>('#first')!,
              element.shadowRoot!.querySelector<HTMLElement>('[part="container"]')!,
              element.shadowRoot!.querySelector<HTMLElement>('.list-item[data-assignment-id]')!,
            ]) {
              targetElement.removeAttribute('style')
            }
          })
          if (input === 'pointer') await page.mouse.up()
          await expectCleanPointerState(host)
          expect(await visualIds(host)).toEqual(['first', 'second', 'third'])
          await expect(host).toHaveAttribute('data-successes', '0')
        })
      }
    }
  }
})

test('stops active auto-scroll when invalid visibility cancels a pointer session', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div id="visibility-scroller" style="height:150px;overflow-y:auto">
      <c2-reorder-list editable aria-label="Tasks">
        ${Array.from({ length: 8 }, (_, index) => `<div id="visibility-${index}" style="height:54px">Row ${index}</div>`).join('')}
      </c2-reorder-list>
    </div>
  `)
  const host = page.locator('c2-reorder-list')
  const scroller = page.locator('#visibility-scroller')
  await host.evaluate((element) => {
    element.dataset.successes = '0'
    element.addEventListener('reorder', () => (element.dataset.successes = String(Number(element.dataset.successes) + 1)))
  })
  await installLifecycleProbe(page, host)
  try {
    await startPointerDrag(page, '#visibility-0')
    const box = await scroller.boundingBox()
    if (!box) throw new Error('Missing visibility scroll geometry')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 1)
    await expect.poll(() => lifecycleProbeSnapshot(page)).toMatchObject({ captured: 1, documentKeydownListeners: 1, pendingFrames: 1 })
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

    await page.locator('#visibility-0').evaluate((element) => (element.style.visibility = 'hidden'))
    await expect
      .poll(() => lifecycleProbeSnapshot(page))
      .toMatchObject({
        captured: 0,
        documentKeydownListeners: 0,
        pendingFrames: 0,
        scrollListeners: 0,
      })
    const settledScrollTop = await scroller.evaluate((element) => element.scrollTop)
    await page.waitForTimeout(100)
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(settledScrollTop)

    await page.locator('#visibility-0').evaluate((element) => element.style.removeProperty('visibility'))
    await page.mouse.up()
    await expectCleanPointerState(host)
    expect(await visualIds(host)).toEqual(Array.from({ length: 8 }, (_, index) => `visibility-${index}`))
    await expect(host).toHaveAttribute('data-successes', '0')
  } finally {
    await restoreLifecycleProbe(page)
  }
})

test('cleans up outside release, pointercancel, and unexpected lost capture', async ({ page, renderScenario }) => {
  const hostMarkup = `<c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list>`

  await renderScenario(hostMarkup)
  let host = page.locator('c2-reorder-list')
  await startPointerDrag(page)
  await page.mouse.move(0, 0)
  await page.mouse.up()
  await expectCleanPointerState(host)

  await renderScenario(hostMarkup)
  host = page.locator('c2-reorder-list')
  await startSyntheticPointerDrag(host, 42)
  await host.locator('[part="container"]').dispatchEvent('pointercancel', { pointerId: 42, pointerType: 'mouse', isPrimary: true })
  await expectCleanPointerState(host, 42)

  await renderScenario(hostMarkup)
  host = page.locator('c2-reorder-list')
  await startSyntheticPointerDrag(host, 43)
  await host.locator('[part="container"]').dispatchEvent('lostpointercapture', { pointerId: 43, pointerType: 'mouse', isPrimary: true })
  await expectCleanPointerState(host, 43)
})

test('releases observable resources on every pointer cancellation path', async ({ page, renderScenario }) => {
  const cancellationCases = ['outside release', 'pointercancel', 'lost capture', 'active item removal', 'empty list', 'disconnect'] as const

  for (const cancellation of cancellationCases) {
    await test.step(cancellation, async () => {
      await renderScenario(`
        <div id="lifecycle-scroller" style="height:150px;overflow-y:auto">
          <c2-reorder-list editable aria-label="Tasks">
            ${Array.from({ length: 8 }, (_, index) => `<div id="lifecycle-${index}" style="height:54px">Row ${index}</div>`).join('')}
          </c2-reorder-list>
        </div>
      `)
      const host = page.locator('c2-reorder-list')
      await installLifecycleProbe(page, host)
      try {
        await startPointerDrag(page, '#lifecycle-0')
        const scroller = page.locator('#lifecycle-scroller')
        const box = await scroller.boundingBox()
        if (!box) throw new Error('Missing lifecycle scroll geometry')
        await page.mouse.move(box.x + box.width / 2, box.y + box.height - 1)
        await expect
          .poll(() => lifecycleProbeSnapshot(page))
          .toMatchObject({
            captured: 1,
            documentKeydownListeners: 1,
            pendingFrames: 1,
            scrollListeners: 0,
          })
        const pointerId = (await lifecycleProbeSnapshot(page)).capturedIds[0]
        if (pointerId === undefined) throw new Error('Missing captured pointer id')

        if (cancellation === 'outside release') {
          await page.mouse.move(0, 0)
          await page.mouse.up()
        } else if (cancellation === 'pointercancel') {
          await host.locator('[part="container"]').dispatchEvent('pointercancel', { pointerId, pointerType: 'mouse', isPrimary: true })
          await page.mouse.up()
        } else if (cancellation === 'lost capture') {
          await host.locator('[part="container"]').dispatchEvent('lostpointercapture', { pointerId, pointerType: 'mouse', isPrimary: true })
          await page.mouse.up()
        } else if (cancellation === 'active item removal') {
          await page.locator('#lifecycle-0').evaluate((element) => element.remove())
          await page.mouse.up()
        } else if (cancellation === 'empty list') {
          await host.evaluate((element) => {
            for (const child of [...element.children]) if (!['placeholder', 'dragging-item'].includes((child as HTMLElement).slot)) child.remove()
          })
          await page.mouse.up()
        } else {
          await host.evaluate((element) => element.remove())
          await page.mouse.up()
        }

        await expect
          .poll(() => lifecycleProbeSnapshot(page))
          .toMatchObject({
            captured: 0,
            documentKeydownListeners: 0,
            pendingFrames: 0,
            scrollListeners: 0,
          })
      } finally {
        await restoreLifecycleProbe(page)
      }
    })
  }
})

test('cancels on active-item removal, emptying, and disconnect with surviving content intact', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="mount"><c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list></div>`)
  let host = page.locator('c2-reorder-list')
  await startPointerDrag(page)
  await page.locator('#first').evaluate((element) => element.remove())
  await expectCleanPointerState(host)
  expect(await visualIds(host)).toEqual(['second', 'third'])
  await page.mouse.up()

  await startPointerDrag(page, '#second')
  await host.evaluate((element) => {
    for (const child of [...element.children]) if (!['placeholder', 'dragging-item'].includes((child as HTMLElement).slot)) child.remove()
  })
  await expectCleanPointerState(host)
  expect(await visualIds(host)).toEqual([])
  await page.mouse.up()

  await renderScenario(`<div id="mount"><c2-reorder-list editable aria-label="Tasks">${rows}</c2-reorder-list></div>`)
  await startPointerDrag(page)
  await page.evaluate(() => {
    const component = document.querySelector('c2-reorder-list')!
    ;(window as Window & { detachedReorderList?: Element }).detachedReorderList = component
    component.remove()
  })
  await page.evaluate(() => document.querySelector('#mount')!.append((window as Window & { detachedReorderList?: Element }).detachedReorderList!))
  host = page.locator('c2-reorder-list')
  await expectCleanPointerState(host)
  expect(await visualIds(host)).toEqual(['first', 'second', 'third'])
  await page.mouse.up()
})

test('tracks destinations through page and ancestor scroll, transforms, RTL, and live height changes', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div style="height:320px"></div>
    <div id="scroller" dir="rtl" style="height:210px;overflow-y:auto;transform:translateX(18px);margin:24px">
      <c2-reorder-list editable aria-label="Tasks">
        <div id="geo-0" style="height:52px">Zero</div>
        <div id="geo-1" style="height:74px">One</div>
        <div id="geo-2" style="height:46px">Two</div>
        <div id="geo-3" style="height:82px">Three</div>
        <div id="geo-4" style="height:58px">Four</div>
      </c2-reorder-list>
    </div>
    <div style="height:400px"></div>
  `)
  await page.evaluate(() => {
    window.scrollTo(0, 240)
    document.querySelector<HTMLElement>('#scroller')!.scrollTop = 24
  })
  await startPointerDrag(page, '#geo-0')
  await page.locator('#geo-2').evaluate((element) => (element.style.height = '96px'))
  const destination = await page.locator('#geo-3').boundingBox()
  if (!destination) throw new Error('Missing transformed destination geometry')
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height - 4, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => visualIds(page.locator('c2-reorder-list'))).toEqual(['geo-1', 'geo-2', 'geo-3', 'geo-0', 'geo-4'])
})

test('stops auto-scroll at a boundary and leaves no work after cancellation', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div id="scroller" style="height:150px;overflow-y:auto">
      <c2-reorder-list editable aria-label="Tasks">
        ${Array.from({ length: 8 }, (_, index) => `<div id="boundary-${index}" style="height:54px">Row ${index}</div>`).join('')}
      </c2-reorder-list>
    </div>
  `)
  const scroller = page.locator('#scroller')
  await scroller.evaluate((element) => (element.scrollTop = element.scrollHeight))
  const maximum = await scroller.evaluate((element) => element.scrollHeight - element.clientHeight)
  await startPointerDrag(page, '#boundary-7')
  const box = await scroller.boundingBox()
  if (!box) throw new Error('Missing boundary geometry')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 1)
  await page.waitForTimeout(100)
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(maximum)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  const settled = await scroller.evaluate((element) => element.scrollTop)
  await page.waitForTimeout(100)
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(settled)
  await expectCleanPointerState(page.locator('c2-reorder-list'))
})

test('coalesces 100-item destination renders and keeps one auto-scroll frame pending', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div id="performance-scroller" style="height:220px;overflow-y:auto">
      <c2-reorder-list editable autoscrolldisabled aria-label="One hundred tasks">
        ${Array.from({ length: 100 }, (_, index) => `<div id="performance-${index}" style="height:32px">Row ${index}</div>`).join('')}
      </c2-reorder-list>
    </div>
  `)
  const result = await page.locator('c2-reorder-list').evaluate(async (element) => {
    const host = element as HTMLElement & {
      autoScrollDisabled: boolean
      requestUpdate(): void
      updateComplete: Promise<boolean>
      updated(changedProperties: unknown): void
    }
    const container = host.shadowRoot!.querySelector<HTMLElement>('.c2-reorder-list-container')!
    const wrappers = host.shadowRoot!.querySelectorAll<HTMLElement>('.list-item[data-assignment-id]')
    Object.defineProperties(container, {
      setPointerCapture: { configurable: true, value: () => undefined },
      hasPointerCapture: { configurable: true, value: () => false },
    })
    const originalDocumentAdd = document.addEventListener.bind(document)
    const originalDocumentRemove = document.removeEventListener.bind(document)
    let documentKeydownListeners = 0
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
      if (type === 'keydown') documentKeydownListeners++
      originalDocumentAdd(type, listener, options)
    }) as typeof document.addEventListener
    document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
      if (type === 'keydown') documentKeydownListeners--
      originalDocumentRemove(type, listener, options)
    }) as typeof document.removeEventListener
    const emit = (target: Element, name: string, x: number, y: number) =>
      target.dispatchEvent(
        new PointerEvent(name, { bubbles: true, composed: true, pointerId: 77, pointerType: 'mouse', isPrimary: true, button: 0, clientX: x, clientY: y }),
      )
    const source = wrappers[0].getBoundingClientRect()
    emit(wrappers[0], 'pointerdown', source.left + 4, source.top + 4)
    emit(container, 'pointermove', source.left + 24, source.top + 24)
    await host.updateComplete

    const originalUpdated = host.updated.bind(host)
    let renders = 0
    host.updated = (changedProperties: unknown) => {
      renders++
      originalUpdated(changedProperties)
    }
    const destination = wrappers[50].getBoundingClientRect()
    for (let index = 0; index < 12; index++) emit(container, 'pointermove', destination.left + 4, destination.top + destination.height / 2)
    await host.updateComplete
    const destinationRenders = renders

    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    const originalCancelFrame = window.cancelAnimationFrame.bind(window)
    const pending = new Set<number>()
    let maximumPendingFrames = 0
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      let frame = 0
      frame = originalRequestFrame((time) => {
        pending.delete(frame)
        callback(time)
      })
      pending.add(frame)
      maximumPendingFrames = Math.max(maximumPendingFrames, pending.size)
      return frame
    }
    window.cancelAnimationFrame = (frame: number) => {
      pending.delete(frame)
      originalCancelFrame(frame)
    }
    host.autoScrollDisabled = false
    const scrollRect = document.querySelector<HTMLElement>('#performance-scroller')!.getBoundingClientRect()
    for (let index = 0; index < 6; index++) emit(container, 'pointermove', scrollRect.left + 8, scrollRect.bottom - 1)
    await new Promise((resolve) => setTimeout(resolve, 100))
    emit(container, 'pointercancel', scrollRect.left + 8, scrollRect.bottom - 1)
    const pendingFramesAfterCancel = pending.size
    window.requestAnimationFrame = originalRequestFrame
    window.cancelAnimationFrame = originalCancelFrame
    document.addEventListener = originalDocumentAdd
    document.removeEventListener = originalDocumentRemove
    return { destinationRenders, maximumPendingFrames, pendingFramesAfterCancel, documentKeydownListeners }
  })
  expect(result.destinationRenders).toBe(1)
  expect(result.maximumPendingFrames).toBeLessThanOrEqual(1)
  expect(result.pendingFramesAfterCancel).toBe(0)
  expect(result.documentKeydownListeners).toBe(0)
  await expectCleanPointerState(page.locator('c2-reorder-list'))
})
