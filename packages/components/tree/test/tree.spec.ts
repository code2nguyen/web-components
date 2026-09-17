import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const files = `
  <c2-tree-item value="src" label="src">
    <c2-tree-item value="app" label="app.ts"></c2-tree-item>
    <c2-tree-item value="main" label="main.ts"></c2-tree-item>
  </c2-tree-item>
  <c2-tree-item value="readme" label="README.md"></c2-tree-item>
`

const tree = (attributes = '') => `<c2-tree aria-label="Files" ${attributes}>${files}</c2-tree>`

// A row's own box, not its host: the host of an expanded branch also encloses its children, so clicking its
// centre would land on a descendant. `.first()` picks the row's own shadow content, which precedes its
// slotted children in document order.
const rowOf = (page: Page, value: string) => page.locator(`c2-tree-item[value="${value}"]`).locator('.row').first()
const toggleOf = (page: Page, value: string) => page.locator(`c2-tree-item[value="${value}"]`).locator('.toggle').first()
const checkboxOf = (page: Page, value: string) => page.locator(`c2-tree-item[value="${value}"]`).locator('c2-checkbox').first()

test('the toggle expands a branch, reveals its children and reports the change', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  const host = page.locator('c2-tree')
  await watch(host, 'expansion-change')

  // A collapsed branch must keep its children out of the accessibility tree entirely, not merely hide them.
  await expect(page.getByRole('treeitem', { name: 'app.ts' })).toHaveCount(0)
  await expect(page.getByRole('treeitem', { name: 'src' })).toHaveAttribute('aria-expanded', 'false')

  await toggleOf(page, 'src').click()

  await expect(page.getByRole('treeitem', { name: 'app.ts' })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: 'src' })).toHaveAttribute('aria-expanded', 'true')
  await expect(host).toHaveJSProperty('expandedItems', ['src'])
  await expect(host).toHaveAttribute(
    'data-events',
    '[{"expandedItems":["src"],"node":{"value":"src","label":"src","disabled":false,"hasChildren":true},"expanded":true}]',
  )
  await accessible(page)

  await toggleOf(page, 'src').click()
  await expect(page.getByRole('treeitem', { name: 'app.ts' })).toHaveCount(0)
  await expect(host).toHaveJSProperty('expandedItems', [])
})

test('arrow keys walk only the visible rows and move in and out of a branch', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  const src = page.getByRole('treeitem', { name: 'src' })
  await src.focus()

  // Collapsed, so Down skips the hidden children and lands on the next root.
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('treeitem', { name: 'README.md' })).toBeFocused()

  await page.keyboard.press('ArrowUp')
  await expect(src).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect(src).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('treeitem', { name: 'app.ts' })).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('treeitem', { name: 'main.ts' })).toBeFocused()

  await page.keyboard.press('ArrowLeft')
  await expect(src).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(src).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('End')
  await expect(page.getByRole('treeitem', { name: 'README.md' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(src).toBeFocused()
})

test('typeahead jumps to a row and Enter selects it', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await page.getByRole('treeitem', { name: 'src' }).focus()
  await page.keyboard.press('r')
  await expect(page.getByRole('treeitem', { name: 'README.md' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-tree')).toHaveJSProperty('value', ['readme'])
})

test('single selection replaces, and selection-change stays off the ancestors', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="wrapper">${tree()}</div>`)
  const host = page.locator('c2-tree')
  await watch(host, 'selection-change')
  await watch(page.locator('#wrapper'), 'selection-change')

  await rowOf(page, 'src').click()
  await expect(host).toHaveJSProperty('value', ['src'])
  await expect(page.getByRole('treeitem', { name: 'src' })).toHaveAttribute('aria-selected', 'true')

  await rowOf(page, 'readme').click()
  await expect(host).toHaveJSProperty('value', ['readme'])

  await expect(host).toHaveAttribute(
    'data-events',
    '[{"value":["src"],"nodes":[{"value":"src","label":"src","disabled":false,"hasChildren":true}]},{"value":["readme"],"nodes":[{"value":"readme","label":"README.md","disabled":false,"hasChildren":false}]}]',
  )
  // `selection-change` must not bubble: a tree nested in another selectable component would otherwise be read
  // as that component's own selection.
  await expect(page.locator('#wrapper')).toHaveAttribute('data-events', '[]')
})

test('multiple selection extends with shift and toggles with the meta key', async ({ page, renderScenario }) => {
  await renderScenario(tree('selection="multiple" expanded-items="src"'))
  const host = page.locator('c2-tree')

  await rowOf(page, 'src').click()
  await rowOf(page, 'main').click({ modifiers: ['Shift'] })
  await expect(host).toHaveJSProperty('value', ['src', 'app', 'main'])

  await rowOf(page, 'app').click({ modifiers: ['ControlOrMeta'] })
  await expect(host).toHaveJSProperty('value', ['src', 'main'])
  await accessible(page)
})

test('a checkbox carries its tick to descendants and leaves the parent indeterminate', async ({ page, renderScenario }) => {
  await renderScenario(tree('checkbox-selection expanded-items="src"'))
  const host = page.locator('c2-tree')

  await checkboxOf(page, 'src').click()
  await expect(host).toHaveJSProperty('value', ['src', 'app', 'main'])
  await expect(page.getByRole('treeitem', { name: 'src' })).not.toHaveAttribute('indeterminate', '')

  // Clearing one child leaves the branch partially selected.
  await checkboxOf(page, 'app').click()
  await expect(host).toHaveJSProperty('value', ['main'])
  await expect(page.getByRole('treeitem', { name: 'src' })).toHaveAttribute('indeterminate', '')

  // And re-ticking the last child restores the parent.
  await checkboxOf(page, 'app').click()
  await expect(host).toHaveJSProperty('value', ['src', 'app', 'main'])
  await accessible(page)
})

test('propagation skips a disabled descendant and still settles the parent', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree aria-label="Files" checkbox-selection expanded-items="src">
      <c2-tree-item value="src" label="src">
        <c2-tree-item value="app" label="app.ts"></c2-tree-item>
        <c2-tree-item value="lock" label="lock.ts" disabled></c2-tree-item>
      </c2-tree-item>
    </c2-tree>
  `)
  const host = page.locator('c2-tree')

  await checkboxOf(page, 'src').click()
  // The disabled row is never added: it could not be clicked back out again.
  await expect(host).toHaveJSProperty('value', ['src', 'app'])
  // And it is left out of the tally, so the branch reads as fully selected rather than stuck half-ticked.
  await expect(page.getByRole('treeitem', { name: 'src' })).not.toHaveAttribute('indeterminate', '')
})

test('a lazy branch shows a spinner, then renders whatever the loader resolved', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tree aria-label="Files"></c2-tree>')
  const host = page.locator('c2-tree')

  await host.evaluate(async (element) => {
    const el = element as HTMLElement & { items: unknown; loadChildren: unknown; updateComplete: Promise<boolean> }
    el.items = [{ value: 'src', label: 'src', hasChildren: true }]
    el.loadChildren = () =>
      new Promise((resolve) => {
        ;(window as unknown as { resolveChildren: (nodes: unknown) => void }).resolveChildren = resolve
      })
    await el.updateComplete
  })

  await toggleOf(page, 'src').click()
  await expect(page.getByRole('treeitem', { name: 'src' }).locator('c2-spinner')).toBeVisible()

  await page.evaluate(() => {
    ;(window as unknown as { resolveChildren: (nodes: unknown) => void }).resolveChildren([{ value: 'app', label: 'app.ts' }])
  })

  await expect(page.getByRole('treeitem', { name: 'app.ts' })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: 'src' }).locator('c2-spinner')).toHaveCount(0)
  await expect(host).toHaveJSProperty('expandedItems', ['src'])
})

test('a rejected load surfaces the error and leaves the branch retryable', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tree aria-label="Files"></c2-tree>')
  const host = page.locator('c2-tree')
  await watch(host, 'item-load-error')

  await host.evaluate(async (element) => {
    const el = element as HTMLElement & { items: unknown; loadChildren: unknown; updateComplete: Promise<boolean> }
    el.items = [{ value: 'src', label: 'src', hasChildren: true }]
    el.loadChildren = () => Promise.reject(new Error('offline'))
    await el.updateComplete
  })

  await toggleOf(page, 'src').click()
  await expect(host).toHaveAttribute('data-events', '[{"node":{"value":"src","label":"src","disabled":false,"hasChildren":true},"error":{}}]')
  await expect(page.getByRole('treeitem', { name: 'src' }).locator('c2-spinner')).toHaveCount(0)
})

test('the data-driven mode builds the same tree as the markup', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tree aria-label="Files" expanded-items="src"></c2-tree>')
  const host = page.locator('c2-tree')
  await props(host, {
    items: [
      {
        value: 'src',
        label: 'src',
        children: [
          { value: 'app', label: 'app.ts' },
          { value: 'main', label: 'main.ts' },
        ],
      },
      { value: 'readme', label: 'README.md' },
    ],
  })

  await expect(page.getByRole('treeitem')).toHaveCount(4)
  await expect(page.getByRole('treeitem', { name: 'app.ts' })).toHaveAttribute('aria-level', '2')
  await expect(page.getByRole('treeitem', { name: 'src' })).toHaveAttribute('aria-expanded', 'true')

  await rowOf(page, 'main').click()
  await expect(host).toHaveJSProperty('value', ['main'])
  await accessible(page)
})

test('the tree is a single tab stop and remembers the focused row', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button id="before">before</button>${tree()}<button id="after">after</button>`)
  await page.locator('#before').focus()

  await tab()
  await expect(page.getByRole('treeitem', { name: 'src' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('treeitem', { name: 'README.md' })).toBeFocused()

  // The roving tabindex means the whole tree is one stop, not one per row.
  await tab()
  await expect(page.locator('#after')).toBeFocused()

  await tab(true)
  await expect(page.getByRole('treeitem', { name: 'README.md' })).toBeFocused()
})

test('a disabled row cannot be selected or expanded', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree aria-label="Files">
      <c2-tree-item value="src" label="src" disabled>
        <c2-tree-item value="app" label="app.ts"></c2-tree-item>
      </c2-tree-item>
      <c2-tree-item value="readme" label="README.md"></c2-tree-item>
    </c2-tree>
  `)
  const host = page.locator('c2-tree')

  // Playwright refuses an ordinary click on an aria-disabled target, so drive a real pointer at it instead.
  await pointerClick(rowOf(page, 'src'))
  await expect(host).toHaveJSProperty('value', [])
  await pointerClick(toggleOf(page, 'src'))
  await expect(host).toHaveJSProperty('expandedItems', [])

  // And keyboard traversal skips it altogether.
  await page.getByRole('treeitem', { name: 'README.md' }).focus()
  await page.keyboard.press('Home')
  await expect(page.getByRole('treeitem', { name: 'README.md' })).toBeFocused()
})

test('expandAll and collapseAll reach every branch in both modes', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  const host = page.locator('c2-tree')

  await host.evaluate((el) => (el as HTMLElement & { expandAll(): void }).expandAll())
  await expect(host).toHaveJSProperty('expandedItems', ['src'])
  await expect(page.getByRole('treeitem', { name: 'app.ts' })).toBeVisible()

  await host.evaluate((el) => (el as HTMLElement & { collapseAll(): void }).collapseAll())
  await expect(page.getByRole('treeitem', { name: 'app.ts' })).toHaveCount(0)

  // The data-driven mode has to reach collapsed branches too, whose rows are not rendered yet.
  await renderScenario('<c2-tree aria-label="Regions"></c2-tree>')
  const data = page.locator('c2-tree')
  await props(data, {
    items: [{ value: 'emea', label: 'EMEA', children: [{ value: 'fr', label: 'France', children: [{ value: 'paris', label: 'Paris' }] }] }],
  })
  await data.evaluate((el) => (el as HTMLElement & { expandAll(): void }).expandAll())
  await expect(data).toHaveJSProperty('expandedItems', ['emea', 'fr'])
  await expect(page.getByRole('treeitem', { name: 'Paris' })).toBeVisible()
})

test('indent guides line up under each ancestor toggle, clear of the row corner', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree aria-label="Files" children-outline expanded-items="src;components"
      style="--c2-tree-item__row--indent:12px;--c2-tree-item__row--padding-inline-start:8px;--c2-tree-item__toggle--size:14px">
      <c2-tree-item value="src" label="src">
        <c2-tree-item value="components" label="components">
          <c2-tree-item value="button" label="button.ts"></c2-tree-item>
        </c2-tree-item>
      </c2-tree-item>
    </c2-tree>`)

  const guide = (value: string) =>
    page
      .locator(`c2-tree-item[value="${value}"]`)
      .first()
      .evaluate((item) => {
        const row = item.shadowRoot!.querySelector('.row') as HTMLElement
        const before = getComputedStyle(row, '::before')
        return { start: before.insetInlineStart, width: before.width }
      })

  // The rules start at the first ancestor's toggle centre (padding 8 + half of the 14px toggle) and repeat once
  // per level. A box starting at 0 with an offset gradient instead drew a rule at `offset - indent`, which landed
  // on the row's own rounded corner.
  expect(await guide('src')).toEqual({ start: '15px', width: '0px' })
  expect(await guide('components')).toEqual({ start: '15px', width: '12px' })
  expect(await guide('button')).toEqual({ start: '15px', width: '24px' })
})

test('indent guides are off until children-outline is set', async ({ page, renderScenario }) => {
  await renderScenario(tree('expanded-items="src"'))
  const host = page.locator('c2-tree')
  const guideContent = () =>
    page
      .locator('c2-tree-item[value="app"]')
      .first()
      .evaluate((item) => getComputedStyle((item as HTMLElement).shadowRoot!.querySelector('.row')!, '::before').content)

  await expect(host).toHaveJSProperty('childrenOutline', false)
  expect(await guideContent()).toBe('none')

  await props(host, { childrenOutline: true })
  // The tree pushes the flag onto every row, since the rules are drawn by the row's own stylesheet.
  await expect(page.locator('c2-tree-item[value="app"]')).toHaveAttribute('children-outline', '')
  expect(await guideContent()).not.toBe('none')
})

test('an empty or malformed items attribute renders instead of throwing', async ({ page, renderScenario }) => {
  // `jsonPropertyConverter` resolves both of these to `undefined`, which used to reach `render()` as `.length`.
  await renderScenario('<c2-tree aria-label="Empty" items=""></c2-tree><c2-tree aria-label="Broken" items="{nope"></c2-tree>')
  await expect(page.locator('c2-tree').first()).toHaveJSProperty('items', [])
  await expect(page.locator('c2-tree').nth(1)).toHaveJSProperty('items', [])
  await expect(page.getByRole('tree')).toHaveCount(2)

  // And it recovers when real data arrives.
  await props(page.locator('c2-tree').first(), { items: [{ value: 'a', label: 'Alpha' }] })
  await expect(page.getByRole('treeitem', { name: 'Alpha' })).toBeVisible()
})

test('renderItem takes over the row content and outranks the per-part renderers', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tree aria-label="Regions" expanded-items="emea"></c2-tree>')
  const host = page.locator('c2-tree')

  await host.evaluate(async (element) => {
    const el = element as HTMLElement & { items: unknown; renderItem: unknown; renderLabel: unknown; updateComplete: Promise<boolean> }
    el.items = [{ value: 'emea', label: 'EMEA', data: { count: 2 }, children: [{ value: 'fr', label: 'France', data: { count: 7 } }] }]
    // A renderer is handed to Lit, so it returns a DOM node rather than framework markup.
    el.renderLabel = () => 'should be ignored'
    el.renderItem = ({ node }: { node: { label?: string; data?: { count: number } } }) => {
      const span = document.createElement('span')
      span.textContent = `${node.label} (${node.data?.count})`
      return span
    }
    await el.updateComplete
  })

  await expect(page.getByRole('treeitem', { name: 'EMEA (2)' })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: 'France (7)' })).toBeVisible()
  await expect(page.getByText('should be ignored')).toHaveCount(0)

  // The toggle and selection still work, since renderItem only owns the content.
  await page.getByRole('treeitem', { name: 'France (7)' }).locator('.row').first().click()
  await expect(host).toHaveJSProperty('value', ['fr'])
})

test('a linked row renders a real anchor and opening its branch does not navigate', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree aria-label="Docs">
      <c2-tree-item value="guides" label="Guides" href="#guides">
        <c2-tree-item value="theming" label="Theming" href="#theming"></c2-tree-item>
      </c2-tree-item>
      <c2-tree-item value="spec" label="Spec" href="https://example.com" target="_blank"></c2-tree-item>
    </c2-tree>`)

  // Real anchors, so middle-click, ⌘-click and "copy link address" all work.
  const anchor = page.locator('c2-tree-item[value="guides"]').first().locator('a').first()
  await expect(anchor).toHaveAttribute('href', '#guides')
  // The tree keeps the roving tabindex on the host, so the inner anchor must not be its own tab stop.
  await expect(anchor).toHaveAttribute('tabindex', '-1')
  await expect(page.locator('c2-tree-item[value="spec"]').locator('a').first()).toHaveAttribute('rel', 'noopener noreferrer')

  // Expanding a linked branch must not follow its link.
  await toggleOf(page, 'guides').click()
  await expect(page.locator('c2-tree')).toHaveJSProperty('expandedItems', ['guides'])
  expect(new URL(page.url()).hash).toBe('')

  // Clicking the row itself does navigate.
  await rowOf(page, 'theming').click()
  await expect.poll(() => new URL(page.url()).hash).toBe('#theming')
})

test('Enter follows a linked row instead of selecting it', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree aria-label="Docs">
      <c2-tree-item value="theming" label="Theming" href="#theming"></c2-tree-item>
      <c2-tree-item value="plain" label="Plain"></c2-tree-item>
    </c2-tree>`)
  const host = page.locator('c2-tree')

  await page.getByRole('treeitem', { name: 'Theming' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => new URL(page.url()).hash).toBe('#theming')
  // The row navigates and selects, the same as clicking it — `c2-list` treats a linked row this way too, and a
  // nav tree's selected row is the page you just moved to.
  await expect(host).toHaveJSProperty('value', ['theming'])

  // A row without href still selects.
  await page.getByRole('treeitem', { name: 'Plain' }).focus()
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', ['plain'])
})

test('row padding grows the row once it passes the min-height floor', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tree aria-label="Files"><c2-tree-item value="a" label="Alpha"></c2-tree-item></c2-tree>')
  const row = page.locator('c2-tree-item[value="a"]').first().locator('.row').first()
  const height = () => row.evaluate((el) => Math.round(el.getBoundingClientRect().height))

  expect(await height()).toBe(28)

  // Under the 28px floor the row cannot shrink or grow, which is what makes small padding values look inert.
  await props(page.locator('c2-tree'), {})
  await page.locator('c2-tree').evaluate((el) => (el as HTMLElement).style.setProperty('--c2-tree-item__row--padding-top', '2px'))
  expect(await height()).toBe(28)

  await page.locator('c2-tree').evaluate((el) => {
    const host = el as HTMLElement
    host.style.setProperty('--c2-tree-item__row--padding-top', '10px')
    host.style.setProperty('--c2-tree-item__row--padding-bottom', '10px')
  })
  expect(await height()).toBe(40)
})

test('a hidden row drops out of the keyboard order', async ({ page, renderScenario }) => {
  await renderScenario(tree('expanded-items="src"'))

  // What a filter does: hide the rows that do not match, leaving the rest navigable.
  await page
    .locator('c2-tree-item[value="app"]')
    .first()
    .evaluate((el) => ((el as HTMLElement).hidden = true))
  await page.getByRole('treeitem', { name: 'src' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('treeitem', { name: 'main.ts' })).toBeFocused()

  // Hiding a branch takes its children with it.
  await page
    .locator('c2-tree-item[value="src"]')
    .first()
    .evaluate((el) => ((el as HTMLElement).hidden = true))
  await page.getByRole('treeitem', { name: 'README.md' }).focus()
  await page.keyboard.press('Home')
  await expect(page.getByRole('treeitem', { name: 'README.md' })).toBeFocused()
})

test('expand-on-click toggles a branch from the whole row, by pointer and by keyboard', async ({ page, renderScenario }) => {
  // The docs sidebar's shape: headings with nothing to select, page rows whose link is slotted into the label.
  await renderScenario(`
    <c2-tree aria-label="Documentation" selection="none" expand-on-click>
      <c2-tree-item value="Guides">
        <span slot="label">Guides</span>
        <c2-tree-item value="theming"><a slot="label" href="#theming">Theming</a></c2-tree-item>
      </c2-tree-item>
    </c2-tree>`)
  const host = page.locator('c2-tree')
  const group = page.getByRole('treeitem', { name: 'Guides' })

  // The row's centre is past the toggle, so this is the click that used to do nothing.
  await rowOf(page, 'Guides').click()
  await expect(group).toHaveAttribute('aria-expanded', 'true')
  await expect(host).toHaveJSProperty('expandedItems', ['Guides'])

  await rowOf(page, 'Guides').click()
  await expect(host).toHaveJSProperty('expandedItems', [])

  // Enter and Space are the keyboard's click, so they reach the same branch the pointer does.
  await group.focus()
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('expandedItems', ['Guides'])
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('expandedItems', [])
  await page.keyboard.press(' ')
  await expect(host).toHaveJSProperty('expandedItems', ['Guides'])

  // A leaf is not a branch, so its row still just follows its link — expansion is untouched. The anchor is
  // slotted, so it is only as wide as its text here; the docs sidebar gives it `display: block` to fill the row.
  await page.getByRole('link', { name: 'Theming' }).click()
  await expect.poll(() => new URL(page.url()).hash).toBe('#theming')
  await expect(host).toHaveJSProperty('expandedItems', ['Guides'])
})
