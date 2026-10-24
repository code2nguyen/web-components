import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'
import type { OrgChart } from '../src/org-chart'

const team = [
  {
    id: 'ana',
    label: 'Ana Ruiz',
    description: 'Chief Executive Officer',
    children: [
      {
        id: 'li',
        label: 'Li Wei',
        description: 'CTO',
        children: [
          { id: 'sam', label: 'Sam Patel', description: 'Engineering' },
          { id: 'kim', label: 'Kim Lee', description: 'Design', disabled: true },
        ],
      },
      { id: 'maya', label: 'Maya Cohen', description: 'CFO', children: [{ id: 'joe', label: 'Joe Park', description: 'Finance' }] },
    ],
  },
]

function chart(attributes = '') {
  return `<c2-org-chart ${attributes} items='${JSON.stringify(team)}'></c2-org-chart>`
}

const item = (page: Page, name: string) => page.getByRole('treeitem', { name: new RegExp(`^${name}`) })
const card = (treeitem: Locator) => treeitem.locator(':scope > .box > .card')
const toggle = (treeitem: Locator) => treeitem.locator(':scope > .box > .toggle')
const events = async (host: Locator) => JSON.parse((await host.getAttribute('data-events')) ?? '[]')

test('draws the hierarchy as a tree, reports below their manager', async ({ page, renderScenario }) => {
  await renderScenario(chart())
  const host = page.locator('c2-org-chart')
  await expect(host).toHaveHostAria('role', 'tree')
  await expect(host).toHaveHostAria('aria-label', 'Organization chart')
  await expect(page.getByRole('treeitem')).toHaveCount(6)

  const ana = item(page, 'Ana Ruiz')
  await expect(ana).toHaveAttribute('aria-level', '1')
  await expect(ana).toHaveAttribute('aria-expanded', 'true')
  await expect(item(page, 'Kim Lee')).toHaveAttribute('aria-level', '3')
  await expect(item(page, 'Kim Lee')).toHaveAttribute('aria-posinset', '2')
  await expect(item(page, 'Kim Lee')).toHaveAttribute('aria-setsize', '2')
  await expect(item(page, 'Joe Park')).not.toHaveAttribute('aria-expanded')

  const top = (await card(ana).boundingBox())!
  const li = (await card(item(page, 'Li Wei')).boundingBox())!
  const maya = (await card(item(page, 'Maya Cohen')).boundingBox())!
  expect(li.y).toBeGreaterThan(top.y + top.height)
  expect(maya.y).toBe(li.y)
  expect(maya.x).toBeGreaterThan(li.x + li.width)
  // The manager's line drops onto the bar between the first and the last report.
  const centre = top.x + top.width / 2
  expect(centre).toBeGreaterThan(li.x + li.width / 2)
  expect(centre).toBeLessThan(maya.x + maya.width / 2)
  await accessible(page)
})

test('horizontal puts reports beside their manager', async ({ page, renderScenario }) => {
  await renderScenario(chart('orientation="horizontal"'))
  await expect(page.locator('c2-org-chart')).toHaveHostAria('aria-orientation', 'horizontal')
  const top = (await card(item(page, 'Ana Ruiz')).boundingBox())!
  const li = (await card(item(page, 'Li Wei')).boundingBox())!
  const maya = (await card(item(page, 'Maya Cohen')).boundingBox())!
  expect(li.x).toBeGreaterThan(top.x + top.width)
  expect(maya.x).toBe(li.x)
  expect(maya.y).toBeGreaterThan(li.y + li.height)
  await accessible(page)
})

test('the toggle collapses a manager to a count of reports and expands it again', async ({ page, renderScenario }) => {
  await renderScenario(chart())
  const host = page.locator('c2-org-chart')
  await watch(host, 'expansion-change')
  const li = item(page, 'Li Wei')
  await toggle(li).click()
  await expect(li).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle(li)).toHaveText('2')
  await expect(item(page, 'Sam Patel')).toHaveCount(0)
  expect(await host.evaluate((el: OrgChart) => el.collapsedItems)).toEqual(['li'])
  expect((await events(host))[0]).toMatchObject({ collapsedItems: ['li'], node: { id: 'li' }, expanded: false })

  await toggle(li).click()
  await expect(li).toHaveAttribute('aria-expanded', 'true')
  await expect(item(page, 'Sam Patel')).toBeVisible()
  expect((await events(host))[1]).toMatchObject({ collapsedItems: [], expanded: true })
})

test('collapsed-items hides those reports from the start, and reveal() brings a node back', async ({ page, renderScenario }) => {
  await renderScenario(chart('collapsed-items="ana"'))
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  await expect(toggle(item(page, 'Ana Ruiz'))).toHaveText('2')
  await page.locator('c2-org-chart').evaluate((el: OrgChart) => el.reveal('joe'))
  await expect(item(page, 'Joe Park')).toBeVisible()
  await page.locator('c2-org-chart').evaluate((el: OrgChart) => el.collapseAll())
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  await page.locator('c2-org-chart').evaluate((el: OrgChart) => el.expandAll())
  await expect(page.getByRole('treeitem')).toHaveCount(6)
})

test('one Tab stop, and the arrow keys follow the vertical drawing', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button>Before</button>${chart()}<button>After</button>`)
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(item(page, 'Ana Ruiz')).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(item(page, 'Li Wei')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(item(page, 'Maya Cohen')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect(item(page, 'Kim Lee')).toBeFocused()
  // The row runs on across managers.
  await page.keyboard.press('ArrowRight')
  await expect(item(page, 'Joe Park')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(item(page, 'Maya Cohen')).toBeFocused()

  // Up on an expanded manager collapses it first, Down expands it again.
  await page.keyboard.press('ArrowUp')
  await expect(item(page, 'Maya Cohen')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowDown')
  await expect(item(page, 'Maya Cohen')).toHaveAttribute('aria-expanded', 'true')
  await expect(item(page, 'Maya Cohen')).toBeFocused()

  await page.keyboard.press('End')
  await expect(item(page, 'Joe Park')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(item(page, 'Ana Ruiz')).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  // Focus comes back to the card it left.
  await tab(true)
  await expect(item(page, 'Li Wei')).toBeFocused()
})

test('the horizontal layout turns the arrow keys a quarter', async ({ page, renderScenario }) => {
  await renderScenario(chart('orientation="horizontal"'))
  await item(page, 'Ana Ruiz').focus()
  await page.keyboard.press('ArrowRight')
  await expect(item(page, 'Li Wei')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item(page, 'Maya Cohen')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(item(page, 'Maya Cohen')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowLeft')
  await expect(item(page, 'Ana Ruiz')).toBeFocused()
})

test('collapsing the manager of the focused card hands it the Tab stop', async ({ page, renderScenario }) => {
  await renderScenario(chart())
  await item(page, 'Sam Patel').focus()
  await toggle(item(page, 'Li Wei')).click()
  await expect(item(page, 'Li Wei')).toBeFocused()
  await expect(item(page, 'Li Wei')).toHaveAttribute('tabindex', '0')
})

test('collapsing from code moves focus from a hidden card to its drawn manager', async ({ page, renderScenario }) => {
  await renderScenario(chart())
  await item(page, 'Sam Patel').focus()
  await page.locator('c2-org-chart').evaluate((el: OrgChart) => el.collapseAll())
  await expect(item(page, 'Ana Ruiz')).toBeFocused()
  await page.locator('c2-org-chart').evaluate((el: OrgChart) => el.focusItem('joe'))
  await expect(item(page, 'Joe Park')).toBeFocused()
  await page.locator('c2-org-chart').evaluate((el: OrgChart) => (el.collapsedItems = ['maya']))
  await expect(item(page, 'Maya Cohen')).toBeFocused()
})

test('a duplicated id is drawn once', async ({ page, renderScenario }) => {
  const items = [
    {
      id: 'ana',
      label: 'Ana Ruiz',
      children: [
        { id: 'x', label: 'First' },
        { id: 'x', label: 'Second' },
      ],
    },
  ]
  await renderScenario(`<c2-org-chart items='${JSON.stringify(items)}'></c2-org-chart>`)
  await expect(page.getByRole('treeitem')).toHaveCount(2)
  await expect(item(page, 'Second')).toHaveCount(0)
})

test('items that are not an array draw the empty state instead of throwing', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-org-chart items='{"id":"ana","children":{}}'><p slot="empty">Nothing</p></c2-org-chart>`)
  await expect(page.getByText('Nothing')).toBeVisible()
  expect(await page.locator('c2-org-chart').evaluate((el: OrgChart) => el.allNodes.length)).toBe(0)
})

test('a selectable chart selects one card at a time, never a disabled one', async ({ page, renderScenario }) => {
  await renderScenario(chart('selectable'))
  const host = page.locator('c2-org-chart')
  await watch(host, 'selection-change')
  await expect(item(page, 'Ana Ruiz')).toHaveAttribute('aria-selected', 'false')
  await card(item(page, 'Li Wei')).click()
  await expect(item(page, 'Li Wei')).toHaveAttribute('aria-selected', 'true')
  await expect(host).toHaveJSProperty('value', 'li')

  await item(page, 'Maya Cohen').focus()
  await page.keyboard.press('Space')
  await expect(item(page, 'Maya Cohen')).toHaveAttribute('aria-selected', 'true')
  await expect(item(page, 'Li Wei')).toHaveAttribute('aria-selected', 'false')

  await card(item(page, 'Kim Lee')).click()
  await expect(item(page, 'Kim Lee')).toHaveAttribute('aria-selected', 'false')
  expect((await events(host)).map((detail: { value: string }) => detail.value)).toEqual(['li', 'maya'])
  await accessible(page)
})

test('item-click fires for every card, selectable or not', async ({ page, renderScenario }) => {
  await renderScenario(chart())
  const host = page.locator('c2-org-chart')
  await watch(host, 'item-click')
  await card(item(page, 'Joe Park')).click()
  await item(page, 'Ana Ruiz').focus()
  await page.keyboard.press('Enter')
  expect((await events(host)).map((detail: { node: { id: string } }) => detail.node.id)).toEqual(['joe', 'ana'])
  await expect(item(page, 'Joe Park')).not.toHaveAttribute('aria-selected')
  // The toggle is not the card.
  await toggle(item(page, 'Maya Cohen')).click()
  expect(await events(host)).toHaveLength(2)
})

test('renderItem replaces the content of every card', async ({ page, renderScenario }) => {
  await renderScenario(chart())
  await page.locator('c2-org-chart').evaluate(async (el: OrgChart) => {
    el.renderItem = ({ node, level }) => {
      const span = document.createElement('span')
      span.textContent = `${node.label} at level ${level}`
      return span
    }
    await el.updateComplete
  })
  await expect(page.getByRole('treeitem', { name: 'Sam Patel at level 2' })).toBeVisible()
  await expect(page.locator('c2-org-chart').locator('c2-avatar')).toHaveCount(0)
})

test('an empty chart shows the empty slot', async ({ page, renderScenario }) => {
  await renderScenario('<c2-org-chart><p slot="empty">No one here yet</p></c2-org-chart>')
  await expect(page.getByText('No one here yet')).toBeVisible()
  // Not announced as an empty tree.
  await expect(page.locator('c2-org-chart')).toHaveHostAria('role', null)
  await accessible(page)
  await props(page.locator('c2-org-chart'), { items: team })
  await expect(page.getByText('No one here yet')).toBeHidden()
  await expect(page.getByRole('treeitem')).toHaveCount(6)
})

test('its name and toggle text follow the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${chart('collapsed-items="li"')}</div>`)
  const host = page.locator('c2-org-chart')
  await expect(host).toHaveHostAria('aria-label', 'Organigramme')
  await expect(toggle(item(page, 'Li Wei'))).toHaveAttribute('title', 'Déplier (2)')
  await expect(toggle(item(page, 'Maya Cohen'))).toHaveAttribute('title', 'Replier')
})
