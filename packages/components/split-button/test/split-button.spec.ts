import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

// Rows state their role and aria-* through ElementInternals, which getByRole cannot see, so they are found by value.
const row = (page: Page, value: string) => page.locator(`c2-menu-item[value="${value}"]`)
const events = async (page: Page, selector = 'c2-split-button') => JSON.parse((await page.locator(selector).getAttribute('data-events')) ?? '[]')

const send = `<button>Before</button>
<c2-split-button>
  Send
  <c2-menu-item slot="menu" value="schedule">Schedule send<span slot="description">Pick a date and time</span></c2-menu-item>
  <c2-menu-item slot="menu" value="archive">Send and archive</c2-menu-item>
  <hr slot="menu" />
  <c2-menu-item slot="menu" value="template">Save as template</c2-menu-item>
</c2-split-button>
<button>After</button>`

const merge = `<c2-split-button mode="choice" value="squash" caret-label="Choose merge method">
  <c2-menu-item slot="menu" value="merge">Create a merge commit</c2-menu-item>
  <c2-menu-item slot="menu" value="squash" label="Squash and merge">Squash and merge<span slot="description">Combine all commits</span></c2-menu-item>
  <c2-menu-item slot="menu" value="rebase">Rebase and merge</c2-menu-item>
</c2-split-button>`

test('renders two buttons with two tab stops and writes nothing on the host', async ({ page, renderScenario, tab }) => {
  await renderScenario(send)
  const host = page.locator('c2-split-button')
  expect(await host.evaluate((element) => element.getAttributeNames())).toEqual([])
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'More Send options' })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await expect(host).toHaveHostAria('role', null)
  await accessible(page)
})

for (const input of ['mouse', 'Enter', 'Space']) {
  test(`the main half fires action with ${input}`, async ({ page, renderScenario }) => {
    await renderScenario(send)
    await watch(page.locator('c2-split-button'), 'action')
    const main = page.getByRole('button', { name: 'Send', exact: true })
    if (input === 'mouse') await main.click()
    else {
      await main.focus()
      await page.keyboard.press(input)
    }
    expect(await events(page)).toEqual([{ value: '' }])
    await expect(page.locator('c2-menu-item').first()).toBeHidden()
  })
}

for (const state of ['disabled', 'main-disabled', 'running']) {
  test(`${state} ignores the main half`, async ({ page, renderScenario }) => {
    await renderScenario(send.replace('<c2-split-button>', `<c2-split-button ${state}>`))
    await watch(page.locator('c2-split-button'), 'action')
    const main = page.locator('c2-split-button').locator('.main')
    await main.click({ force: true })
    await main.press('Enter').catch(() => {})
    expect(await events(page)).toEqual([])
    if (state === 'disabled') await expect(main).toBeDisabled()
    else {
      await expect(main).toHaveAttribute('aria-disabled', 'true')
      // The caret stays usable.
      await page.getByRole('button', { name: 'More Send options' }).click()
      await expect(row(page, 'schedule')).toBeVisible()
    }
    if (state === 'running') await expect(main).toHaveAttribute('aria-busy', 'true')
  })
}

test('a disabled fieldset disables both halves', async ({ page, renderScenario }) => {
  await renderScenario(`<form><fieldset disabled>${send}</fieldset></form>`)
  await expect(page.locator('c2-split-button').locator('.main')).toBeDisabled()
  await expect(page.locator('c2-split-button').locator('.caret')).toBeDisabled()
})

test('submits its form with name and value, and a cancelled action cancels the submit', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-split-button type="submit" name="intent" value="send">Send<c2-menu-item slot="menu" value="later">Later</c2-menu-item></c2-split-button></form>`,
  )
  await page.locator('form').evaluate((form) => {
    form.setAttribute('data-submits', '[]')
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const data = new FormData(form as HTMLFormElement, (event as SubmitEvent).submitter)
      const submits = JSON.parse(form.getAttribute('data-submits')!)
      submits.push(Object.fromEntries(data))
      form.setAttribute('data-submits', JSON.stringify(submits))
    })
  })
  const main = page.getByRole('button', { name: 'Send', exact: true })
  await main.click()
  await expect(page.locator('form')).toHaveAttribute('data-submits', JSON.stringify([{ intent: 'send' }]))
  await page.locator('c2-split-button').evaluate((element) => element.addEventListener('action', (event) => event.preventDefault()))
  await main.click()
  await expect(page.locator('form')).toHaveAttribute('data-submits', JSON.stringify([{ intent: 'send' }]))
})

for (const [key, first] of [
  ['Enter', 'schedule'],
  ['Space', 'schedule'],
  ['ArrowDown', 'schedule'],
  ['ArrowUp', 'template'],
] as const) {
  test(`the caret opens with ${key} on ${first}`, async ({ page, renderScenario }) => {
    await renderScenario(send)
    const caret = page.getByRole('button', { name: 'More Send options' })
    await expect(caret).toHaveAttribute('aria-haspopup', 'menu')
    await expect(caret).toHaveAttribute('aria-expanded', 'false')
    await caret.focus()
    await page.keyboard.press(key)
    await expect(row(page, first)).toBeFocused()
    await expect(caret).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('c2-split-button')).toHaveState('open')
    await page.keyboard.press('Escape')
    await expect(caret).toBeFocused()
    await expect(caret).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('c2-split-button')).not.toHaveState('open')
  })
}

test('the menu is anchored to the whole control and never narrower than it', async ({ page, renderScenario }) => {
  await renderScenario(send)
  await page.getByRole('button', { name: 'More Send options' }).click()
  await expect(row(page, 'schedule')).toBeVisible()
  const host = (await page.locator('c2-split-button').boundingBox())!
  const surface = (await page.locator('c2-split-button').locator('c2-menu').locator('.menu').boundingBox())!
  expect(surface.width).toBeGreaterThanOrEqual(host.width - 1)
  // bottom-end: the right edges line up.
  expect(Math.abs(surface.x + surface.width - (host.x + host.width))).toBeLessThanOrEqual(1)
  expect(surface.y).toBeGreaterThan(host.y + host.height - 1)
})

test('fixed mode: a pick bubbles menu-select, closes the menu and returns focus, the label never changes', async ({ page, renderScenario }) => {
  await renderScenario(send)
  await watch(page.locator('main'), 'menu-select')
  await watch(page.locator('c2-split-button'), 'action')
  const caret = page.getByRole('button', { name: 'More Send options' })
  await caret.focus()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'schedule')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'archive')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(row(page, 'archive')).toBeHidden()
  expect(await events(page, 'main')).toEqual([{ value: 'archive', checked: false }])
  await expect(caret).toBeFocused()
  await expect(row(page, 'archive')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
  expect(await events(page)).toEqual([])
})

test('choice mode: value names the main half and the caret describes the current choice', async ({ page, renderScenario }) => {
  await renderScenario(merge)
  const main = page.getByRole('button', { name: 'Squash and merge', exact: true })
  await expect(main).toBeVisible()
  const caret = page.getByRole('button', { name: 'Choose merge method' })
  await expect(caret).toHaveAccessibleDescription('Current: Squash and merge')
  await expect(row(page, 'squash')).toHaveHostAria('role', 'menuitemradio')
  await expect(row(page, 'squash')).toHaveHostAria('aria-checked', 'true')
  await expect(row(page, 'merge')).toHaveHostAria('aria-checked', 'false')
  // Nothing written on the author's rows beyond the menu's roving tabindex.
  for (const value of ['merge', 'squash', 'rebase']) {
    const names = await row(page, value).evaluate((element) => element.getAttributeNames())
    expect(names.filter((name) => ['type', 'checked', 'name'].includes(name))).toEqual([])
  }
})

test('choice mode: a pick fires input then change, updates the label and does not run it', async ({ page, renderScenario }) => {
  await renderScenario(merge)
  const host = page.locator('c2-split-button')
  await host.evaluate((element) => {
    element.setAttribute('data-log', '')
    for (const type of ['input', 'change', 'action'])
      element.addEventListener(type, () => element.setAttribute('data-log', `${element.getAttribute('data-log')} ${type}`.trim()))
  })
  const caret = page.getByRole('button', { name: 'Choose merge method' })
  await caret.focus()
  await page.keyboard.press('Enter')
  // Opens on the current choice.
  await expect(row(page, 'squash')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'rebase')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(host).toHaveAttribute('data-log', 'input change')
  await expect(page.getByRole('button', { name: 'Rebase and merge', exact: true })).toBeVisible()
  await expect(caret).toHaveAccessibleDescription('Current: Rebase and merge')
  expect(await host.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('rebase')
  await expect(row(page, 'rebase')).toHaveHostAria('aria-checked', 'true')
  await expect(row(page, 'squash')).toHaveHostAria('aria-checked', 'false')
  await watch(host, 'action')
  await page.getByRole('button', { name: 'Rebase and merge', exact: true }).click()
  expect(await events(page)).toEqual([{ value: 'rebase' }])
})

test('choice mode: a cancelled menu-select keeps the choice, and a value set from code fires nothing', async ({ page, renderScenario }) => {
  await renderScenario(merge)
  const host = page.locator('c2-split-button')
  await watch(host, 'change')
  await page.locator('main').evaluate((main) => main.addEventListener('menu-select', (event) => event.preventDefault(), { once: true }))
  await page.getByRole('button', { name: 'Choose merge method' }).click()
  await row(page, 'merge').click()
  await expect(page.getByRole('button', { name: 'Squash and merge', exact: true })).toBeVisible()
  await host.evaluate((element) => ((element as HTMLElement & { value: string }).value = 'merge'))
  await expect(page.getByRole('button', { name: 'Create a merge commit', exact: true })).toBeVisible()
  expect(await events(page)).toEqual([])
})

test('choice mode: an empty value takes the first enabled row', async ({ page, renderScenario }) => {
  await renderScenario(merge.replace(' value="squash"', '').replace('value="merge"', 'value="merge" disabled'))
  await expect(page.getByRole('button', { name: 'Squash and merge', exact: true })).toBeVisible()
  // The resolved choice is the value a binding reads.
  expect(await page.locator('c2-split-button').evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('squash')
  await watch(page.locator('c2-split-button'), 'action')
  await page.getByRole('button', { name: 'Squash and merge', exact: true }).click()
  expect(await events(page)).toEqual([{ value: 'squash' }])
})

test('toggle: the main half is pressed and flips on activation', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-split-button toggle label="Mute microphone" caret-label="Microphone settings">
    <svg slot="prefix-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"></circle></svg>
    <c2-menu-item slot="menu" type="radio" name="mic" value="builtin" checked>Built-in microphone</c2-menu-item>
  </c2-split-button>`)
  const main = page.getByRole('button', { name: 'Mute microphone' })
  await expect(main).toHaveAttribute('aria-pressed', 'false')
  await main.click()
  await expect(main).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('c2-split-button')).toHaveAttribute('selected', '')
  await expect(page.getByRole('button', { name: 'Microphone settings' })).toBeVisible()
  // Named as a group by its label.
  await expect(page.locator('c2-split-button')).toHaveHostAria('role', 'group')
  await accessible(page)
})

test('choice mode: renaming or disabling the chosen row in place updates the main half', async ({ page, renderScenario }) => {
  await renderScenario(merge.replace(' label="Squash and merge"', ''))
  await row(page, 'squash').evaluate((element) => (element.firstChild!.textContent = 'Squash & merge'))
  await expect(page.getByRole('button', { name: 'Squash & merge', exact: true })).toBeVisible()
  await row(page, 'squash').evaluate((element) => element.setAttribute('disabled', ''))
  await expect(page.getByRole('button', { name: 'Create a merge commit', exact: true })).toBeVisible()
})

test('the caret name follows the main text when it changes in place', async ({ page, renderScenario }) => {
  await renderScenario(send)
  await page.locator('c2-split-button').evaluate((element) => (element.firstChild!.textContent = 'Sending'))
  await expect(page.getByRole('button', { name: 'More Sending options' })).toBeVisible()
})

test('choice mode opens on the current choice inside another shadow root', async ({ page, renderScenario }) => {
  await renderScenario('<div id="outer"></div>')
  await page.locator('#outer').evaluate((outer, markup) => {
    outer.attachShadow({ mode: 'open' }).innerHTML = markup
  }, merge)
  const caret = page.getByRole('button', { name: 'Choose merge method' })
  await caret.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-menu-item[value="squash"]')).toBeFocused()
})

test('open set from code moves no focus, and a disabled control never stays open', async ({ page, renderScenario }) => {
  await renderScenario(send)
  const host = page.locator('c2-split-button')
  const before = page.getByRole('button', { name: 'Before' })
  await before.focus()
  await host.evaluate((element) => ((element as HTMLElement & { open: boolean }).open = true))
  await expect(row(page, 'schedule')).toBeVisible()
  await expect(before).toBeFocused()
  await host.evaluate((element) => ((element as HTMLElement & { disabled: boolean }).disabled = true))
  await expect(row(page, 'schedule')).toBeHidden()
  await expect(host).not.toHaveState('open')
  await host.evaluate((element) => ((element as HTMLElement & { open: boolean }).open = true))
  await expect(host).not.toHaveState('open')
  expect(await host.evaluate((element) => (element as HTMLElement & { open: boolean }).open)).toBe(false)
})

test('"false" attributes and a selected without toggle draw no state', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-split-button disabled="false" selected="false" toggle label="Mute">M<c2-menu-item slot="menu" value="a">A</c2-menu-item></c2-split-button>
  <c2-split-button id="plain" selected>Send<c2-menu-item slot="menu" value="a">A</c2-menu-item></c2-split-button>`)
  const host = page.locator('c2-split-button').first()
  await expect(host).toHaveCSS('opacity', '1')
  await expect(host).not.toHaveState('selected')
  await expect(page.locator('#plain')).not.toHaveState('selected')
  await expect(page.locator('#plain').locator('.main')).not.toHaveAttribute('aria-pressed')
})

test('show(), hide() and the open property drive the menu', async ({ page, renderScenario }) => {
  await renderScenario(send)
  const host = page.locator('c2-split-button')
  await watch(host, 'toggle')
  await host.evaluate((element) => (element as HTMLElement & { show(): void }).show())
  await expect(row(page, 'schedule')).toBeFocused()
  expect(await host.evaluate((element) => (element as HTMLElement & { open: boolean }).open)).toBe(true)
  await host.evaluate((element) => (element as HTMLElement & { hide(): void }).hide())
  await expect(row(page, 'schedule')).toBeHidden()
  await expect.poll(async () => (await events(page)).length).toBe(2)
})

test('the caret name follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${send}</div>`)
  await expect(page.getByRole('button', { name: 'Plus d’options : Send' })).toBeVisible()
  await page.locator('div[lang]').evaluate((element) => element.setAttribute('lang', 'en'))
  await expect(page.getByRole('button', { name: 'More Send options' })).toBeVisible()
})

test('clicking the caret does not bubble a click out of the host', async ({ page, renderScenario }) => {
  await renderScenario(send)
  await page.locator('c2-split-button').evaluate((element) => {
    element.setAttribute('data-clicks', '0')
    element.addEventListener('click', () => element.setAttribute('data-clicks', String(Number(element.getAttribute('data-clicks')) + 1)))
  })
  await page.getByRole('button', { name: 'More Send options' }).click()
  await expect(row(page, 'schedule')).toBeVisible()
  await expect(page.locator('c2-split-button')).toHaveAttribute('data-clicks', '0')
})
