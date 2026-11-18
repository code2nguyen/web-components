import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const choices = `
  <div id="speed" data-reorder-key="speed" data-reorder-label="Speed">Speed</div>
  <div id="price" data-reorder-key="price" data-reorder-label="Price">Price</div>
  <div id="support" data-reorder-key="support" data-reorder-label="Support">Support</div>
`

async function ranks(host: Locator): Promise<string[]> {
  return host.locator('[part~="rank"]').allTextContents()
}

/** Ids of the light-DOM rows in the order the list displays them. */
async function displayed(host: Locator): Promise<string[]> {
  return host.evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.list-item[data-assignment-id]')].map(
      (wrapper) => (wrapper.querySelector('slot') as HTMLSlotElement).assignedElements()[0]?.id ?? '',
    ),
  )
}

/** The container's name: the text of the elements it references, else its `aria-label`. */
async function listName(host: Locator): Promise<string> {
  return host.locator('[part="container"]').evaluate((container) => {
    const labels = (container as HTMLElement & { ariaLabelledByElements?: Element[] | null }).ariaLabelledByElements ?? []
    const text = labels
      .map((label) => label.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
      .join(' ')
    return text || container.getAttribute('aria-label') || ''
  })
}

async function submitted(page: Page): Promise<string[]> {
  return page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).getAll('priorities').map(String))
}

/** Picks up the first movable item with the keyboard, moves it to the end and drops it there. */
async function moveFirstToEnd(host: Locator): Promise<void> {
  await host.locator('[part~="item"]').first().focus()
  await host.page().keyboard.press('Space')
  await host.page().keyboard.press('End')
  await host.page().keyboard.press('Space')
}

test('draws no rank and is not a form value until asked', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-reorder-list editable aria-label="Priorities">${choices}</c2-reorder-list></form>`)
  const host = page.locator('c2-reorder-list')
  await expect(host.locator('[part~="item"]')).toHaveCount(3)
  await expect(host.locator('[part~="rank"]')).toHaveCount(0)
  expect(await page.locator('form').evaluate((form) => [...new FormData(form as HTMLFormElement).keys()])).toEqual([])
})

test('ranked shows each row its position, live while it moves', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable ranked aria-label="Priorities">${choices}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  expect(await ranks(host)).toEqual(['1', '2', '3'])
  // The position is already announced through the list semantics, so the badge is not read a second time.
  await expect(host.locator('[part~="rank"]').first()).toHaveAttribute('aria-hidden', 'true')

  await host.locator('[part~="item"]').first().focus()
  await page.keyboard.press('Space')
  await expect(host.locator('.rank--active')).toHaveText('1')
  await page.keyboard.press('ArrowDown')
  await expect(host.locator('.rank--active')).toHaveText('2')
  await page.keyboard.press('Space')
  await expect(host.locator('.rank--active')).toHaveCount(0)
  expect(await ranks(host)).toEqual(['1', '2', '3'])
  expect(await displayed(host)).toEqual(['price', 'speed', 'support'])
})

test('a fixed row keeps its rank and the rank follows a pointer drop', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-reorder-list editable ranked aria-label="Priorities">
      <div id="a" data-reorder-key="a" style="height:48px">A</div>
      <div id="fixed" data-fixed data-reorder-key="fixed" style="height:48px">Fixed</div>
      <div id="b" data-reorder-key="b" style="height:48px">B</div>
    </c2-reorder-list>
  `)
  const host = page.locator('c2-reorder-list')
  const source = await page.locator('#a').boundingBox()
  const target = await page.locator('#b').boundingBox()
  if (!source || !target) throw new Error('Missing drag geometry')
  await page.mouse.move(source.x + 20, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + 30, source.y + source.height / 2 + 12, { steps: 3 })
  await page.mouse.move(target.x + 20, target.y + target.height - 4, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { value: string[] }).value)).toEqual(['b', 'fixed', 'a'])
  expect(await ranks(host)).toEqual(['1', '2', '3'])
  expect(await displayed(host)).toEqual(['b', 'fixed', 'a'])
})

test('renderRank replaces the number and receives its context', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable ranked aria-label="Priorities">${choices}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  await host.evaluate((element) => {
    ;(element as HTMLElement & { renderRank: unknown }).renderRank = ({ rank, count, item }: { rank: number; count: number; item: { key?: string } }) =>
      `${rank}/${count} ${item.key}`
  })
  await expect.poll(() => ranks(host)).toEqual(['1/3 speed', '2/3 price', '3/3 support'])
})

test('submits the keys in the displayed order under its name and fires input once per reorder', async ({ page, renderScenario }) => {
  await renderScenario(`
    <form>
      <c2-reorder-list name="priorities" editable ranked aria-label="Priorities">
        ${choices}
        <div id="unkeyed">Not submitted</div>
      </c2-reorder-list>
    </form>
  `)
  const host = page.locator('c2-reorder-list')
  expect(await submitted(page)).toEqual(['speed', 'price', 'support'])
  await host.evaluate((element) => {
    let inputs = 0
    element.addEventListener('input', () => element.setAttribute('data-inputs', String(++inputs)))
  })

  await moveFirstToEnd(host)
  await expect(host).toHaveAttribute('data-inputs', '1')
  expect(await submitted(page)).toEqual(['price', 'support', 'speed'])
  expect(await host.evaluate((element) => (element as HTMLElement & { value: string[] }).value)).toEqual(['price', 'support', 'speed'])

  // Picking up and dropping in place is no change.
  await host.locator('[part~="item"]').first().focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  await expect(host).toHaveAttribute('data-inputs', '1')
})

test('setting value reorders the movable items and keeps fixed ones in place', async ({ page, renderScenario }) => {
  await renderScenario(`
    <form>
      <c2-reorder-list name="priorities" ranked aria-label="Priorities">
        <div id="a" data-reorder-key="a">A</div>
        <div id="pinned" data-fixed data-reorder-key="pinned">Pinned</div>
        <div id="b" data-reorder-key="b">B</div>
        <div id="c" data-reorder-key="c">C</div>
      </c2-reorder-list>
    </form>
  `)
  const host = page.locator('c2-reorder-list')
  await host.evaluate((element) => {
    let inputs = 0
    element.addEventListener('input', () => element.setAttribute('data-inputs', String(++inputs)))
    ;(element as HTMLElement & { value: string[] }).value = ['c', 'unknown', 'pinned', 'a']
  })
  await expect.poll(() => submitted(page)).toEqual(['c', 'pinned', 'a', 'b'])
  expect(await displayed(host)).toEqual(['c', 'pinned', 'a', 'b'])
  // A programmatic change is not user input.
  await expect(host).not.toHaveAttribute('data-inputs')
  // Nothing moves in the light DOM.
  expect(await host.evaluate((element) => [...element.children].map((child) => child.id))).toEqual(['a', 'pinned', 'b', 'c'])
})

test('a value set before the items exist applies once they arrive', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="mount"></div>`)
  await page.locator('#mount').evaluate((mount) => {
    const list = document.createElement('c2-reorder-list') as HTMLElement & { value: string[] }
    list.setAttribute('aria-label', 'Priorities')
    list.setAttribute('ranked', '')
    list.value = [' support', 'speed']
    // Read back as written while it waits for its rows.
    list.dataset.pending = JSON.stringify(list.value)
    mount.append(list)
    for (const key of ['speed', 'price', 'support']) {
      const item = document.createElement('div')
      item.dataset.reorderKey = key
      item.textContent = key
      list.append(item)
    }
  })
  const host = page.locator('c2-reorder-list')
  await expect(host).toHaveAttribute('data-pending', JSON.stringify([' support', 'speed']))
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { value: string[] }).value)).toEqual(['support', 'speed', 'price'])
})

test('a named list keeps its ranking when rows are added or swiped away, and reports the change', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-reorder-list name="priorities" editable swipeable aria-label="Priorities">${choices}</c2-reorder-list></form>`)
  const host = page.locator('c2-reorder-list')
  await moveFirstToEnd(host)
  expect(await submitted(page)).toEqual(['price', 'support', 'speed'])
  await host.evaluate((element) => {
    let inputs = 0
    element.addEventListener('input', () => element.setAttribute('data-inputs', String(++inputs)))
  })

  // The keyboard path of the built-in Delete on the focused first row (Price).
  await host.locator('[part~="item"]').first().focus()
  await page.keyboard.press('Delete')
  await expect.poll(() => submitted(page)).toEqual(['support', 'speed'])
  await expect(host).toHaveAttribute('data-inputs', '1')

  await host.evaluate((element) => {
    const row = document.createElement('div')
    row.dataset.reorderKey = 'design'
    row.textContent = 'Design'
    element.append(row)
  })
  await expect.poll(() => submitted(page)).toEqual(['support', 'speed', 'design'])

  // A changed key is what the form submits from then on.
  await page.locator('[data-reorder-key="design"]').evaluate((row) => row.setAttribute('data-reorder-key', 'look'))
  await expect.poll(() => submitted(page)).toEqual(['support', 'speed', 'look'])
})

test('an unnamed list keeps the committed order when rows are added or swiped away', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable swipeable aria-label="Priorities">${choices}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  await moveFirstToEnd(host)
  expect(await displayed(host)).toEqual(['price', 'support', 'speed'])

  await page.locator('#support').evaluate((row) => row.remove())
  await expect.poll(() => displayed(host)).toEqual(['price', 'speed'])

  await host.evaluate((element) => {
    const row = document.createElement('div')
    row.id = 'design'
    row.textContent = 'Design'
    element.prepend(row)
  })
  // A new row takes its light-DOM place; the rows that stayed keep the order the user gave them.
  await expect.poll(() => displayed(host)).toEqual(['design', 'price', 'speed'])

  // The built-in Delete, from the keyboard, on the focused row.
  await host.locator('[part~="item"]').nth(1).focus()
  await page.keyboard.press('Delete')
  await expect.poll(() => displayed(host)).toEqual(['design', 'speed'])
})

test('rows the light DOM itself reorders follow the light-DOM order', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable aria-label="Priorities">${choices}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  await moveFirstToEnd(host)
  expect(await displayed(host)).toEqual(['price', 'support', 'speed'])
  // The application reconciled its children (support before speed before price): that order wins.
  await host.evaluate((element) => element.append(element.querySelector('#speed')!, element.querySelector('#price')!))
  await expect.poll(() => displayed(host)).toEqual(['support', 'speed', 'price'])
})

test('the value attribute sets the initial order, and a form reset returns to it', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-reorder-list name="priorities" editable value="support;speed" aria-label="Priorities">${choices}</c2-reorder-list></form>`)
  const host = page.locator('c2-reorder-list')
  await expect.poll(() => displayed(host)).toEqual(['support', 'speed', 'price'])
  expect(await submitted(page)).toEqual(['support', 'speed', 'price'])

  await moveFirstToEnd(host)
  expect(await submitted(page)).toEqual(['speed', 'price', 'support'])
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect.poll(() => submitted(page)).toEqual(['support', 'speed', 'price'])

  // Changing the attribute later reorders like setting the property; a string assigned to the property is parsed the same way.
  await host.evaluate((element) => element.setAttribute('value', 'price'))
  await expect.poll(() => displayed(host)).toEqual(['price', 'support', 'speed'])
  await host.evaluate((element) => ((element as HTMLElement & { value: unknown }).value = 'speed;price'))
  await expect.poll(() => displayed(host)).toEqual(['speed', 'price', 'support'])
})

test('the manifest documents the value attribute, which makes the list a form control for framework bindings', () => {
  type Declaration = { tagName?: string; attributes?: Array<{ name: string; fieldName?: string }> }
  const manifest = JSON.parse(readFileSync(new URL('../custom-elements.json', import.meta.url), 'utf8')) as { modules: Array<{ declarations?: Declaration[] }> }
  const declaration = manifest.modules.flatMap((module) => module.declarations ?? []).find((entry) => entry.tagName === 'c2-reorder-list')
  const attributes = (declaration?.attributes ?? []).map((attribute) => [attribute.name, attribute.fieldName])
  expect(attributes).toContainEqual(['value', 'value'])
  expect(attributes).toContainEqual(['name', 'name'])
})

test('form reset restores the authored order and state restore reapplies a saved one', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-reorder-list name="priorities" editable aria-label="Priorities">${choices}</c2-reorder-list></form>`)
  const host = page.locator('c2-reorder-list')
  await moveFirstToEnd(host)
  expect(await submitted(page)).toEqual(['price', 'support', 'speed'])
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect.poll(() => submitted(page)).toEqual(['speed', 'price', 'support'])

  await host.evaluate((element) =>
    (element as HTMLElement & { formStateRestoreCallback(state: unknown): void }).formStateRestoreCallback(JSON.stringify(['support', 'price', 'speed'])),
  )
  await expect.poll(() => submitted(page)).toEqual(['support', 'price', 'speed'])
  // Something this element did not write is ignored.
  await host.evaluate((element) => (element as HTMLElement & { formStateRestoreCallback(state: unknown): void }).formStateRestoreCallback('not json'))
  expect(await submitted(page)).toEqual(['support', 'price', 'speed'])
})

test('a disabled fieldset stops reordering and is not submitted', async ({ page, renderScenario }) => {
  await renderScenario(`
    <form><fieldset disabled><c2-reorder-list name="priorities" editable ranked aria-label="Priorities">${choices}</c2-reorder-list></fieldset></form>
  `)
  const host = page.locator('c2-reorder-list')
  await expect(host.locator('[part~="item"]').first()).toHaveAttribute('tabindex', '-1')
  await expect(host.locator('.list-item--reorderable')).toHaveCount(0)
  expect(await submitted(page)).toEqual([])

  await page.locator('fieldset').evaluate((fieldset) => fieldset.removeAttribute('disabled'))
  await expect(host.locator('[part~="item"]').first()).toHaveAttribute('tabindex', '0')
  await moveFirstToEnd(host)
  expect(await submitted(page)).toEqual(['price', 'support', 'speed'])
})

test('a disabled fieldset cancels a reorder in progress', async ({ page, renderScenario }) => {
  await renderScenario(`<form><fieldset><c2-reorder-list name="priorities" editable aria-label="Priorities">${choices}</c2-reorder-list></fieldset></form>`)
  const host = page.locator('c2-reorder-list')
  await host.locator('[part~="item"]').first().focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.locator('fieldset').evaluate((fieldset) => fieldset.setAttribute('disabled', ''))
  await expect(host.locator('[role="status"]')).toContainText('Reordering canceled')
  await page.locator('fieldset').evaluate((fieldset) => fieldset.removeAttribute('disabled'))
  expect(await submitted(page)).toEqual(['speed', 'price', 'support'])
})

test('a label for the list names it', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><label for="ranking">Rank these features</label><c2-reorder-list id="ranking" name="priorities" editable ranked>${choices}</c2-reorder-list></form>`,
  )
  const host = page.locator('c2-reorder-list')
  await expect.poll(() => listName(host)).toBe('Rank these features')
  // The label is referenced, not copied, when the browser supports element reflection.
  const referenced = await host
    .locator('[part="container"]')
    .evaluate((container) =>
      'ariaLabelledByElements' in Element.prototype
        ? (container as HTMLElement & { ariaLabelledByElements: Element[] | null }).ariaLabelledByElements?.[0] === document.querySelector('label')
        : true,
    )
  expect(referenced).toBe(true)
})

test('the name follows label edits and naming attributes changed after the first render', async ({ page, renderScenario }) => {
  await renderScenario(`
    <h2 id="title">Release priorities</h2>
    <h3 id="subtitle">Next quarter</h3>
    <c2-reorder-list editable aria-labelledby="title">${choices}</c2-reorder-list>
  `)
  const host = page.locator('c2-reorder-list')
  await expect.poll(() => listName(host)).toBe('Release priorities')

  await page.locator('#title').evaluate((title) => (title.textContent = 'Launch priorities'))
  await expect.poll(() => listName(host)).toBe('Launch priorities')

  await host.evaluate((element) => element.setAttribute('aria-labelledby', 'title subtitle'))
  await expect.poll(() => listName(host)).toBe('Launch priorities Next quarter')

  await host.evaluate((element) => element.setAttribute('aria-label', 'Own name'))
  await expect.poll(() => listName(host)).toBe('Own name')
  await host.evaluate((element) => {
    element.removeAttribute('aria-label')
    element.removeAttribute('aria-labelledby')
  })
  await expect.poll(() => listName(host)).toBe('')
})

test('a label for the list is followed when its text changes', async ({ page, renderScenario }) => {
  await renderScenario(`<label for="ranking">Rank these</label><c2-reorder-list id="ranking" editable>${choices}</c2-reorder-list>`)
  const host = page.locator('c2-reorder-list')
  await expect.poll(() => listName(host)).toBe('Rank these')
  await page.locator('label').evaluate((label) => label.append(' features'))
  await expect.poll(() => listName(host)).toBe('Rank these features')
})

test('has no detectable accessibility violations as a ranked form control', async ({ page, renderScenario }) => {
  await renderScenario(`
    <form>
      <label for="ranking">Rank these features</label>
      <c2-reorder-list id="ranking" name="priorities" editable ranked>${choices}</c2-reorder-list>
    </form>
  `)
  await accessible(page)
})

test('ranks follow the nearest lang through translated messages', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-reorder-list ranked aria-label="Priorités">${choices}</c2-reorder-list></div>`)
  expect(await ranks(page.locator('c2-reorder-list'))).toEqual(['1er', '2e', '3e'])
})
