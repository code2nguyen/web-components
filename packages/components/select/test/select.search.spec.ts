import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

// The search field, the panel messages and the Create row live in the select's shadow root; the rows in its light DOM.
const listbox = (page: Page) => page.locator('c2-select c2-list')
const option = (page: Page, name: string) => page.locator('c2-list-item', { hasText: name })
const search = (page: Page) => page.locator('c2-select #search')

const statuses =
  '<h3>Not started</h3><c2-list-item value="backlog">Backlog</c2-list-item><c2-list-item value="todo">To do</c2-list-item>' +
  '<h3>In progress</h3><c2-list-item value="doing">Doing</c2-list-item><c2-list-item value="review">In review</c2-list-item>' +
  '<hr /><h3>Complete</h3><c2-list-item value="done">Done</c2-list-item><c2-list-item value="cancel">Cancelled</c2-list-item>'

/** What has focus: a light-DOM row by its text, else the id of the focused element in the select's shadow root. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement
    if (active?.localName === 'c2-list-item') return active.textContent?.trim()
    if (active?.localName === 'c2-select') return active.shadowRoot?.activeElement?.id
    return active?.localName
  })

test('without the new attributes, the dropdown renders no search field, message or footer', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Status">${statuses}</c2-select>`)
  await page.getByRole('button', { name: 'Status' }).click()
  await expect(listbox(page)).toBeVisible()
  await expect(search(page)).toHaveCount(0)
  await expect(page.locator('c2-select .status, c2-select #create')).toHaveCount(0)
  await expect(page.locator('c2-select .footer')).toBeHidden()
  await expect(page.locator('c2-select .panel')).not.toHaveClass(/boxed/)
  await expect.poll(() => focused(page)).toBe('Backlog')
})

test('group headings are styled and skipped by the keyboard', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Status">${statuses}</c2-select>`)
  const heading = page.locator('h3').first()
  await expect(heading).toHaveCSS('text-transform', 'uppercase')
  await page.getByRole('button', { name: 'Status' }).press('ArrowDown')
  await expect.poll(() => focused(page)).toBe('Backlog')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => focused(page)).toBe('Doing')
  await accessible(page)
})

test('searchable filters the options, hides empty groups and takes the keyboard', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Status" searchable>${statuses}</c2-select>`)
  const host = page.locator('c2-select')
  await host.evaluate((element) => {
    const queries: string[] = []
    element.addEventListener('search-change', (event) => {
      queries.push((event as CustomEvent<{ query: string }>).detail.query)
      element.setAttribute('data-queries', JSON.stringify(queries))
    })
  })
  await page.getByRole('button', { name: 'Status' }).press('Enter')
  await expect.poll(() => focused(page)).toBe('search')
  await expect(search(page)).toHaveAttribute('aria-label', 'Filter options')

  await page.keyboard.type('DO')
  await expect(host).toHaveAttribute('data-queries', '["D","DO"]')
  await expect(option(page, 'To do')).toBeVisible()
  await expect(option(page, 'Doing')).toBeVisible()
  await expect(option(page, 'Done')).toBeVisible()
  await expect(option(page, 'Backlog')).toBeHidden()
  await expect(option(page, 'In review')).toBeHidden()
  // Every group still has a match; the divider hides while searching.
  await expect(page.locator('hr')).toBeHidden()

  // Accents and case are ignored, and a group with no match loses its heading.
  await search(page).fill('cancelléd')
  await expect(option(page, 'Cancelled')).toBeVisible()
  await expect(page.locator('h3', { hasText: 'Not started' })).toBeHidden()
  await expect(page.locator('h3', { hasText: 'Complete' })).toBeVisible()

  await search(page).fill('do')
  // ArrowDown goes to the first visible option, the arrows skip the hidden ones, ArrowUp from the first goes back.
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => focused(page)).toBe('To do')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => focused(page)).toBe('Doing')
  await page.keyboard.press('Home')
  await expect.poll(() => focused(page)).toBe('To do')
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => focused(page)).toBe('search')
  // Typing on an option goes on in the field.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('n')
  await expect.poll(() => focused(page)).toBe('search')
  await expect(search(page)).toHaveValue('don')
  await expect(option(page, 'Done')).toBeVisible()
  await expect(option(page, 'Doing')).toBeHidden()

  // Enter picks the first match and closes; the search is cleared on close.
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', ['done'])
  await expect(listbox(page)).not.toBeVisible()
  await expect.poll(() => focused(page)).toBe('button')
  await expect(search(page)).toHaveValue('')
  await expect(option(page, 'Backlog')).toBeAttached()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(option(page, 'Backlog')).toBeVisible()
  await accessible(page)
})

test('no match shows the empty message, replaceable through its slot', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-select placeholder="Status" searchable>${statuses}</c2-select><c2-select placeholder="Custom" searchable>${statuses}<span slot="empty">Nothing here</span></c2-select>`,
  )
  await page.getByRole('button', { name: 'Status' }).click()
  await expect.poll(() => focused(page)).toBe('search')
  await page.keyboard.type('zzz')
  await expect(page.locator('c2-select').first().locator('[part="empty"]')).toHaveText('No matching options')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Custom' }).click()
  await expect.poll(() => focused(page)).toBe('search')
  await page.keyboard.type('zzz')
  await expect(page.getByText('Nothing here')).toBeVisible()
})

test('a cancelled search-change leaves the filtering to the app, with loading in between', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Owner" searchable><c2-list-item value="a">Ada</c2-list-item></c2-select>`)
  const host = page.locator('c2-select')
  await host.evaluate((element) => {
    element.addEventListener('search-change', (event) => {
      event.preventDefault()
      const select = element as HTMLElement & { loading: boolean }
      select.loading = true
      setTimeout(() => {
        const query = (event as CustomEvent<{ query: string }>).detail.query
        element.replaceChildren(
          ...['Grace', 'Linus'].map((name) => Object.assign(document.createElement('c2-list-item'), { value: name, textContent: `${name} ${query}` })),
        )
        select.loading = false
      }, 600)
    })
  })
  await page.getByRole('button', { name: 'Owner' }).click()
  await expect.poll(() => focused(page)).toBe('search')
  await page.keyboard.type('x')
  await expect(page.locator('c2-select [part="loading"]')).toHaveText('Loading…')
  // The app's rows do not contain the query as typed by the user: the select shows them all anyway.
  await expect(option(page, 'Grace')).toBeVisible()
  await expect(option(page, 'Linus')).toBeVisible()
  await expect(page.locator('c2-select [part="loading"]')).toHaveCount(0)
})

test('creatable offers a Create row that fires create-option', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Status" searchable creatable>${statuses}</c2-select>`)
  const host = page.locator('c2-select')
  await host.evaluate((element) => {
    element.addEventListener('create-option', (event) => {
      const { label } = (event as CustomEvent<{ label: string }>).detail
      const row = Object.assign(document.createElement('c2-list-item'), { value: label.toLowerCase(), textContent: label })
      element.append(row)
      ;(element as HTMLElement & { value: string[] }).value = [row.value]
    })
  })
  await page.getByRole('button', { name: 'Status' }).click()
  await expect.poll(() => focused(page)).toBe('search')
  await page.keyboard.type('done')
  // An option with that exact text exists: nothing to create.
  await expect(page.locator('c2-select #create')).toHaveCount(0)
  await search(page).fill('Blocked')
  await expect(page.locator('c2-select #create')).toHaveText('Create “Blocked”')
  // No match: Enter creates; ArrowDown would reach the row as well.
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => focused(page)).toBe('create')
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => focused(page)).toBe('search')
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', ['blocked'])
  await expect(listbox(page)).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Blocked' })).toBeVisible()
})

test('the footer slot holds the panel actions', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-select placeholder="Labels" multiple searchable value="bug">
      <c2-list-item value="bug">Bug</c2-list-item><c2-list-item value="docs">Docs</c2-list-item>
      <button slot="footer" id="clear">Clear</button>
    </c2-select>`,
  )
  const host = page.locator('c2-select')
  await host.evaluate((element) =>
    element.querySelector('#clear')!.addEventListener('click', () => ((element as HTMLElement & { value: string[] }).value = [])),
  )
  await page.getByRole('button', { name: 'Bug' }).click()
  await expect(page.locator('c2-select .footer')).toBeVisible()
  await expect(page.locator('c2-select .panel')).toHaveClass(/boxed/)
  await page.locator('#clear').click()
  await expect(host).toHaveJSProperty('value', [])
  // A click in the footer keeps the dropdown open.
  await expect(listbox(page)).toBeVisible()
  await accessible(page)
})

test('the panel text follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-select placeholder="Statut" searchable creatable>${statuses}</c2-select></div>`)
  await page.getByRole('button', { name: 'Statut' }).click()
  await expect.poll(() => focused(page)).toBe('search')
  await expect(search(page)).toHaveAttribute('placeholder', 'Rechercher…')
  await expect(search(page)).toHaveAttribute('aria-label', 'Filtrer les options')
  await page.keyboard.type('zzz')
  await expect(page.locator('c2-select [part="empty"]')).toHaveText('Aucune option correspondante')
  await expect(page.locator('c2-select #create')).toHaveText('Créer « zzz »')
})

test('typing a search fires no input or change on the select, and opening counts the options again', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Status" searchable>${statuses}</c2-select>`)
  const host = page.locator('c2-select')
  await host.evaluate((element) => {
    element.setAttribute('data-seen', '')
    for (const name of ['input', 'change']) element.addEventListener(name, () => element.setAttribute('data-seen', element.getAttribute('data-seen') + name))
  })
  await page.getByRole('button', { name: 'Status' }).click()
  await expect.poll(() => focused(page)).toBe('search')
  await expect(page.locator('c2-select [part="empty"]')).toHaveCount(0)
  await page.keyboard.type('do')
  await expect(option(page, 'Backlog')).toBeHidden()
  await expect(host).toHaveAttribute('data-seen', '')
})

test('a child added in a named slot keeps the right options hidden, and modified arrows skip hidden ones', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Status" searchable multiple>${statuses}</c2-select>`)
  const host = page.locator('c2-select')
  await page.getByRole('button', { name: 'Status' }).click()
  await expect.poll(() => focused(page)).toBe('search')
  await page.keyboard.type('do')
  await expect(option(page, 'Backlog')).toBeHidden()
  // An app echoing a badge in the trigger shifts every option's position among the children.
  await host.evaluate((element) => element.prepend(Object.assign(document.createElement('span'), { slot: 'button-content', textContent: 'Picked' })))
  await expect(option(page, 'Backlog')).toBeHidden()
  await expect(option(page, 'To do')).toBeVisible()
  await expect(option(page, 'Done')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => focused(page)).toBe('To do')
  await page.keyboard.press('Control+ArrowUp')
  await expect.poll(() => focused(page)).toBe('search')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect(host).toHaveJSProperty('value', ['todo'])
  // The roving tabindex follows the focused option, never a hidden one.
  await expect(option(page, 'To do')).toHaveAttribute('tabindex', '0')
  await expect(option(page, 'Backlog')).toHaveAttribute('tabindex', '-1')
})
