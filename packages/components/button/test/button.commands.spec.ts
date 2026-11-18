import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'

const supportsCommands = (page: Page) => page.evaluate(() => 'commandForElement' in HTMLButtonElement.prototype)

/** Replaces the scenario with `html` once the button module is loaded, and records the `command` events of `#panel`. */
const render = async (page: Page, html: string) => {
  await page.locator('main').evaluate((main, markup) => {
    main.innerHTML = markup
    const log: string[] = []
    Object.assign(window, { commandLog: log })
    document.querySelector('#panel')?.addEventListener('command', (event) => {
      const { command, source } = event as CommandEvent
      log.push(`${command}:${source?.localName}`)
    })
  }, html)
  await page
    .locator('c2-button')
    .first()
    .evaluate((element) => (element as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete)
}
const commandLog = (page: Page) => page.evaluate(() => (window as unknown as { commandLog: string[] }).commandLog)

test('is opt-in: a plain button renders no command and no expanded state', async ({ page, scenario }) => {
  await scenario()
  const inner = page.locator('c2-button button')
  await expect(inner).not.toHaveAttribute('command')
  await expect(inner).not.toHaveAttribute('commandfor')
  await expect(inner).not.toHaveAttribute('aria-expanded')
  expect(await inner.evaluate((button: HTMLButtonElement) => button.commandForElement ?? null)).toBeNull()
})

for (const input of ['mouse', 'Enter', 'Space']) {
  test(`a custom command reaches its target as a command event with ${input}`, async ({ page, scenario }) => {
    await scenario()
    test.skip(!(await supportsCommands(page)), 'invoker commands (commandfor) are not supported by this browser')
    await render(page, '<c2-button commandfor="panel" command="--refresh">Refresh</c2-button><div id="panel">Panel</div>')
    const button = page.getByRole('button', { name: 'Refresh' })
    if (input === 'mouse') await button.click()
    else {
      await button.focus()
      await page.keyboard.press(input)
    }
    await expect.poll(() => commandLog(page)).toEqual(['--refresh:c2-button'])
  })
}

test('a built-in command opens a popover, and the target may be added after the button', async ({ page, scenario }) => {
  await scenario()
  test.skip(!(await supportsCommands(page)), 'invoker commands (commandfor) are not supported by this browser')
  await render(page, '<c2-button commandfor="tip" command="toggle-popover">Help</c2-button>')
  await page
    .locator('main')
    .evaluate((main) =>
      main.insertAdjacentElement('beforeend', Object.assign(document.createElement('div'), { id: 'tip', popover: 'auto', textContent: 'Tip' })),
    )
  await page.getByRole('button', { name: 'Help' }).click()
  await expect(page.locator('#tip')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#tip')).toBeHidden()
})

test('a disabled button or a submit button of a form sends no command', async ({ page, scenario }) => {
  await scenario()
  test.skip(!(await supportsCommands(page)), 'invoker commands (commandfor) are not supported by this browser')
  await render(
    page,
    `<c2-button commandfor="panel" command="--off" disabled>Off</c2-button>
    <form><c2-button type="submit" commandfor="panel" command="--submit">Send</c2-button></form>
    <div id="panel">Panel</div>`,
  )
  await page.locator('form').evaluate((form) => form.addEventListener('submit', (event) => event.preventDefault()))
  await page.getByRole('button', { name: 'Send' }).click()
  await page.locator('c2-button[disabled]').evaluate((element) => element.shadowRoot!.querySelector('button')!.click())
  expect(await commandLog(page)).toEqual([])
})

test('aria-haspopup reaches the inner button of a dialog invoker, without being written on the host', async ({ page, scenario }) => {
  await scenario()
  await render(page, '<c2-button commandfor="sheet" command="show-modal" aria-haspopup="dialog">Shortcuts</c2-button><dialog id="sheet">Sheet</dialog>')
  const inner = page.getByRole('button', { name: 'Shortcuts' })
  await expect(inner).toHaveAttribute('aria-haspopup', 'dialog')
  await page.locator('c2-button').evaluate((element) => element.removeAttribute('aria-haspopup'))
  await expect(page.locator('c2-button button')).not.toHaveAttribute('aria-haspopup')
})

test('aria-expanded and aria-controls reach the inner button, without being written on the host', async ({ page, scenario }) => {
  await scenario()
  await render(page, '<c2-button aria-expanded="false" aria-controls="panel">Filters</c2-button><div id="panel">Panel</div>')
  const host = page.locator('c2-button')
  const inner = page.getByRole('button', { name: 'Filters' })
  await expect(inner).toHaveAttribute('aria-expanded', 'false')
  // The id would not resolve across the shadow boundary: the inner button holds the element itself.
  await expect(page.locator('c2-button button')).not.toHaveAttribute('aria-controls', 'panel')
  const controls = () => page.locator('c2-button button').evaluate((button) => (button.ariaControlsElements ?? []).map((element) => element.id))
  if (await page.evaluate(() => 'ariaControlsElements' in Element.prototype)) await expect.poll(controls).toEqual(['panel'])

  await host.evaluate((element) => element.setAttribute('aria-expanded', 'true'))
  await expect(inner).toHaveAttribute('aria-expanded', 'true')
  await host.evaluate((element) => ((element as HTMLElement).ariaExpanded = 'false'))
  await expect(inner).toHaveAttribute('aria-expanded', 'false')
  // The property does not reflect: the host keeps only what the author wrote.
  await expect(host).toHaveAttribute('aria-expanded', 'true')
  await host.evaluate((element) => element.removeAttribute('aria-expanded'))
  await expect(page.locator('c2-button button')).not.toHaveAttribute('aria-expanded')

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('an invoker with expanded state has no axe violations', async ({ page, scenario }) => {
  await scenario()
  await render(
    page,
    '<c2-button commandfor="panel" command="--toggle" aria-expanded="false" aria-controls="panel">Filters</c2-button><div id="panel">Panel</div>',
  )
  await expect(page.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'false')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
