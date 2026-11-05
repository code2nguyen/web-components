import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const ITEMS = [
  { id: 'projects', name: 'Projects', kind: 'folder', modified: '2026-11-03' },
  { id: 'photos', name: 'Photos', kind: 'folder', modified: '2026-10-01' },
  { id: 'q4', name: 'Q4 planning', parent: 'projects', kind: 'folder', modified: '2026-11-02' },
  { id: 'q3', name: 'Q3 launch', parent: 'projects', kind: 'folder', modified: '2026-09-02' },
  { id: 'assets', name: 'Assets', parent: 'q4', kind: 'folder', modified: '2026-11-03' },
  { id: 'roadmap', name: 'Q4 roadmap.pdf', parent: 'q4', kind: 'file', size: 2_400_000, modified: '2026-11-02', type: 'application/pdf' },
  { id: 'budget', name: 'Budget 2027.xlsx', parent: 'q4', kind: 'file', size: 318_000, modified: '2026-11-01' },
  { id: 'notes', name: 'Kick-off notes.docx', parent: 'q4', kind: 'file', size: 46_000, modified: '2026-10-30' },
  { id: 'mood', name: 'Moodboard.png', parent: 'q4', kind: 'file', size: 5_100_000, modified: '2026-10-29' },
  { id: 'schema', name: 'schema.json', parent: 'q4', kind: 'file', size: 12_000, modified: '2026-10-20' },
  { id: 'readme', name: 'Readme.txt', kind: 'file', size: 900, modified: '2026-08-01' },
]
const ACTIONS = [
  { id: 'download', label: 'Download', multiple: true },
  { id: 'rename', label: 'Rename' },
  { id: 'delete', label: 'Delete', multiple: true, destructive: true },
]
const json = (value: unknown) => JSON.stringify(value).replaceAll("'", '&#39;')
const markup = (attributes = '') =>
  `<c2-file-browser locale="en-US" folder="q4" items='${json(ITEMS)}' actions='${json(ACTIONS)}' ${attributes}></c2-file-browser>`

const browser = (page: Page) => page.locator('c2-file-browser')
const option = (locator: Locator, name: string) => locator.locator('[role="option"]', { hasText: name })
const names = (locator: Locator) => locator.locator('[role="option"] .name').allTextContents()
const selected = (locator: Locator) => locator.locator('[role="option"][aria-selected="true"] .name').allTextContents()
const menuValues = (menu: Locator) => menu.locator('c2-menu-item').evaluateAll((rows) => rows.map((row) => row.getAttribute('value')))
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('the list shows the open folder, folders first, with kind, size and date; the tree and breadcrumbs follow it; it passes axe', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(markup())
  const host = browser(page)
  expect(await names(host)).toEqual(['Assets', 'Budget 2027.xlsx', 'Kick-off notes.docx', 'Moodboard.png', 'Q4 roadmap.pdf', 'schema.json'])
  await expect(option(host, 'Q4 roadmap.pdf')).toHaveAttribute('aria-label', 'Q4 roadmap.pdf, PDF, 2.4 MB, modified Nov 2, 2026')
  await expect(option(host, 'Assets')).toHaveAttribute('aria-label', 'Assets, Folder, modified Nov 3, 2026')
  await expect(option(host, 'Moodboard.png').locator('.kind')).toHaveText('PNG image')
  await expect(option(host, 'schema.json').locator('.kind')).toHaveText('JSON')
  await expect(host.locator('[role="listbox"]')).toHaveAttribute('aria-label', 'Contents of Q4 planning')
  await expect(host.locator('c2-breadcrumb')).toContainText('My files')
  await expect(host.locator('c2-breadcrumb .current')).toHaveText('Q4 planning')
  // The tree opens down to the open folder and selects it.
  await expect(host.locator('c2-tree-item[value="q4"]')).toHaveAttribute('selected', '')
  await expect(host).toHaveHostAria('role', 'region')
  await accessible(page)
})

test('a double-click or Enter opens a folder, a file fires item-open; breadcrumbs, the tree and Backspace go back', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const host = browser(page)
  await watch(host, 'folder-change')
  await option(host, 'Assets').dblclick()
  await expect(host.locator('c2-status-panel')).toHaveAttribute('heading', 'This folder is empty')
  await expect(host.locator('c2-breadcrumb .current')).toHaveText('Assets')
  // Four levels do not fit beside the search field: the middle ones wait behind the ellipsis.
  await host.locator('c2-breadcrumb [part="ellipsis"]').click()
  await host.locator('c2-breadcrumb c2-link-button', { hasText: 'Projects' }).click()
  await expect.poll(() => names(host)).toEqual(['Q3 launch', 'Q4 planning'])
  await option(host, 'Q4 planning').click()
  await page.keyboard.press('Enter')
  await expect.poll(() => names(host)).toContain('Q4 roadmap.pdf')
  // Back in the parent, the folder just left holds the cursor.
  await page.keyboard.press('Backspace')
  await expect(option(host, 'Q4 planning')).toBeFocused()
  await host.locator('c2-tree-item[value="photos"]').click()
  await expect(host.locator('c2-breadcrumb .current')).toHaveText('Photos')
  expect((await events(host)).map((detail: { folder: string }) => detail.folder)).toEqual(['assets', 'projects', 'q4', 'projects', 'photos'])

  await props(host, { folder: 'q4' })
  await watch(host, 'item-open')
  await option(host, 'Budget 2027.xlsx').dblclick()
  await option(host, 'schema.json').click()
  await page.keyboard.press('Enter')
  expect((await events(host)).map((detail: { item: { id: string } }) => detail.item.id)).toEqual(['budget', 'schema'])
})

test('click, Ctrl/Cmd+click, Shift+click, the check box and Ctrl/Cmd+A select; the bar counts them; Escape clears', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const host = browser(page)
  await watch(host, 'selection-change')
  await option(host, 'Budget 2027.xlsx').click()
  await option(host, 'Moodboard.png').click({ modifiers: [mod] })
  expect(await selected(host)).toEqual(['Budget 2027.xlsx', 'Moodboard.png'])
  await expect(host.locator('.selection-bar .count')).toHaveText('2 selected · 5.4 MB')
  await option(host, 'schema.json').click({ modifiers: ['Shift'] })
  expect(await selected(host)).toEqual(['Moodboard.png', 'Q4 roadmap.pdf', 'schema.json'])
  await option(host, 'Assets').locator('.check').click()
  expect(await selected(host)).toEqual(['Assets', 'Moodboard.png', 'Q4 roadmap.pdf', 'schema.json'])
  await page.keyboard.press(`${mod}+a`)
  expect(await selected(host)).toHaveLength(6)
  const last = (await events(host)).at(-1)
  expect(last.value).toHaveLength(6)
  expect(last.items[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) })
  await page.keyboard.press('Escape')
  expect(await selected(host)).toEqual([])
  await expect(host.locator('.selection-bar')).toHaveCount(0)
  // The event does not bubble.
  const bubbled = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let seen = false
        document.body.addEventListener('selection-change', () => (seen = true), { once: true })
        const host = document.querySelector('c2-file-browser') as HTMLElement & { value: string[]; clearSelection(): void }
        host.value = ['budget']
        host.clearSelection()
        requestAnimationFrame(() => resolve(seen))
      }),
  )
  expect(bubbled).toBe(false)
  // In `single` mode a modifier never adds a second item.
  await props(host, { selection: 'single' })
  await option(host, 'Assets').click()
  await option(host, 'schema.json').click({ modifiers: [mod] })
  expect(await selected(host)).toEqual(['schema.json'])
})

test('arrows move and select, Shift extends, typing jumps to a name; in the grid all four arrows move', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const host = browser(page)
  await option(host, 'Assets').click()
  await page.keyboard.press('ArrowDown')
  await expect(option(host, 'Budget 2027.xlsx')).toBeFocused()
  expect(await selected(host)).toEqual(['Budget 2027.xlsx'])
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  expect(await selected(host)).toEqual(['Budget 2027.xlsx', 'Kick-off notes.docx', 'Moodboard.png'])
  await page.keyboard.press('End')
  expect(await selected(host)).toEqual(['schema.json'])
  await page.keyboard.press('q')
  await expect(option(host, 'Q4 roadmap.pdf')).toBeFocused()
  // Ctrl/Cmd moves without selecting; Space toggles.
  await page.keyboard.press(`${mod}+ArrowUp`)
  await page.keyboard.press('Space')
  expect(await selected(host)).toEqual(['Moodboard.png', 'Q4 roadmap.pdf'])

  await watch(host, 'view-change')
  await host.locator('c2-button[value="grid"]').click()
  expect(await events(host)).toEqual([{ view: 'grid' }])
  await expect(host.locator('.tile')).toHaveCount(6)
  await option(host, 'Assets').click()
  await page.keyboard.press('ArrowRight')
  await expect(option(host, 'Budget 2027.xlsx')).toBeFocused()
  const columns = await host
    .locator('.tile')
    .evaluateAll((tiles) => tiles.filter((tile) => (tile as HTMLElement).offsetTop === (tiles[0] as HTMLElement).offsetTop).length)
  expect(columns).toBeGreaterThan(1)
  expect(columns).toBeLessThan(6)
  await page.keyboard.press('ArrowDown')
  await expect(host.locator('.tile').nth(1 + columns)).toBeFocused()
  await accessible(page)
})

test('a header or the sort menu sorts, folders staying first; search filters the folder and says when nothing matches', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const host = browser(page)
  await watch(host, 'sort-change')
  await host.locator('.column', { hasText: 'Size' }).click()
  expect(await names(host)).toEqual(['Assets', 'schema.json', 'Kick-off notes.docx', 'Budget 2027.xlsx', 'Q4 roadmap.pdf', 'Moodboard.png'])
  await host.locator('.column', { hasText: 'Size' }).click()
  expect(await names(host)).toEqual(['Assets', 'Moodboard.png', 'Q4 roadmap.pdf', 'Budget 2027.xlsx', 'Kick-off notes.docx', 'schema.json'])
  await host.locator('.sort-trigger').click()
  await host.locator('c2-menu-item[value="sort:modified"]').click()
  expect(await names(host)).toEqual(['Assets', 'Q4 roadmap.pdf', 'Budget 2027.xlsx', 'Kick-off notes.docx', 'Moodboard.png', 'schema.json'])
  expect(await events(host)).toEqual([
    { sort: 'size', direction: 'asc' },
    { sort: 'size', direction: 'desc' },
    { sort: 'modified', direction: 'desc' },
  ])
  await host.locator('c2-search-field input').fill('no')
  await expect.poll(() => names(host)).toEqual(['Kick-off notes.docx'])
  await host.locator('c2-search-field input').fill('zzz')
  await expect(host.locator('c2-status-panel')).toHaveAttribute('heading', 'No results for “zzz”')
  // Remote search hands the query to the app.
  await host.locator('c2-search-field input').fill('')
  // The field reports its query after a debounce: let the cleared one land before watching for the remote one.
  await expect.poll(() => names(host)).toHaveLength(6)
  await props(host, { search: 'remote' })
  await watch(host, 'search')
  await host.locator('c2-search-field input').fill('road')
  await expect.poll(() => events(host)).toEqual([{ query: 'road', folder: 'q4' }])
})

test('the context menu, the ⋯ button and the menu key run actions on the selection; F2 renames in place', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const host = browser(page)
  await watch(host, 'item-action')
  await option(host, 'Budget 2027.xlsx').click()
  await option(host, 'Moodboard.png').click({ modifiers: [mod] })
  await option(host, 'Moodboard.png').click({ button: 'right' })
  const menu = host.locator('.actions-menu')
  // With two items selected, only the actions that take several are offered.
  await expect.poll(() => menuValues(menu)).toEqual(['download', 'delete'])
  await menu.locator('c2-menu-item[value="download"]').click()
  // Right-clicking an unselected item selects it alone.
  await option(host, 'schema.json').click({ button: 'right' })
  expect(await selected(host)).toEqual(['schema.json'])
  // The menu opens once the button is up: let it, then close it.
  await expect(menu.locator('c2-menu-item[value="rename"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await option(host, 'Assets').locator('.more').click()
  await menu.locator('c2-menu-item[value="delete"]').click()
  await option(host, 'Kick-off notes.docx').click()
  await page.keyboard.press('Shift+F10')
  await expect.poll(() => menuValues(menu)).toEqual(['download', 'rename', 'delete'])
  await page.keyboard.press('Escape')
  await expect(option(host, 'Kick-off notes.docx')).toBeFocused()
  await page.keyboard.press('Delete')
  expect((await events(host)).map((detail: { action: string; items: { id: string }[] }) => [detail.action, detail.items.map((entry) => entry.id)])).toEqual([
    ['download', ['budget', 'mood']],
    ['delete', ['assets']],
    ['delete', ['notes']],
  ])
  // The selection bar runs the same actions.
  await host.locator('.selection-bar .bar-action', { hasText: 'Download' }).click()
  expect((await events(host)).at(-1)).toMatchObject({ action: 'download', items: [{ id: 'notes' }] })

  await watch(host, 'item-rename')
  await option(host, 'Kick-off notes.docx').focus()
  await page.keyboard.press('F2')
  const input = host.locator('input.rename')
  await expect(input).toBeFocused()
  // The extension is left out of the selection.
  expect(await input.evaluate((element: HTMLInputElement) => element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0))).toBe(
    'Kick-off notes',
  )
  await page.keyboard.type('Minutes')
  await page.keyboard.press('Enter')
  expect(await events(host)).toEqual([{ item: expect.objectContaining({ id: 'notes' }), name: 'Minutes.docx' }])
  await expect(option(host, 'Kick-off notes.docx')).toBeFocused()
  // Escape cancels.
  await page.keyboard.press('F2')
  await expect(input).toBeFocused()
  await page.keyboard.type('Nope')
  await page.keyboard.press('Escape')
  expect(await events(host)).toHaveLength(1)
})

test('dragging items onto a folder fires item-move; files from the desktop fire files-drop', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const host = browser(page)
  await watch(host, 'item-move')
  await option(host, 'Budget 2027.xlsx').click()
  await option(host, 'schema.json').click({ modifiers: [mod] })
  await option(host, 'schema.json').dragTo(option(host, 'Assets'))
  await option(host, 'Moodboard.png').dragTo(host.locator('c2-tree-item[value="photos"]'))
  const moves = (await events(host)).map((detail: { items: { id: string }[]; target: string }) => [detail.items.map((entry) => entry.id), detail.target])
  expect(moves).toEqual([
    [['budget', 'schema'], 'assets'],
    [['mood'], 'photos'],
  ])
  // A folder never goes into itself.
  await option(host, 'Assets').dragTo(option(host, 'Assets'))
  expect(await events(host)).toHaveLength(2)

  await watch(host, 'files-drop')
  await page.evaluate(() => {
    const host = document.querySelector('c2-file-browser')!
    const drop = (target: Element) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['hello'], 'hello.txt', { type: 'text/plain' }))
      for (const type of ['dragenter', 'dragover', 'drop'])
        target.dispatchEvent(new DragEvent(type, { bubbles: true, composed: true, cancelable: true, dataTransfer: transfer }))
    }
    drop(host.shadowRoot!.querySelector('[role="option"][data-id="assets"]')!)
    drop(host.shadowRoot!.querySelector('[role="option"][data-id="budget"]')!)
  })
  await expect
    .poll(async () => (await events(host)).map((detail: { folder: string; files: unknown[] }) => [detail.folder, detail.files.length]))
    .toEqual([
      ['assets', 1],
      ['q4', 1],
    ])
})

test('loadChildren fills a folder on first open behind a skeleton, caches it, and the root label names the root', async ({ page, renderScenario }) => {
  await renderScenario('<c2-file-browser locale="en-US" root-label="Drive"></c2-file-browser>')
  const host = browser(page)
  await page.evaluate(() => {
    const files: Record<string, unknown[]> = {
      '': [
        { id: 'docs', name: 'Docs', kind: 'folder' },
        { id: 'a', name: 'a.txt', kind: 'file', size: 10 },
      ],
      docs: [{ id: 'spec', name: 'Spec.md', kind: 'file', size: 20 }],
    }
    const state = window as unknown as { calls: string[]; release: () => void }
    state.calls = []
    const host = document.querySelector('c2-file-browser') as HTMLElement & { loadChildren: (folder: string) => Promise<unknown[]>; refresh(): void }
    host.loadChildren = (folder) => {
      state.calls.push(folder)
      return new Promise((resolve) => (state.release = () => resolve(files[folder] ?? [])))
    }
    host.refresh()
  })
  await expect(host.locator('.loading c2-skeleton').first()).toBeVisible()
  await page.evaluate(() => (window as unknown as { release: () => void }).release())
  await expect.poll(() => names(host)).toEqual(['Docs', 'a.txt'])
  await expect(host.locator('c2-breadcrumb .current')).toHaveText('Drive')
  await option(host, 'Docs').dblclick()
  await expect(host.locator('.loading')).toBeVisible()
  await page.evaluate(() => (window as unknown as { release: () => void }).release())
  await expect.poll(() => names(host)).toEqual(['Spec.md'])
  await page.keyboard.press('Backspace')
  await option(host, 'Docs').dblclick()
  await expect.poll(() => names(host)).toEqual(['Spec.md'])
  expect(await page.evaluate(() => (window as unknown as { calls: string[] }).calls)).toEqual(['', 'docs'])
})

test('below the narrow width the tree gives way to an Up button and the rows show size and date under the name', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="width: 400px">${markup()}</div>`)
  const host = browser(page)
  await expect(host.locator('.tree-pane')).toHaveCount(0)
  await expect(option(host, 'Q4 roadmap.pdf').locator('.sub')).toHaveText('2.4 MB · Nov 2, 2026')
  await expect(option(host, 'Q4 roadmap.pdf').locator('.modified')).toBeHidden()
  await host.locator('c2-button.up').click()
  await expect(host.locator('c2-breadcrumb .current')).toHaveText('Projects')
  await accessible(page)
})

test('a refresh while a folder is loading drops the stale answer: the newer list wins, whichever arrives first', async ({ page, renderScenario }) => {
  await renderScenario('<c2-file-browser locale="en-US"></c2-file-browser>')
  const host = browser(page)
  await page.evaluate(() => {
    const state = window as unknown as { answers: ((items: unknown[]) => void)[] }
    state.answers = []
    const host = document.querySelector('c2-file-browser') as HTMLElement & { loadChildren: (folder: string) => Promise<unknown[]>; refresh(): void }
    host.loadChildren = () => new Promise((resolve) => state.answers.push(resolve))
    host.refresh()
  })
  await expect.poll(() => page.evaluate(() => (window as unknown as { answers: unknown[] }).answers.length)).toBe(1)
  // The app renames a file, then refreshes while the first load is still out.
  await page.evaluate(() => (document.querySelector('c2-file-browser') as HTMLElement & { refresh(): void }).refresh())
  await expect.poll(() => page.evaluate(() => (window as unknown as { answers: unknown[] }).answers.length)).toBe(2)
  await page.evaluate(() => {
    const { answers } = window as unknown as { answers: ((items: unknown[]) => void)[] }
    answers[1]([{ id: 'a', name: 'Renamed.txt', kind: 'file' }])
  })
  await expect.poll(() => names(host)).toEqual(['Renamed.txt'])
  await page.evaluate(() => {
    const { answers } = window as unknown as { answers: ((items: unknown[]) => void)[] }
    answers[0]([{ id: 'a', name: 'Old name.txt', kind: 'file' }])
  })
  // The stale answer arrives last and changes nothing.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await names(host)).toEqual(['Renamed.txt'])
  await expect(host.locator('.loading')).toHaveCount(0)
})

test('keys typed in the author’s empty-slot content stay there: Backspace edits the field rather than going up', async ({ page, renderScenario }) => {
  await renderScenario(
    markup('')
      .replace('folder="q4"', 'folder="assets"')
      .replace('></c2-file-browser>', '><input slot="empty" aria-label="New folder name" /></c2-file-browser>'),
  )
  const host = browser(page)
  const field = page.getByRole('textbox', { name: 'New folder name' })
  await field.fill('Drafts')
  await field.press('Backspace')
  await field.press('Alt+ArrowUp')
  await expect(field).toHaveValue('Draft')
  await expect(host.locator('c2-breadcrumb .current')).toHaveText('Assets')
  // The items still respond to the same keys.
  // A narrow breadcrumb folds its middle crumbs behind the ellipsis.
  const crumb = host.locator('c2-breadcrumb c2-link-button', { hasText: 'Q4 planning' })
  if (!(await crumb.isVisible())) await host.locator('c2-breadcrumb [part="ellipsis"]').click()
  await crumb.click()
  await expect.poll(() => names(host)).toContain('Assets')
})
