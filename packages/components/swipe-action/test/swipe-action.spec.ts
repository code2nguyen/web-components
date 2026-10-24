import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { SwipeAction } from '../src/swipe-action'
import { test, expect } from './fixture'

/**
 * Drags the row's content horizontally by `dx` with a real mouse, in steps so the component sees a gesture. It starts
 * near the edge the drag moves away from, so a long drag stays inside the window: Firefox drops a synthetic `mouseup`
 * outside it, and the drag would never end.
 */
async function drag(page: Page, dx: number, { steps = 12, dy = 0 } = {}) {
  const box = (await page.locator('c2-swipe-action').boundingBox())!
  const x = dx < 0 ? box.x + box.width - 8 : box.x + 8
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps })
  await page.mouse.up()
}

/** The content box's horizontal offset relative to the row, once it has settled. */
async function contentOffset(page: Page) {
  return page.locator('c2-swipe-action').evaluate(async (host) => {
    const content = host.shadowRoot!.querySelector<HTMLElement>('.content')!
    await Promise.all(content.getAnimations().map((animation) => animation.finished))
    return Math.round(content.getBoundingClientRect().left - host.getBoundingClientRect().left)
  })
}

const log = (page: Page) => page.locator('#log')
const subject = (page: Page) => page.locator('c2-swipe-action')

test('renders closed with the actions covered', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByText('Quarterly report')).toBeVisible()
  expect(await contentOffset(page)).toBe(0)
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('swiping toward the start edge reveals the end actions', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -140)
  await expect(subject(page)).toHaveJSProperty('open', 'end')
  await expect(log(page)).toHaveText('open:end')
  expect(await contentOffset(page)).toBe(-152)
})

test('swiping toward the end edge reveals the start actions', async ({ page, scenario }) => {
  await scenario()
  await drag(page, 90)
  await expect(subject(page)).toHaveJSProperty('open', 'start')
  expect(await contentOffset(page)).toBe(80)
})

test('in right-to-left, swiping right reveals the end actions on the left', async ({ page, scenario }) => {
  await scenario('rtl')
  await drag(page, 140)
  await expect(subject(page)).toHaveJSProperty('open', 'end')
  expect(await contentOffset(page)).toBe(152)
})

test('a short slow drag springs back closed', async ({ page, scenario }) => {
  await scenario()
  // Slow means slow in time: Playwright's steps arrive a millisecond apart, which is a flick, so pace each one a frame.
  const box = (await subject(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  for (let dx = -3; dx >= -30; dx -= 3) {
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  await expect(subject(page)).toHaveJSProperty('open', '')
  expect(await contentOffset(page)).toBe(0)
  await expect(log(page)).toHaveText('')
})

test('a side without actions does not open', async ({ page, scenario }) => {
  await scenario('end-only')
  await drag(page, 120)
  await expect(subject(page)).toHaveJSProperty('open', '')
  expect(await contentOffset(page)).toBe(0)
})

test('a vertical drag is left to the page', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -40, { dy: 120 })
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('a drag does not click the content, and a tap on the open row closes it', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -140)
  await expect(subject(page)).toHaveJSProperty('open', 'end')
  await subject(page).click({ position: { x: 100, y: 20 } })
  await expect(subject(page)).toHaveJSProperty('open', '')
  await expect(log(page)).toHaveText('open:end,open:none')
  await page.getByText('Quarterly report').click()
  await expect(log(page)).toHaveText('open:end,open:none,click:content')
})

test('activating an action runs it and closes the row', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -140)
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(log(page)).toHaveText('open:end,click:delete,open:none')
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('a press outside and Escape close the row', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -140)
  await page.getByRole('button', { name: 'Outside' }).click()
  await expect(subject(page)).toHaveJSProperty('open', '')
  await drag(page, 90)
  await expect(subject(page)).toHaveJSProperty('open', 'start')
  await page.getByRole('button', { name: 'Archive' }).focus()
  await page.keyboard.press('Escape')
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('tabbing onto an action reveals its side, and tabbing away closes it', async ({ page, scenario, tab }) => {
  await scenario()
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await tab()
  await expect(page.getByRole('button', { name: 'Archive' })).toBeFocused()
  await expect(subject(page)).toHaveJSProperty('open', 'start')
  await tab()
  await expect(page.getByRole('button', { name: 'Flag' })).toBeFocused()
  await expect(subject(page)).toHaveJSProperty('open', 'end')
  expect(await contentOffset(page)).toBe(-152)
  await tab()
  await tab()
  await expect(page.getByRole('button', { name: 'Outside' })).toBeFocused()
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('a full swipe clicks the outermost action', async ({ page, scenario }) => {
  await scenario('full-swipe')
  await drag(page, -320)
  await expect(log(page)).toHaveText('full:end,click:delete')
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('a full swipe clicks an action inside a display: contents wrapper, such as a framework island', async ({ page, scenario }) => {
  await scenario('wrapped')
  await drag(page, -320)
  await expect(log(page)).toHaveText('full:end,click:delete')
})

test('without full-swipe a long drag only opens the side', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -320)
  await expect(log(page)).toHaveText('open:end')
  expect(await contentOffset(page)).toBe(-152)
})

test('disabled does not move', async ({ page, scenario }) => {
  await scenario('disabled')
  await drag(page, -140)
  await expect(subject(page)).toHaveJSProperty('open', '')
  expect(await contentOffset(page)).toBe(0)
})

test('setting open from code reveals that side without an event', async ({ page, scenario }) => {
  await scenario()
  await subject(page).evaluate((host) => (host as SwipeAction).show('start'))
  expect(await contentOffset(page)).toBe(80)
  await expect(log(page)).toHaveText('')
})

for (const state of ['closed', 'open']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario()
    if (state === 'open') await drag(page, -140)
    const results = await new AxeBuilder({ page }).include('c2-swipe-action').analyze()
    expect(results.violations).toEqual([])
  })
}

test.describe('rows of a c2-list', () => {
  const row = (page: Page, label: string) => page.locator('c2-list-item', { hasText: label })

  test('the list finds each wrapped row, and arrow keys move between rows', async ({ page, scenario }) => {
    await scenario('list')
    await row(page, 'Apple').click()
    await expect(log(page)).toHaveText('select:a')
    await page.keyboard.press('ArrowDown')
    await expect(row(page, 'Banana')).toBeFocused()
    await page.keyboard.press('End')
    await expect(row(page, 'Cherry')).toBeFocused()
  })

  test("a shortcut key runs that row's action without selecting the row or reaching typeahead", async ({ page, scenario }) => {
    await scenario('list')
    await row(page, 'Apple').click()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Delete')
    await expect(log(page)).toHaveText('select:a,click:delete-b')
    // "a" is Archive's shortcut: it must not also move focus back to Apple through typeahead.
    await page.keyboard.press('a')
    await expect(log(page)).toHaveText('select:a,click:delete-b,click:archive-b')
    await expect(row(page, 'Banana')).toBeFocused()
  })

  test('the closed actions are out of the Tab order, so the list stays one Tab stop', async ({ page, scenario, tab }) => {
    await scenario('list')
    await row(page, 'Apple').click()
    await tab()
    await expect(page.locator('#outside')).toBeFocused()
    await tab(true)
    await expect(row(page, 'Apple')).toBeFocused()
  })

  test('a swiped row still opens, its actions take focus, and leaving them closes it', async ({ page, scenario, tab }) => {
    await scenario('list')
    const subject = page.locator('c2-swipe-action').nth(1)
    const box = (await subject.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect(subject).toHaveJSProperty('open', 'end')
    await expect(log(page)).toHaveText('')
    await page.locator('#delete-b').focus()
    await expect(page.locator('#delete-b')).toBeFocused()
    // Shift+Tab goes back to the list's one Tab stop, and the row closes as focus leaves it.
    await tab(true)
    await expect(row(page, 'Apple')).toBeFocused()
    await expect(subject).toHaveJSProperty('open', '')
  })

  test('has no axe violations', async ({ page, scenario }) => {
    await scenario('list')
    const results = await new AxeBuilder({ page }).include('c2-list').analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('rows of a c2-list without swipeable', () => {
  const row = (page: Page, label: string) => page.locator('c2-list-item', { hasText: label })

  test('a row does not swipe, its shortcut keys do nothing, and the list keeps working', async ({ page, scenario }) => {
    await scenario('list-off')
    const subject = page.locator('c2-swipe-action').nth(1)
    const box = (await subject.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect(subject).toHaveJSProperty('open', '')
    // A drag on a row that cannot swipe is a plain click, which selects it.
    await expect(row(page, 'Banana')).toBeFocused()
    await page.keyboard.press('Delete')
    await page.keyboard.press('ArrowDown')
    await expect(row(page, 'Cherry')).toBeFocused()
    await expect(log(page)).toHaveText('select:b')
  })

  test('the hidden actions are inert: out of the Tab order and the accessibility tree', async ({ page, scenario, tab }) => {
    await scenario('list-off')
    await row(page, 'Apple').click()
    await tab()
    await expect(page.locator('#outside')).toBeFocused()
    // An inert element cannot take focus even from code.
    await page.locator('#delete-a').focus()
    await expect(page.locator('#delete-a')).not.toBeFocused()
  })

  test('turning swipeable on lets the rows swipe', async ({ page, scenario }) => {
    await scenario('list-off')
    await page.locator('c2-list').evaluate((list) => ((list as HTMLElement & { swipeable: boolean }).swipeable = true))
    await row(page, 'Apple').click()
    await page.keyboard.press('Delete')
    await expect(log(page)).toHaveText('select:a,click:delete-a')
  })

  test('a row added to a list that does not swipe is held still too', async ({ page, scenario }) => {
    await scenario('list-off')
    await page.locator('c2-list').evaluate((list) => {
      list.insertAdjacentHTML(
        'beforeend',
        '<c2-swipe-action><c2-list-item value="d">Date</c2-list-item><button slot="end" aria-keyshortcuts="Delete">Delete</button></c2-swipe-action>',
      )
    })
    await expect(page.locator('c2-swipe-action').last().locator('button')).toHaveJSProperty('inert', false)
    await expect
      .poll(() =>
        page
          .locator('c2-swipe-action')
          .last()
          .evaluate((row) => row.shadowRoot!.querySelector('.end')!.hasAttribute('inert')),
      )
      .toBe(true)
  })
})

test.describe('regressions', () => {
  test('a touch drag, which no click follows, does not swallow the next tap on the content', async ({ page, scenario, browserName }) => {
    test.skip(browserName !== 'chromium', 'Real touch input goes through DevTools, which only Chromium has')
    await scenario()
    const box = (await subject(page).boundingBox())!
    const y = box.y + box.height / 2
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
    await touch('touchStart', box.x + 200)
    for (let x = 200; x >= 40; x -= 20) await touch('touchMove', box.x + x)
    await touch('touchEnd', box.x + 40)
    await expect(subject(page)).toHaveJSProperty('open', 'end')
    await subject(page).evaluate((host) => (host as SwipeAction).close())
    await page.getByText('Quarterly report').click()
    await expect(log(page)).toHaveText('open:end,click:content')
  })

  test('a drag that stops before release is not a flick', async ({ page, scenario }) => {
    await scenario()
    const box = (await subject(page).boundingBox())!
    await page.mouse.move(box.x + 200, box.y + 20)
    await page.mouse.down()
    // A fast short drag, then holding still: the release must judge the distance, not the earlier speed.
    await page.mouse.move(box.x + 140, box.y + 20, { steps: 2 })
    await page.waitForTimeout(250)
    await page.mouse.up()
    await expect(subject(page)).toHaveJSProperty('open', '')
  })

  test('a row moved in the page while open still closes on a press outside', async ({ page, scenario }) => {
    await scenario()
    await drag(page, -140)
    await expect(subject(page)).toHaveJSProperty('open', 'end')
    await page.locator('main').evaluate((main) => main.prepend(main.querySelector('c2-swipe-action')!))
    await page.locator('#outside').click()
    await expect(subject(page)).toHaveJSProperty('open', '')
  })

  test('a disabled action does not run from its shortcut key', async ({ page, scenario }) => {
    await scenario('list')
    await page.locator('#delete-a').evaluate((button) => ((button as HTMLButtonElement).disabled = true))
    await page.locator('c2-list-item', { hasText: 'Apple' }).click()
    await page.keyboard.press('Delete')
    await expect(log(page)).toHaveText('select:a')
  })

  test('Tab goes from a row to its own actions, and Enter on one runs it rather than selecting the row', async ({ page, scenario, tab }) => {
    await scenario('list-plain')
    await page.locator('c2-list-item', { hasText: 'Apple' }).click()
    await tab()
    await expect(page.locator('#archive-a')).toBeFocused()
    await page.keyboard.press('Enter')
    // Focusing the action opened its side; Enter ran it (not a row selection) and the row closed again.
    await expect(log(page)).toHaveText('select:a,open:start,click:archive-a,open:none')
    await tab(true)
    await expect(page.locator('c2-list-item', { hasText: 'Apple' })).toBeFocused()
  })

  test("a swipe row inside a row's own content is not held still by the list", async ({ page, scenario }) => {
    await scenario('list-off')
    await page.locator('c2-list-item', { hasText: 'Apple' }).evaluate((item) => {
      item.insertAdjacentHTML('beforeend', '<c2-swipe-action slot="description" id="inner">Inner<button slot="end">Pin</button></c2-swipe-action>')
    })
    await expect.poll(() => page.locator('#inner').evaluate((row) => row.shadowRoot?.querySelector('.end')?.hasAttribute('inert'))).toBe(false)
  })
})
