import { test, expect, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('header-content presence follows assignment, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const region = page.locator('c2-details').locator('[part="header-content"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-details label="Settings"><span slot="header-content" data-slot-presence-probe>Edit</span></c2-details>',
    host: 'c2-details',
    slot: 'header-content',
    assertPresent: async (present) => (present ? expect(region).toBeVisible() : expect(region).toBeHidden()),
  })
})
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Details } from '../src/details'

test('click and keyboard expand and collapse content', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  const summary = page.locator('summary')
  await expect(page.getByText('Arrives tomorrow')).not.toBeVisible()
  await summary.click()
  await expect(page.getByText('Arrives tomorrow')).toBeVisible()
  await summary.press('Enter')
  await expect(page.getByText('Arrives tomorrow')).not.toBeVisible()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
  await accessible(page)
})
test('disabled disclosure ignores pointer and keyboard activation', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Locked" disabled>Secret</c2-details>')
  await page.locator('summary').click()
  await page.locator('summary').press('Space')
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
})
test('interactive header content does not toggle the panel', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Settings"><button slot="header-content">Edit</button>Panel</c2-details>')
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
})

test('public parts style title, header content and body regions', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details expanded><span slot="title">Title</span><button slot="header-content">Edit</button><p>Body</p></c2-details>')
  await page.addStyleTag({
    content:
      'c2-details::part(title){background:rgb(1,2,3)}c2-details::part(header-content){background:rgb(4,5,6)}c2-details::part(body){background:rgb(7,8,9)}',
  })
  const host = page.locator('c2-details')
  await expect(host.locator('.c2-details-summary-content')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('.c2-details-header-content')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.c2-details-body')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
})

test('opens on the first activation while restored state is waiting to render', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  await page.locator('c2-details').evaluate((element) => {
    const details = element as Details
    details.expanded = true
    details.shadowRoot?.querySelector('summary')?.click()
  })
  await expect(page.getByText('Arrives tomorrow')).toBeVisible()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', true)
})

// The generated theme must leave the per-side border variables unset so they fall through to the shorthand.
const THEME_CSS = fileURLToPath(new URL('../../../tools/theme/dist/theme.css', import.meta.url))

test('the border shorthand reaches every side, with and without @c2n/theme, and a per-side variable still wins', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Frame">Body</c2-details>')
  const host = page.locator('c2-details')
  const frame = host.locator('.c2-details')
  const expectSides = async (sides: Record<'top' | 'right' | 'bottom' | 'left', string>) => {
    for (const [side, value] of Object.entries(sides)) {
      const [width, ...color] = value.split(' ')
      await expect(frame).toHaveCSS(`border-${side}-width`, width)
      await expect(frame).toHaveCSS(`border-${side}-color`, color.join(' '))
    }
  }
  const shorthand = '3px rgb(1, 2, 3)'

  await host.evaluate((element) => element.style.setProperty('--c2-details--border', '3px solid rgb(1, 2, 3)'))
  await expectSides({ top: shorthand, right: shorthand, bottom: shorthand, left: shorthand })

  test.skip(!existsSync(THEME_CSS), 'build @c2n/theme first (npm run build -w packages/tools/theme)')
  await page.addStyleTag({ path: THEME_CSS })
  await expectSides({ top: shorthand, right: shorthand, bottom: shorthand, left: shorthand })

  await host.evaluate((element) => element.style.setProperty('--c2-details--border-left', '5px solid rgb(4, 5, 6)'))
  await expectSides({ top: shorthand, right: shorthand, bottom: shorthand, left: '5px rgb(4, 5, 6)' })

  // Unset, the shorthand follows the theme token.
  await host.evaluate((element) => element.removeAttribute('style'))
  await page.addStyleTag({ content: ':root { --c2-theme--border: 2px solid rgb(7, 8, 9) }' })
  const themed = '2px rgb(7, 8, 9)'
  await expectSides({ top: themed, right: themed, bottom: themed, left: themed })
})
test('content rendered on toggle, after the panel began opening, still slides open without a jump', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Lazy" style="--c2-details--transition-duration: 400ms"></c2-details>')
  const heights = await page.locator('c2-details').evaluate(async (host) => {
    // As an app does: the content is rendered only once the panel says it opened.
    host.addEventListener('toggle', () => {
      const block = document.createElement('div')
      block.style.height = '200px'
      block.textContent = 'Rendered on open'
      host.append(block)
    })
    const content = host.shadowRoot!.querySelector<HTMLElement>('.c2-details-content')!
    // From the closed height, so an open that jumps straight to its end fails the steps below.
    const seen: number[] = [content.getBoundingClientRect().height]
    host.shadowRoot!.querySelector<HTMLElement>('summary')!.click()
    const until = performance.now() + 600
    while (performance.now() < until) {
      await new Promise(requestAnimationFrame)
      seen.push(content.getBoundingClientRect().height)
    }
    return seen
  })
  const steps = heights.slice(1).map((height, index) => height - heights[index])
  const end = heights.at(-1)!
  expect(end).toBeGreaterThan(200)
  // Without following the content, the panel stops at its padding and the content then lands in one frame: no height
  // between the two is ever drawn. Following it, the panel is seen part-way open (however long a slow machine takes
  // between two frames), and never shrinks on the way.
  expect(heights.some((height) => height > end * 0.25 && height < end * 0.75)).toBe(true)
  expect(Math.min(...steps)).toBeGreaterThanOrEqual(-1)
})
